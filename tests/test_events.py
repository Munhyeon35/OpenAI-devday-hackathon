import asyncio
import json

from fastapi.testclient import TestClient

from app.config import Settings
from app.main import create_app
from app.models import DispatchInput
from app.service import DispatchService
from app.store import Store
from tests.test_dispatch import payload, fake_gateway, live_config


def decode(event):
    return json.loads(event.split('data: ', 1)[1])


async def test_parallel_transcripts_push_updates_and_reconnect_snapshot_without_secrets():
    service = DispatchService(Settings(demo_delay=100), Store(':memory:'), None)
    job = service.create(DispatchInput.model_validate(payload()), 'stream-jobs')
    a,b = job['hospitals']
    stream = service.events.stream(service.recent, service.changed)
    snapshot = await anext(stream)
    assert snapshot.startswith('event: snapshot')
    assert 'stream_token' not in snapshot and 'stream_claimed' not in snapshot
    update = asyncio.create_task(anext(stream))
    await asyncio.to_thread(service.transcripts, job['id'], a['id'], [
        {'speaker':'assistant','text':'환자 ', 'start_ms':100,'end_ms':200},
        {'speaker':'hospital','text':'네', 'start_ms':150,'end_ms':250}])
    service.transcript(job['id'], b['id'], 'hospital', '다른 병원', 150, 250)
    result = decode(await asyncio.wait_for(update,1))['dispatches'][0]
    assert result['hospitals'][0]['transcript'][0]['text'] == '환자 '
    assert result['hospitals'][1]['transcript'][0]['text'] == '다른 병원'
    assert len({t['id'] for h in result['hospitals'] for t in h['transcript']}) == 3
    await stream.aclose()
    assert not service.events.listeners
    reconnected = service.events.stream(service.recent, service.changed)
    replay = decode(await anext(reconnected))['dispatches'][0]
    assert replay['hospitals'] == result['hospitals']
    await reconnected.aclose()
    await service.close()


def test_list_and_event_endpoints_require_operator_auth():
    app = create_app(live_config(), Store(':memory:'), fake_gateway())
    with TestClient(app) as client:
        assert client.get('/api/dispatches').status_code == 401
        assert client.get('/api/dispatches/events').status_code == 401
        assert client.get('/api/dispatches/missing/events').status_code == 401
        headers = {'Authorization':'Bearer operator-secret','Idempotency-Key':'list-auth-test'}
        job=client.post('/api/dispatches',json=payload(),headers=headers).json()
        response=client.get('/api/dispatches',headers=headers)
        assert response.status_code == 200
        assert response.json()['dispatches'][0]['id'] == job['id']
        assert 'stream_token' not in response.text
        assert client.get('/api/dispatches/missing/events',headers=headers).status_code == 404
