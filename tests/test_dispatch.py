import asyncio
import json
from unittest.mock import AsyncMock

import httpx
import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError
from twilio.request_validator import RequestValidator

from app.config import Settings
from app.main import create_app
from app.models import Decision, DispatchInput
from app.service import DispatchService
from app.store import Store
from app.telephony import TwilioGateway


def payload():
    return {"patient": {"name": "테스트", "age": 42, "condition": "오른쪽 다리 부상", "location": "서울시청"},
            "hospitals": [{"name": "A", "phone": "02-000-0001", "eta_minutes": 10},
                          {"name": "B", "phone": "+82 2 000 0002", "eta_minutes": 20}]}


def live_config(**overrides):
    return Settings(mode="live", twilio_sid="ACtest", twilio_token="twilio-secret",
                    public_base_url="https://calls.example.com", operator_token="operator-secret",
                    **overrides)


def fake_gateway():
    gateway = AsyncMock()
    gateway.dial.side_effect = lambda jid, h: "CA" + h["id"]
    return gateway


def accepted(quote="네, 이 환자를 수용 가능합니다."):
    return {"availability": "accepted", "reason": "담당자가 수용 확답", "evidence_quote": quote,
            "respondent": "응급실 간호사", "explicit_confirmation": True, "patient_context_confirmed": True}


@pytest.mark.parametrize("change", [
    lambda p: p["hospitals"].clear(),
    lambda p: p["hospitals"].append(p["hospitals"][0]),
    lambda p: p["hospitals"][1].update(phone="+8220000001"),
    lambda p: p["hospitals"][0].update(phone="119"),
    lambda p: p["hospitals"][0].update(eta_minutes=0),
    lambda p: p["patient"].update(age=-1),
    lambda p: p["patient"].update(name=" "),
])
def test_input_validation(change):
    p = payload()
    change(p)
    with pytest.raises(ValidationError):
        DispatchInput.model_validate(p)


async def test_single_number_calls_once_and_completes():
    p = payload()
    p["hospitals"].pop()
    gateway = fake_gateway()
    service = DispatchService(live_config(), Store(":memory:"), gateway)
    job = service.create(DispatchInput.model_validate(p), "single-test-call")
    await asyncio.gather(*service.tasks)
    gateway.dial.assert_awaited_once()
    hospital = job["hospitals"][0]
    service.call_status(job["id"], hospital["id"], "no-answer")
    assert service.hospital(job["id"], hospital["id"])["result"]["availability"] == "unknown"
    await service.close()


async def test_parallel_calls_idempotency_and_independent_failure():
    store = Store(":memory:")
    config = live_config()
    started = []
    both_started = asyncio.Event()
    gateway = fake_gateway()

    async def dial(jid, h):
        started.append(h["name"])
        if len(started) == 2:
            both_started.set()
        await asyncio.wait_for(both_started.wait(), 1)
        if h["name"] == "A":
            raise RuntimeError("provider failure")
        return "CAsecond"

    gateway.dial.side_effect = dial
    service = DispatchService(config, store, gateway)
    data = DispatchInput.model_validate(payload())
    job = service.create(data, "unique-key")
    assert service.create(data, "unique-key")["id"] == job["id"]
    await asyncio.gather(*service.tasks)
    a, b = store.get(job["id"])["hospitals"]
    assert set(started) == {"A", "B"}
    assert a["result"]["availability"] == "unknown"
    assert not a["hangup_pending"]
    assert b["result"] is None and b["call_sid"] == "CAsecond"
    data.patient.name = "다른 환자"
    with pytest.raises(ValueError):
        service.create(data, "unique-key")
    await service.close()


async def test_decision_requires_evidence_from_correct_hospital_and_confirmation():
    store = Store(":memory:")
    service = DispatchService(Settings(demo_delay=100), store, None)
    job = service.create(DispatchInput.model_validate(payload()), "key-12345")
    a, b = job["hospitals"]
    service.transcript(job["id"], a["id"], "hospital", accepted()["evidence_quote"])
    with pytest.raises(ValueError):
        service.record_decision(job["id"], b["id"], accepted())
    with pytest.raises(ValidationError):
        service.record_decision(job["id"], a["id"], {**accepted(), "explicit_confirmation": False})
    service.record_decision(job["id"], a["id"], accepted())
    service.call_status(job["id"], a["id"], "completed")
    assert service.hospital(job["id"], a["id"])["result"]["availability"] == "accepted"
    service.call_status(job["id"], b["id"], "busy")
    service.call_status(job["id"], b["id"], "ringing")
    assert service.hospital(job["id"], b["id"])["call_status"] == "busy"
    assert service.hospital(job["id"], b["id"])["result"]["availability"] == "unknown"
    await service.close()


