import asyncio
import hashlib
import json
import logging
import secrets
import time
from datetime import datetime, timezone
from uuid import uuid4

import httpx

from app.models import Decision

log = logging.getLogger(__name__)
TERMINAL_CALLS = {"completed", "busy", "failed", "no-answer", "canceled"}
CALL_ORDER = {"queued": 0, "initiated": 1, "ringing": 2, "in-progress": 3}


def now():
    return datetime.now(timezone.utc).isoformat()


class DispatchService:
    def __init__(self, config, store, gateway):
        self.config, self.store, self.gateway = config, store, gateway
        self.tasks = set()
        self.http = httpx.AsyncClient(timeout=10, follow_redirects=False)
        self.worker = None

    def spawn(self, coroutine):
        task = asyncio.create_task(coroutine)
        self.tasks.add(task)
        task.add_done_callback(self.tasks.discard)
        return task

    def hospital(self, job_id, hospital_id):
        job = self.store.get(job_id)
        if job:
            return next((h for h in job["hospitals"] if h["id"] == hospital_id), None)
        return None

    def patch(self, job_id, hospital_id, **fields):
        return self.store.update_hospital(job_id, hospital_id, lambda h: h.update(fields))

    def create(self, data, key):
        fingerprint = hashlib.sha256(data.model_dump_json().encode()).hexdigest()
        existing = self.store.by_key(key)
        if existing:
            if existing[0] != fingerprint:
                raise ValueError("같은 요청 키에 다른 입력을 사용할 수 없습니다")
            return existing[1]
        if sum(j["status"] != "completed" for j in self.store.all()) >= 5:
            raise RuntimeError("진행 중인 요청이 많습니다. 기존 통화가 끝난 뒤 시도하세요")
        job = {
            "id": str(uuid4()), "created_at": now(), "started_at": time.time(),
            "mode": self.config.mode, "status": "running", "patient": data.patient.model_dump(),
            "hospitals": [{
                **h.model_dump(), "id": str(uuid4()), "phase": "queued", "call_status": "queued",
                "call_sid": None, "live_session_id": None, "stream_token": secrets.token_urlsafe(32),
                "stream_claimed": False, "transcript": [], "result": None,
                "delivery": {"status": "waiting", "attempts": 0, "next_attempt": 0},
                "hangup_pending": False, "hangup_attempts": 0, "hangup_after": 0,
            } for h in data.hospitals],
        }
        self.store.create(job, key, fingerprint)
        # Both tasks start independently: neither hospital waits for the other.
        for index, hospital in enumerate(job["hospitals"]):
            self.spawn(self.run_call(job["id"], hospital["id"], index))
        return job

    async def run_call(self, job_id, hospital_id, index):
        try:
            if self.hospital(job_id, hospital_id)["result"]:
                return
            if self.config.mode == "demo":
                await self.simulate(job_id, hospital_id, index)
                return
            self.patch(job_id, hospital_id, phase="dialing")
            sid = await self.gateway.dial(job_id, self.hospital(job_id, hospital_id))
            hospital = self.hospital(job_id, hospital_id)
            if hospital["call_sid"] and hospital["call_sid"] != sid:
                raise RuntimeError("Call SID mismatch")
            self.patch(job_id, hospital_id, call_sid=sid)
            # Cancellation/status callbacks can win the race with the REST response.
            hospital = self.hospital(job_id, hospital_id)
            if hospital["result"] and hospital["call_status"] not in TERMINAL_CALLS:
                self.patch(job_id, hospital_id, hangup_pending=True)
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            log.warning("Dial failed (%s)", type(exc).__name__)
            self.finish_unknown(job_id, hospital_id, "발신 요청 실패 또는 응답 지연. 발신 상태를 확인하세요.")

    def transcript(self, job_id, hospital_id, speaker, text, start_ms=0, end_ms=0):
        def update(h):
            h["transcript"].append({"speaker": speaker, "text": text, "start_ms": start_ms, "end_ms": end_ms})
            h["transcript"] = h["transcript"][-2000:]
        self.store.update_hospital(job_id, hospital_id, update)

    def record_decision(self, job_id, hospital_id, payload):
        hospital = self.hospital(job_id, hospital_id)
        if hospital["result"]:
            return {"saved": True, "already_final": True, "result": hospital["result"]}
        decision = Decision.model_validate(payload)
        if decision.availability != "unknown":
            # Ground the model's claimed quote in this hospital's input, never AI speech.
            heard = "".join(t["text"] for t in hospital["transcript"] if t["speaker"] == "hospital")
            normalize = lambda s: "".join(s.split())
            if normalize(decision.evidence_quote) not in normalize(heard):
                raise ValueError("실제 병원 발언에 없는 인용입니다. 확답을 다시 확인하세요")
        self.complete(job_id, hospital_id, decision.model_dump())
        return {"saved": True, "availability": decision.availability}

    def complete(self, job_id, hospital_id, result):
        live = self.store.get(job_id)["mode"] == "live"
        def update(h):
            if h["result"] is not None:
                return
            h["result"] = {**result, "confirmed_at": now(), "event_id": str(uuid4())}
            h["phase"] = "finished"
            h["hangup_pending"] = live and bool(h["call_sid"]) and h["call_status"] not in TERMINAL_CALLS
            h["hangup_after"] = time.time() + 5  # Allow the final spoken acknowledgment.
            h["delivery"]["status"] = "pending" if self.config.backbed_url and live else "local_only"
        self.store.update_hospital(job_id, hospital_id, update)

    def finish_unknown(self, job_id, hospital_id, reason):
        self.complete(job_id, hospital_id, Decision(
            availability="unknown", reason=reason, evidence_quote="", respondent="",
            explicit_confirmation=False, patient_context_confirmed=False,
        ).model_dump())

    def bind_sid(self, job_id, hospital_id, sid):
        hospital = self.hospital(job_id, hospital_id)
        if not hospital or not sid or (hospital["call_sid"] and hospital["call_sid"] != sid):
            return False
        if not hospital["call_sid"]:
            self.patch(job_id, hospital_id, call_sid=sid)
            if hospital["result"] and hospital["call_status"] not in TERMINAL_CALLS:
                self.patch(job_id, hospital_id, hangup_pending=True, hangup_after=0)
        return True

    def call_status(self, job_id, hospital_id, status):
        h = self.hospital(job_id, hospital_id)
        if h["call_status"] in TERMINAL_CALLS:
            return
        if status in TERMINAL_CALLS:
            self.patch(job_id, hospital_id, call_status=status, hangup_pending=False)
            self.finish_unknown(job_id, hospital_id, f"확답 없이 통화 종료 ({status})")
        elif status in CALL_ORDER and CALL_ORDER[status] >= CALL_ORDER.get(h["call_status"], 0):
            self.patch(job_id, hospital_id, call_status=status)

    async def cancel(self, job_id):
        for hospital in self.store.get(job_id)["hospitals"]:
            if not hospital["result"]:
                self.finish_unknown(job_id, hospital["id"], "사용자가 통화를 중단했습니다")
            if self.config.mode == "live" and hospital["call_sid"] and hospital["call_status"] not in TERMINAL_CALLS:
                self.patch(job_id, hospital["id"], hangup_pending=True, hangup_after=0)

    async def simulate(self, job_id, hospital_id, index):
        for phase in ["dialing", "connected", "confirming"]:
            await asyncio.sleep(self.config.demo_delay)
            if self.hospital(job_id, hospital_id)["result"]:
                return
            self.patch(job_id, hospital_id, phase=phase)
        job, h = self.store.get(job_id), self.hospital(job_id, hospital_id)
        p = job["patient"]
        self.transcript(job_id, hospital_id, "assistant", f"[시뮬레이션] AI 이송 지원입니다. {p['name']} 님, {p['age']}세, {p['condition']}. 현재 {p['location']}, 출발 후 예상 {h['eta_minutes']}분입니다. 이 환자의 수용이 가능합니까?")
        await asyncio.sleep(self.config.demo_delay * (index + 1))
        if self.hospital(job_id, hospital_id)["result"]:
            return
        quote = "네, 말씀하신 환자를 수용할 병상이 있고 도착 시 수용 가능합니다." if index == 0 else "응급실 담당 간호사입니다. 현재 병상이 없어 이 환자를 수용할 수 없습니다."
        self.transcript(job_id, hospital_id, "hospital", quote)
        self.record_decision(job_id, hospital_id, {
            "availability": "accepted" if index == 0 else "rejected", "reason": "시뮬레이션 응답입니다",
            "evidence_quote": quote, "respondent": "응급실 담당 간호사 (시뮬레이션)",
            "explicit_confirmation": True, "patient_context_confirmed": True,
        })

    def public(self, job):
        result = json.loads(json.dumps(job))
        for h in result["hospitals"]:
            for key in ["stream_token", "stream_claimed", "hangup_after"]:
                h.pop(key, None)
        return result

    def delivery_payload(self, job, h):
        result = h["result"]
        return {"event": "hospital.availability.resolved", "event_id": result["event_id"],
                "dispatch_id": job["id"], "hospital_id": h["id"], "mode": job["mode"],
                "patient": job["patient"], "hospital": {k: h[k] for k in ["name", "phone", "eta_minutes"]},
                "call_sid": h["call_sid"], "live_session_id": h["live_session_id"], "result": result}

    async def deliver(self, job, hospital):
        delivery = hospital["delivery"]
        attempts = delivery["attempts"] + 1
        headers = {"Idempotency-Key": hospital["result"]["event_id"]}
        if self.config.backbed_token:
            headers["Authorization"] = "Bearer " + self.config.backbed_token
        try:
            response = await self.http.post(self.config.backbed_url, json=self.delivery_payload(job, hospital), headers=headers)
            response.raise_for_status()
            status = "delivered"
        except httpx.HTTPError:
            status = "failed" if attempts >= 5 else "pending"
        self.patch(job["id"], hospital["id"], delivery={
            "status": status, "attempts": attempts, "next_attempt": time.time() + 2 ** attempts,
        })

    async def maintain_hospital(self, job, h):
        jid, hid = job["id"], h["id"]
        if not h["result"] and time.time() - job["started_at"] > self.config.max_call_seconds + 45:
            self.finish_unknown(jid, hid, "통화 제한시간 내 수용 확답을 받지 못했습니다")
            h = self.hospital(jid, hid)
        if self.gateway and h["hangup_pending"] and h["call_sid"] and h["hangup_after"] <= time.time():
            attempts = h["hangup_attempts"] + 1
            try:
                await self.gateway.hangup(h["call_sid"])
                self.patch(jid, hid, hangup_pending=False, call_status="completed", hangup_attempts=attempts)
            except Exception as exc:
                log.warning("Hangup failed (%s)", type(exc).__name__)
                self.patch(jid, hid, hangup_attempts=attempts, hangup_after=time.time() + min(60, 2 ** min(attempts, 6)))
        if self.config.backbed_url and h["delivery"]["status"] == "pending" and h["delivery"]["next_attempt"] <= time.time():
            await self.deliver(job, h)

    async def maintenance(self):
        while True:
            try:
                await asyncio.gather(*(self.maintain_hospital(j, h) for j in self.store.all() for h in j["hospitals"]))
            except Exception as exc:
                log.warning("Maintenance failed (%s)", type(exc).__name__)
            await asyncio.sleep(1)

    async def start(self):
        for job in self.store.all():
            for hospital in job["hospitals"]:
                if not hospital["result"]:
                    self.finish_unknown(job["id"], hospital["id"], "서버 재시작으로 통화 세션이 종료되었습니다")
        self.worker = asyncio.create_task(self.maintenance())

    async def close(self):
        if self.worker:
            self.worker.cancel()
        for task in list(self.tasks):
            task.cancel()
        await asyncio.gather(*self.tasks, *([self.worker] if self.worker else []), return_exceptions=True)
        # Best-effort termination; durable hangup flags are retried on startup.
        pending = []
        for job in self.store.all():
            for h in job["hospitals"]:
                if not h["result"]:
                    self.finish_unknown(job["id"], h["id"], "서버 종료로 통화가 중단되었습니다")
                if self.config.mode == "live" and job["mode"] == "live" and h["call_sid"] and h["call_status"] not in TERMINAL_CALLS:
                    pending.append(self.gateway.hangup(h["call_sid"]))
        if pending:
            await asyncio.gather(*pending, return_exceptions=True)
        await self.http.aclose()
        if self.gateway:
            await self.gateway.close()
