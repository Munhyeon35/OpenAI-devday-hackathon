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


async def test_bridge_closes_before_postcall_and_drains_final_transcript():
    config = Settings(demo_delay=100)
    service = DispatchService(config, Store(":memory:"), None)
    job = service.create(DispatchInput.model_validate(payload()), "bridge-test")
    h = job["hospitals"][0]
    twilio, live = Socket(), Socket()
    original_send = live.send

    async def send(raw):
        if json.loads(raw)["type"] == "session.close":
            assert twilio.closed  # The caller never waits for final captions.
            await live.incoming.put({"type": "session.input_transcript.delta", "delta": "최종 답변"})
        await original_send(raw)
    live.send = send
    bridge = LiveBridge(config, service, twilio, job["id"], h["id"], "MZtest", connector=lambda *a, **kw: Connection(live))
    bridge.greeting_wait_seconds = .01
    task = asyncio.create_task(bridge.run())
    await twilio.incoming.put({"event": "media", "media": {"payload": "/w=="}})
    await wait_until(lambda: any(e["type"] == "session.input_audio.append" for e in live.sent))
    assert live.sent[0]["session"]["delegation"] == {"type": "client"}
    assert live.sent[0]["session"]["model"] == "gpt-live-1"
    await wait_until(lambda: bridge.opening_released)
    assert not task.done()
    await live.incoming.put({"type": "session.output_audio.delta", "delta": "/w=="})
    await wait_until(lambda: len(twilio.sent) == 2)
    await twilio.incoming.put({"event": "mark", "mark": twilio.sent[1]["mark"]})
    await live.incoming.put({"type": "session.delegation.created", "delegation": {"target": "client", "id": "end1"}})
    await asyncio.wait_for(task, 2)
    h = service.hospital(job["id"], h["id"])
    assert twilio.closed and h["result"] is None
    assert h["postcall"]["ready"] and h["phase"] == "processing"
    assert h["transcript"][-1]["text"] == "최종 답변"
    await service.close()


async def test_barge_in_flushes_queues_drops_old_marks_and_keeps_input_streaming():
    import base64
    from app.audio import SpeechGate
    class Detector:
        def is_speech(self, pcm, rate):
            return pcm != bytes(len(pcm))
    service = DispatchService(Settings(demo_delay=100), Store(":memory:"), None)
    job = service.create(DispatchInput.model_validate(payload()), "interrupt")
    h = job["hospitals"][0]
    twilio, live = Socket(), Socket()
    bridge = LiveBridge(service.config, service, twilio, job["id"], h["id"], "MZtest")
    bridge.live = live
    bridge.opening_released = True
    bridge.gate = SpeechGate(Detector())
    outgoing = base64.b64encode(bytes([255]) * 160 * 30).decode()
    await bridge.process_event({"type": "session.output_audio.delta", "delta": outgoing})
    tasks = [asyncio.create_task(bridge.play_audio()), asyncio.create_task(bridge.receive_twilio()),
             asyncio.create_task(bridge.send_audio())]
    await wait_until(lambda: bool(bridge.pending_marks))
    old_mark = next(iter(bridge.pending_marks))
    speech = base64.b64encode(bytes([100]) * 960).decode()
    await twilio.incoming.put({"event": "media", "media": {"payload": speech}})
    await wait_until(lambda: bridge.gate.active)
    assert not any(e.get("event") == "clear" for e in twilio.sent)
    await bridge.process_event({"type": "session.input_transcript.delta", "delta": "잠깐요", "start_ms": 0, "end_ms": 120})
    await wait_until(lambda: any(e.get("event") == "clear" for e in twilio.sent))
    assert bridge.output.empty() and not bridge.pending_marks and bridge.gate.active
    count = len(twilio.sent)
    await bridge.process_event({"type": "session.output_audio.delta", "delta": outgoing})
    await asyncio.sleep(.05)
    assert len(twilio.sent) > count  # Noise/VAD cannot mute subsequent model audio.
    assert twilio.sent[-2]['media']['payload'] == outgoing
    count = len(twilio.sent)
    assert any(e.get("audio") == speech for e in live.sent)
    assert not any(e["type"] == "session.instructions.append" for e in live.sent)
    # A clear acknowledgement must not acknowledge any new-generation audio.
    bridge.pending_marks.add("1:new")
    await twilio.incoming.put({"event": "mark", "mark": {"name": old_mark}})
    silence = base64.b64encode(bytes([255]) * 3200).decode()
    await twilio.incoming.put({"event": "media", "media": {"payload": silence}})
    await wait_until(lambda: not bridge.gate.active)
    assert "1:new" in bridge.pending_marks
    await bridge.process_event({"type": "session.output_audio.delta", "delta": "/w=="})
    await wait_until(lambda: len(twilio.sent) > count)
    for task in tasks:
        task.cancel()
    await asyncio.gather(*tasks, return_exceptions=True)
    await service.close()