async def test_cancel_during_rest_request_hangs_up_late_created_call():
    gate = asyncio.Event()
    gateway = fake_gateway()

    async def dial(jid, h):
        await gate.wait()
        return "CA" + h["id"]

    gateway.dial.side_effect = dial
    service = DispatchService(live_config(), Store(":memory:"), gateway)
    job = service.create(DispatchInput.model_validate(payload()), "key-cancel")
    await asyncio.sleep(0)
    await service.cancel(job["id"])
    gate.set()
    await asyncio.gather(*service.tasks)
    for h in service.store.get(job["id"])["hospitals"]:
        assert h["result"]["availability"] == "unknown"
        assert h["hangup_pending"] and h["call_sid"]
        service.patch(job["id"], h["id"], hangup_after=0)
        await service.maintain_hospital(job, service.hospital(job["id"], h["id"]))
    assert gateway.hangup.await_count == 2
    await service.close()


async def test_webhook_retry_is_durable_and_preserves_result(tmp_path):
    store = Store(str(tmp_path / "test.sqlite3"))
    config = live_config(backbed_url="https://backend.example.com/results", backbed_token="receiver-token")
    service = DispatchService(config, store, fake_gateway())
    job = service.create(DispatchInput.model_validate(payload()), "key-deliver")
    await asyncio.gather(*service.tasks)
    h = job["hospitals"][0]
    service.finish_unknown(job["id"], h["id"], "no answer")
    requests = []

    def handler(request):
        requests.append(request)
        return httpx.Response(503 if len(requests) == 1 else 200)

    await service.http.aclose()
    service.http = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    await service.deliver(job, service.hospital(job["id"], h["id"]))
    assert service.hospital(job["id"], h["id"])["delivery"]["status"] == "pending"
    await service.deliver(job, service.hospital(job["id"], h["id"]))
    saved = service.hospital(job["id"], h["id"])
    assert saved["delivery"]["status"] == "delivered"
    assert requests[0].headers["Idempotency-Key"] == requests[1].headers["Idempotency-Key"]
    assert requests[0].headers["Authorization"] == "Bearer receiver-token"
    assert json.loads(requests[0].content)["result"]["availability"] == "unknown"
    await service.close()
    store.close()
    reopened = Store(str(tmp_path / "test.sqlite3"))
    assert reopened.get(job["id"])["hospitals"][0]["delivery"]["status"] == "delivered"
    reopened.close()


def test_demo_api_e2e_and_no_secret_exposure():
    with TestClient(create_app(Settings(demo_delay=.01), Store(":memory:"))) as client:
        assert client.get("/").status_code == 200
        response = client.post("/api/dispatches", json=payload(), headers={"Idempotency-Key": "api-demo-test"})
        assert response.status_code == 202
        jid = response.json()["id"]
        import time
        for _ in range(100):
            job = client.get(f"/api/dispatches/{jid}").json()
            if job["status"] == "completed":
                break
            time.sleep(.01)
        assert [h["result"]["availability"] for h in job["hospitals"]] == ["accepted", "rejected"]
        assert "stream_token" not in json.dumps(job)
        assert job["mode"] == "demo"
        assert client.post("/api/dispatches", json=payload()).status_code == 422


def test_twilio_signatures_and_call_binding():
    config = live_config()
    app = create_app(config, Store(":memory:"), fake_gateway())
    auth = {"Authorization": "Bearer operator-secret", "Idempotency-Key": "api-live-test"}
    with TestClient(app) as client:
        assert client.post("/api/dispatches", json=payload()).status_code == 401
        job = client.post("/api/dispatches", json=payload(), headers=auth).json()
        h = job["hospitals"][0]
        path = f"/twilio/{job['id']}/{h['id']}/voice"
        data = {"AccountSid": "ACtest", "CallSid": "CA" + h["id"]}
        assert client.post(path, data=data).status_code == 403
        signature = RequestValidator(config.twilio_token).compute_signature(config.public_base_url + path, data)
        response = client.post(path, data=data, headers={"X-Twilio-Signature": signature})
        assert response.status_code == 200
        assert '<Connect><Stream url="wss://calls.example.com/twilio/media"' in response.text
        data["CallSid"] = "CAwrong"
        signature = RequestValidator(config.twilio_token).compute_signature(config.public_base_url + path, data)
        assert client.post(path, data=data, headers={"X-Twilio-Signature": signature}).status_code == 404


