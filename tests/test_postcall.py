import asyncio
import json
from unittest.mock import AsyncMock

import httpx
import pytest

from app.models import DispatchInput
from app.service import DispatchService
from app.store import Store
from tests.test_dispatch import payload, accepted, fake_gateway, live_config
from tests.test_live import wait_until


async def make_service(config=None, store=None):
    service = DispatchService(config or live_config(), store or Store(':memory:'), fake_gateway())
    job = service.create(DispatchInput.model_validate(payload()), 'postcall')
    await asyncio.gather(*service.tasks)
    h = job['hospitals'][0]
    service.patch(job['id'], h['id'], stream_claimed=True, call_status='in-progress')
    service.transcript(job['id'], h['id'], 'hospital', accepted()['evidence_quote'])
    return service, job, h


async def test_hangup_precedes_slow_analysis_and_delivery(monkeypatch):
    service, job, h = await make_service(live_config(backbed_url='https://backend.example/result'))
    started, release = asyncio.Event(), asyncio.Event()
    async def classify(*args):
        service.gateway.hangup.assert_awaited_once()
        assert service.hospital(job['id'], h['id'])['call_status'] == 'completed'
        started.set()
        await release.wait()
        return accepted()
    monkeypatch.setattr('app.service.classify', classify)
    service.deliver = AsyncMock()
    service.end_voice(job['id'], h['id'], ready=False)
    await service.maintain_hospital(job, service.hospital(job['id'], h['id']))
    assert not started.is_set()
    service.end_voice(job['id'], h['id'])
    await service.maintain_hospital(job, service.hospital(job['id'], h['id']))
    await asyncio.wait_for(started.wait(), 1)
    assert service.hospital(job['id'], h['id'])['result'] is None
    service.deliver.assert_not_called()
    # Late completed callback must not race an unknown result over classification.
    service.call_status(job['id'], h['id'], 'completed')
    assert service.hospital(job['id'], h['id'])['result'] is None
    release.set()
    await wait_until(lambda: service.hospital(job['id'], h['id'])['result'] is not None)
    await service.maintain_hospital(job, service.hospital(job['id'], h['id']))
    service.deliver.assert_awaited_once()
    await service.close()


async def test_completed_callback_waits_for_bridge_caption_drain(monkeypatch):
    service, job, h = await make_service()
    classify = AsyncMock(return_value=accepted())
    monkeypatch.setattr('app.service.classify', classify)
    service.call_status(job['id'], h['id'], 'completed')
    await service.maintain_hospital(job, service.hospital(job['id'], h['id']))
    classify.assert_not_called()
    assert service.hospital(job['id'], h['id'])['result'] is None
    service.end_voice(job['id'], h['id'])
    await service.maintain_hospital(job, service.hospital(job['id'], h['id']))
    await wait_until(lambda: service.hospital(job['id'], h['id'])['result'] is not None)
    assert service.hospital(job['id'], h['id'])['result']['availability'] == 'accepted'
    await service.close()


@pytest.mark.parametrize('invalid', [False, True])
async def test_analysis_retries_then_unavailable_never_fabricates_acceptance(monkeypatch, invalid):
    service, job, h = await make_service()
    classify = AsyncMock(return_value=accepted('병원에서 하지 않은 말')) if invalid else AsyncMock(side_effect=RuntimeError('outage'))
    monkeypatch.setattr('app.service.classify', classify)
    service.end_voice(job['id'], h['id'])
    for _ in range(3):
        await service.process_postcall(job['id'], h['id'])
    result = service.hospital(job['id'], h['id'])
    assert result['result']['availability'] == 'rejected'
    assert result['postcall']['status'] == 'failed'
    assert not result['result']['explicit_confirmation']
    await service.close()


async def test_postcall_recovers_from_restart_without_redial(tmp_path, monkeypatch):
    path = str(tmp_path / 'recover.sqlite3')
    service, job, h = await make_service(store=Store(path))
    service.end_voice(job['id'], h['id'], ready=False)
    service.patch(job['id'], h['id'], postcall={'status':'running', 'ready':False, 'attempts':1, 'next_attempt':0})
    await service.close()
    service.store.close()
    restored = DispatchService(live_config(), Store(path), fake_gateway())
    monkeypatch.setattr('app.service.classify', AsyncMock(return_value=accepted()))
    await restored.start()
    await wait_until(lambda: restored.hospital(job['id'], h['id'])['result'] is not None)
    result = restored.hospital(job['id'], h['id'])
    assert result['result']['availability'] == 'accepted'
    assert result['postcall']['attempts'] == 2
    restored.gateway.dial.assert_not_called()
    await restored.close()


async def test_structured_responses_contract_and_refusal():
    from app.postcall import classify
    requests = []
    def handler(request):
        requests.append(json.loads(request.content))
        return httpx.Response(200, json={'status':'completed', 'output':[
            {'type':'message', 'content':[{'type':'output_text', 'text':json.dumps(accepted())}]}]})
    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        result = await classify(client, live_config(), {'patient':payload()['patient']},
                                {**payload()['hospitals'][0], 'transcript':[]})
    assert result['availability'] == 'accepted'
    assert requests[0]['store'] is False
    assert requests[0]['text']['format']['strict'] is True
    assert requests[0]['text']['format']['schema']['additionalProperties'] is False
    assert requests[0]['text']['format']['schema']['properties']['availability']['enum'] == [
        'accepted', 'rejected']
    async with httpx.AsyncClient(transport=httpx.MockTransport(lambda r: httpx.Response(200, json={
        'status':'completed', 'output':[{'type':'message', 'content':[{'type':'refusal', 'refusal':'no'}]}]}))) as client:
        with pytest.raises(ValueError):
            await classify(client, live_config(), {'patient':payload()['patient']},
                           {**payload()['hospitals'][0], 'transcript':[]})