def test_vad_decodes_pcmu_and_uses_audio_not_network_time():
    from app.audio import SpeechGate, decode_mulaw
    assert decode_mulaw(255) == 0 and decode_mulaw(127) == 0
    assert decode_mulaw(0) == -32124 and decode_mulaw(128) == 32124
    class Detector:
        def is_speech(self, pcm, rate):
            assert rate == 8000 and len(pcm) == 320
            return pcm != bytes(320)
    gate = SpeechGate(Detector())
    assert not gate.feed(bytes([100]) * 159)
    assert not gate.feed(bytes([100]) * 161)
    assert not gate.feed(bytes([100]) * 160)
    assert gate.feed(bytes([100]) * 480)
    gate.feed(bytes([255]) * 3040)
    assert gate.active
    gate.feed(bytes([255]) * 160)
    assert not gate.active
    # Actual WebRTC detector: digital silence must never interrupt.
    assert not SpeechGate().feed(bytes([255]) * 8000)


async def test_silent_caller_gets_one_greeting_after_wait_without_closing_call():
    from unittest.mock import Mock
    service = Mock()
    bridge = LiveBridge(Settings(), service, Socket(), 'job', 'hospital', 'stream')
    bridge.live = Socket()
    bridge.greeting_wait_seconds = .05
    task = asyncio.create_task(bridge.open_conversation())
    await bridge.process_event({'type':'session.output_audio.delta', 'delta':'/w=='})
    assert bridge.output.empty()  # No premature model speech during listening window.
    await asyncio.sleep(.01)
    assert not bridge.live.sent and not bridge.opening_released
    await asyncio.wait_for(task, 1)
    assert bridge.opening_released and not bridge.phone_closed
    assert len(bridge.live.sent) == 1
    assert '먼저' in bridge.live.sent[0]['content']
    service.patch.assert_called_once_with('job', 'hospital', opening_trigger='silence')


async def test_caller_hello_during_connection_is_forwarded_before_greeting():
    import base64
    from unittest.mock import Mock
    from app.audio import SpeechGate
    class Detector:
        def is_speech(self, pcm, rate):
            return pcm != bytes(len(pcm))
    bridge = LiveBridge(Settings(), Mock(), Socket(), 'job', 'hospital', 'stream')
    bridge.gate = SpeechGate(Detector())
    bridge.greeting_wait_seconds = .02
    receiver = asyncio.create_task(bridge.receive_twilio())
    speech = base64.b64encode(bytes([100]) * 960).decode()
    await bridge.twilio.incoming.put({'event':'media','media':{'payload':speech}})
    await wait_until(lambda: bridge.gate.active)
    # The user greeted us while the provider connection was still being prepared.
    bridge.live = Socket()
    sender = asyncio.create_task(bridge.send_audio())
    opening = asyncio.create_task(bridge.open_conversation())
    await asyncio.sleep(.04)  # Silence timeout must not cut off an active caller.
    assert not bridge.opening_released
    assert all(e['type'] == 'session.input_audio.append' for e in bridge.live.sent)
    silence = base64.b64encode(bytes([255]) * 3200).decode()
    await bridge.twilio.incoming.put({'event':'media','media':{'payload':silence}})
    await asyncio.wait_for(opening, 1)
    events = bridge.live.sent
    assert events[0]['audio'] == speech
    assert events[-2]['audio'] == silence
    assert events[-1]['event_id'] == 'opening_greeting'
    assert '첫 발언이 끝났습니다' in events[-1]['content']
    assert sum(e['type']=='session.instructions.append' for e in events) == 1
    bridge.service.patch.assert_called_once_with('job', 'hospital', opening_trigger='caller')
    for task in (receiver, sender): task.cancel()
    await asyncio.gather(receiver, sender, return_exceptions=True)