async def test_twilio_rest_form_and_call_time_limit():
    config = live_config(twilio_from="+12025550123")
    gateway = TwilioGateway(config)
    await gateway.http.aclose()
    requests = []

    def handler(request):
        requests.append(request)
        return httpx.Response(201, json={"sid": "CAnew"})

    gateway.http = httpx.AsyncClient(base_url="https://api.twilio.com/2010-04-01/Accounts/ACtest", transport=httpx.MockTransport(handler))
    assert await gateway.dial("job", {"id": "hospital", "phone": "+8220000001"}) == "CAnew"
    from urllib.parse import parse_qs
    body = parse_qs(requests[0].content.decode())
    assert requests[0].url.path == "/2010-04-01/Accounts/ACtest/Calls.json"
    assert body["StatusCallbackEvent"] == ["initiated", "ringing", "answered", "completed"]
    assert body["TimeLimit"] == ["180"]
    await gateway.close()


async def test_restart_finalizes_incomplete_job_and_timeout_never_means_rejection(tmp_path):
    store = Store(str(tmp_path / "restart.sqlite3"))
    service = DispatchService(Settings(demo_delay=100), store, None)
    job = service.create(DispatchInput.model_validate(payload()), "restart-key")
    for task in list(service.tasks):
        task.cancel()
    await asyncio.gather(*service.tasks, return_exceptions=True)
    await service.http.aclose()
    store.close()
    store = Store(str(tmp_path / "restart.sqlite3"))
    restarted = DispatchService(Settings(), store, None)
    await restarted.start()
    assert all(h["result"]["availability"] == "unknown" for h in store.get(job["id"])["hospitals"])
    await restarted.close()


async def test_watchdog_and_cancellation_before_dial():
    gateway = fake_gateway()
    service = DispatchService(live_config(), Store(":memory:"), gateway)
    job = service.create(DispatchInput.model_validate(payload()), "pre-cancel")
    await service.cancel(job["id"])
    await asyncio.gather(*service.tasks)
    gateway.dial.assert_not_called()
    assert not any(h["hangup_pending"] for h in service.store.get(job["id"])["hospitals"])
    job = service.create(DispatchInput.model_validate(payload()), "watchdog-test")
    await asyncio.gather(*service.tasks)
    expired = {**job, "started_at": 0}
    for h in job["hospitals"]:
        await service.maintain_hospital(expired, h)
    assert all(h["result"]["availability"] == "unknown" for h in service.store.get(job["id"])["hospitals"])
    await service.close()


def test_media_signature_token_binding_and_replay(monkeypatch):
    from starlette.websockets import WebSocketDisconnect
    calls = []

    async def fake_run(bridge):
        calls.append((bridge.job_id, bridge.hospital_id))
        await bridge.twilio.send_json({"test": "connected"})
        await bridge.twilio.close()

    monkeypatch.setattr("app.main.LiveBridge.run", fake_run)
    config = live_config()
    app = create_app(config, Store(":memory:"), fake_gateway())
    auth = {"Authorization": "Bearer operator-secret", "Idempotency-Key": "media-test-key"}
    validator = RequestValidator(config.twilio_token)
    signature = validator.compute_signature(config.public_base_url + "/twilio/media", {})
    headers = {"X-Twilio-Signature": signature}
    with TestClient(app) as client:
        job = client.post("/api/dispatches", json=payload(), headers=auth).json()
        h = app.state.service.hospital(job["id"], job["hospitals"][0]["id"])
        with pytest.raises(WebSocketDisconnect):
            with client.websocket_connect("/twilio/media"):
                pass
        start = {"event": "start", "start": {"streamSid": "MZtest", "accountSid": "ACtest",
                  "callSid": "CA" + h["id"], "customParameters": {"job_id": job["id"], "hospital_id": h["id"], "token": "wrong"},
                  "mediaFormat": {"encoding": "audio/x-mulaw", "sampleRate": 8000, "channels": 1}}}
        with client.websocket_connect("/twilio/media", headers=headers) as ws:
            ws.send_json(start)
            with pytest.raises(WebSocketDisconnect):
                ws.receive_json()
        assert calls == []
        start["start"]["customParameters"]["token"] = h["stream_token"]
        with client.websocket_connect("/twilio/media", headers=headers) as ws:
            ws.send_json({"event": "connected"})
            ws.send_json(start)
            assert ws.receive_json() == {"test": "connected"}
        assert calls == [(job["id"], h["id"])]
        with client.websocket_connect("/twilio/media", headers=headers) as ws:
            ws.send_json(start)
            with pytest.raises(WebSocketDisconnect):
                ws.receive_json()
