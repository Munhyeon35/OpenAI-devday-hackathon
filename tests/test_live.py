import asyncio
import json

from app.config import Settings
from app.live import LiveBridge, session_start
from app.models import DispatchInput
from app.service import DispatchService
from app.store import Store
from tests.test_dispatch import accepted, payload


class Socket:
    def __init__(self):
        self.incoming = asyncio.Queue()
        self.sent = []
        self.closed = False

    async def send(self, raw):
        event = json.loads(raw)
        self.sent.append(event)
        if event["type"] == "session.start":
            await self.incoming.put({"type": "session.started", "session": {"id": "live-test"}})
        if event["type"] == "session.close":
            await self.incoming.put({"type": "session.closed"})

    async def send_json(self, event):
        self.sent.append(event)

    async def receive_json(self):
        return await self.incoming.get()

    async def recv(self):
        return json.dumps(await self.incoming.get())

    def __aiter__(self):
        return self

    async def __anext__(self):
        return await self.recv()

    async def close(self):
        self.closed = True


class Connection:
    def __init__(self, socket):
        self.socket = socket

    async def __aenter__(self):
        return self.socket

    async def __aexit__(self, *args):
        pass


async def wait_until(predicate):
    async with asyncio.timeout(2):
        while not predicate():
            await asyncio.sleep(.005)


async def test_bridge_handshake_audio_delegation_result_and_shutdown():
    config = Settings(demo_delay=100)
    service = DispatchService(config, Store(":memory:"), None)
    job = service.create(DispatchInput.model_validate(payload()), "bridge-test")
    h = job["hospitals"][0]
    twilio, live = Socket(), Socket()
    bridge = LiveBridge(config, service, twilio, job["id"], h["id"], "MZtest", connector=lambda *a, **kw: Connection(live))
    task = asyncio.create_task(bridge.run())
    await twilio.incoming.put({"event": "media", "streamSid": "MZtest", "media": {"payload": "/w=="}})
    await wait_until(lambda: any(e["type"] == "session.input_audio.append" for e in live.sent))
    assert live.sent[0]["type"] == "session.start"
    assert live.sent[0]["session"]["model"] == "gpt-live-1"
    assert live.sent[0]["session"]["audio"]["format"] == {"type": "audio/pcmu", "rate": 8000}
    await live.incoming.put({"type": "session.output_audio.delta", "delta": "/w=="})
    await live.incoming.put({"type": "session.input_transcript.delta", "delta": accepted()["evidence_quote"], "start_ms": 10, "end_ms": 200})
    await live.incoming.put({"type": "response.event", "delegation_id": "d1", "event": {
        "type": "response.output_item.done", "item": {"type": "function_call", "name": "record_hospital_decision",
                                                     "call_id": "tool-1", "arguments": json.dumps(accepted())}}})
    await live.incoming.put({"type": "response.event", "delegation_id": "d1", "event": {"type": "response.completed", "response": {"output": []}}})
    await wait_until(lambda: service.hospital(job["id"], h["id"])["result"] is not None)
    assert service.hospital(job["id"], h["id"])["result"]["availability"] == "accepted"
    assert service.hospital(job["id"], job["hospitals"][1]["id"])["result"] is None
    assert twilio.sent[0] == {"event": "media", "streamSid": "MZtest", "media": {"payload": "/w=="}}
    assert any(e["type"] == "response.item.create" and e["item"]["call_id"] == "tool-1" for e in live.sent)
    assert any(e["type"] == "response.create" for e in live.sent)
    await twilio.incoming.put({"event": "stop", "streamSid": "MZtest"})
    await asyncio.wait_for(task, 2)
    assert twilio.closed
    assert live.sent[-1]["type"] == "session.close"
    await service.close()


async def test_invalid_tool_result_is_returned_for_clarification_without_acceptance():
    config = Settings(demo_delay=100)
    service = DispatchService(config, Store(":memory:"), None)
    job = service.create(DispatchInput.model_validate(payload()), "invalid-tool")
    h = job["hospitals"][0]
    bridge = LiveBridge(config, service, Socket(), job["id"], h["id"], "MZtest")
    bridge.live = Socket()
    await bridge.process_event({"type": "response.event", "delegation_id": "d1", "event": {
        "type": "response.output_item.done", "item": {"type": "function_call", "name": "record_hospital_decision",
                                                     "call_id": "bad-tool", "arguments": json.dumps(accepted())}}})
    await bridge.process_event({"type": "response.event", "delegation_id": "d1", "event": {"type": "response.completed"}})
    assert service.hospital(job["id"], h["id"])["result"] is None
    assert json.loads(bridge.live.sent[0]["item"]["output"])["saved"] is False
    await service.close()