def test_conversation_turns_preserve_interruption_and_exact_quotes():
    from app.postcall import conversation_turns
    fragments = [
        {'speaker':'assistant', 'text':'이 환자 지금 출발하면', 'start_ms':28000, 'end_ms':28600},
        {'speaker':'assistant', 'text':'그럼 수용 확답 맞습니까?', 'start_ms':29800, 'end_ms':35800},
        {'speaker':'hospital', 'text':'네,', 'start_ms':29200, 'end_ms':29800},
        {'speaker':'hospital', 'text':'됩니다.', 'start_ms':29800, 'end_ms':30400},
        {'speaker':'hospital', 'text':'네,네 맞아요', 'start_ms':39000, 'end_ms':40000},
    ]
    turns = conversation_turns(fragments)
    assert [(t['speaker'],t['text']) for t in turns] == [
        ('assistant','이 환자 지금 출발하면'), ('hospital','네,됩니다.'),
        ('assistant','그럼 수용 확답 맞습니까?'), ('hospital','네,네 맞아요')]
    untimed = [{'speaker':s,'text':t} for s,t in [
        ('assistant','수용 가능합니까?'),('hospital','네'),('assistant','감사합니다')]]
    assert len(conversation_turns(untimed)) == 3


async def test_contextual_short_answer_can_be_grounded_without_formal_staff_title():
    service, job, h = await make_service()
    service.transcript(job['id'], h['id'], 'assistant', '이 환자 십오 분 뒤 도착 시 수용 가능합니까?')
    service.transcript(job['id'], h['id'], 'hospital', '네,네 맞아요')
    decision = {**accepted('네,네 맞아요'), 'respondent':'병원 응답자(직책 미확인)'}
    service.record_decision(job['id'], h['id'], decision)
    assert service.hospital(job['id'], h['id'])['result']['availability'] == 'accepted'
    await service.close()


async def test_full_call_including_early_context_reaches_classifier_after_2000_fragments():
    from app.postcall import classify
    service, job, h = await make_service()
    opening = service.hospital(job['id'], h['id'])['transcript'][0]['text']
    fragments = [{'speaker':'assistant', 'text':f'조각{i} ', 'start_ms':i*200, 'end_ms':i*200+200}
                 for i in range(2005)]
    fragments.append({'speaker':'hospital', 'text':'최종적으로 수용 가능합니다.',
                      'start_ms':402000, 'end_ms':403000})
    service.transcripts(job['id'], h['id'], fragments)
    hospital = service.hospital(job['id'], h['id'])
    assert len(hospital['transcript']) == 2007
    assert hospital['transcript'][0]['text'] == opening
    requests = []
    def handler(request):
        requests.append(json.loads(request.content))
        return httpx.Response(200, json={'status':'completed', 'output':[
            {'type':'message', 'content':[{'type':'output_text', 'text':json.dumps(accepted())}]}]})
    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        await classify(client, live_config(), job, hospital)
    conversation = json.loads(requests[0]['input'])['conversation']
    for speaker in ('hospital', 'assistant'):
        assert ''.join(t['text'] for t in conversation if t['speaker']==speaker) == ''.join(
            f['text'] for f in hospital['transcript'] if f['speaker']==speaker)
    assert conversation[-1]['text'] == '최종적으로 수용 가능합니다.'
    await service.close()


def test_binary_policy_rejects_ambiguity_without_fabricating_confirmation():
    from app.models import Decision
    from pydantic import ValidationError
    unresolved = {'availability':'rejected', 'reason':'수용 확답 없음', 'evidence_quote':'',
                  'respondent':'', 'explicit_confirmation':False, 'patient_context_confirmed':False}
    assert Decision.model_validate(unresolved).availability == 'rejected'
    for status in ('accepted', 'unknown'):
        with pytest.raises(ValidationError):
            Decision.model_validate({**unresolved, 'availability':status})


async def test_legacy_unknown_is_binary_in_api_and_delivery_without_rewriting_evidence():
    service, job, h = await make_service()
    legacy = {'availability':'unknown', 'reason':'조건 미해결', 'evidence_quote':'',
              'respondent':'', 'explicit_confirmation':False, 'patient_context_confirmed':False,
              'event_id':'legacy-event', 'confirmed_at':'2026-10-09T00:00:00Z'}
    service.patch(job['id'], h['id'], result=legacy)
    stored_job = service.store.get(job['id'])
    assert service.public(stored_job)['hospitals'][0]['result']['availability'] == 'rejected'
    assert service.delivery_payload(stored_job, stored_job['hospitals'][0])['result']['availability'] == 'rejected'
    assert service.record_decision(job['id'], h['id'], {})['result']['availability'] == 'rejected'
    assert service.hospital(job['id'], h['id'])['result'] == legacy
    await service.close()