async def test_disconnect_during_greeting_wait_does_not_send_late_greeting():
    config = Settings(demo_delay=100)
    service = DispatchService(config, Store(':memory:'), None)
    job = service.create(DispatchInput.model_validate(payload()), 'early-disconnect')
    h = job['hospitals'][0]
    phone, live = Socket(), Socket()
    bridge = LiveBridge(config, service, phone, job['id'], h['id'], 'stream', connector=lambda *a, **kw: Connection(live))
    task = asyncio.create_task(bridge.run())
    await wait_until(lambda: any(e['type']=='session.start' for e in live.sent))
    await phone.incoming.put({'event':'stop'})
    await asyncio.wait_for(task, 1)
    assert not any(e.get('event_id')=='opening_greeting' for e in live.sent)
    assert phone.closed
    await service.close()


async def test_closing_sentence_audio_is_played_before_end_even_with_silence_marks():
    import base64
    from unittest.mock import Mock
    bridge = LiveBridge(Settings(), Mock(), Socket(), 'job', 'hospital', 'stream')
    bridge.opening_released = True
    bridge.live = Socket()
    player = asyncio.create_task(bridge.play_audio())
    receiver = asyncio.create_task(bridge.receive_twilio())
    ending = asyncio.create_task(bridge.finish_conversation())
    # End may be signalled before the final audio arrives.
    await bridge.process_event({'type':'session.delegation.created','delegation':{'target':'client'}})
    voiced = base64.b64encode(bytes([100]) * 800).decode()
    await bridge.process_event({'type':'session.output_audio.delta','delta':voiced})
    await wait_until(lambda: bool(bridge.pending_voice_marks))
    voice_mark=next(iter(bridge.pending_voice_marks))
    await asyncio.sleep(.85)
    assert not ending.done()  # Never cut speech whose playback is unconfirmed.
    await bridge.twilio.incoming.put({'event':'mark','mark':{'name':voice_mark}})
    bridge.pending_marks.add('continuous-silence')
    await asyncio.wait_for(ending,1)
    assert any(e.get('media',{}).get('payload')==voiced for e in bridge.twilio.sent)
    for task in (player,receiver): task.cancel()
    await asyncio.gather(player,receiver,return_exceptions=True)


async def test_spoken_goodbye_ends_call_even_if_delegation_is_missing():
    from unittest.mock import Mock
    bridge = LiveBridge(Settings(),Mock(),Socket(),'job','hospital','stream')
    await bridge.process_event({'type':'session.output_transcript.delta','delta':'확인 감사합니다. 통화 '})
    assert not bridge.end_requested.is_set()
    await bridge.process_event({'type':'session.output_transcript.delta','delta':'마치겠습니다.'})
    assert bridge.end_requested.is_set()


async def test_slow_caption_storage_never_blocks_audio_forwarding():
    import threading
    from unittest.mock import Mock
    entered, release = threading.Event(), threading.Event()
    def write(*args):
        entered.set()
        release.wait(2)
    service = Mock()
    service.transcripts = write
    phone=Socket()
    bridge=LiveBridge(Settings(),service,phone,'job','hospital','stream')
    bridge.opening_released=True
    await bridge.process_event({'type':'session.input_transcript.delta','delta':'네'})
    writer=asyncio.create_task(bridge.flush_captions())
    await wait_until(entered.is_set)
    player=asyncio.create_task(bridge.play_audio())
    try:
        await bridge.process_event({'type':'session.output_audio.delta','delta':'/w=='})
        await wait_until(lambda: bool(phone.sent))
        assert not writer.done()
    finally:
        release.set()
        await writer
        player.cancel()
        await asyncio.gather(player,return_exceptions=True)


def test_eta_uses_sino_korean_minute_reading_in_context_and_instructions():
    from app.speech import korean_minutes
    expected={1:'일 분',10:'십 분',15:'십오 분',20:'이십 분',21:'이십일 분',60:'육십 분',100:'백 분',115:'백십오 분',360:'삼백육십 분'}
    for minutes,text in expected.items(): assert korean_minutes(minutes)==text
    context=payload()
    context['hospitals'][0]['eta_minutes']=15
    event=session_start(Settings(),context,context['hospitals'][0])['session']
    assert '이 통화의 예상 소요시간 발음: 십오 분.' in event['instructions']
    assert json.loads(event['input'][0]['content'][0]['text'].split(': ',1)[1])['eta_spoken']=='십오 분'
