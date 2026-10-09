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
async def test_analysis_retries_then_unknown_never_fabricates_acceptance(monkeypatch, invalid):
    service, job, h = await make_service()
    classify = AsyncMock(return_value=accepted('병원에서 하지 않은 말')) if invalid else AsyncMock(side_effect=RuntimeError('outage'))
    monkeypatch.setattr('app.service.classify', classify)
    service.end_voice(job['id'], h['id'])
    for _ in range(3):
        await service.process_postcall(job['id'], h['id'])
    result = service.hospital(job['id'], h['id'])
    assert result['result']['availability'] == 'unknown'
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
    async with httpx.AsyncClient(transport=httpx.MockTransport(lambda r: httpx.Response(200, json={
        'status':'completed', 'output':[{'type':'message', 'content':[{'type':'refusal', 'refusal':'no'}]}]}))) as client:
        with pytest.raises(ValueError):
            await classify(client, live_config(), {'patient':payload()['patient']},
                           {**payload()['hospitals'][0], 'transcript':[]})
