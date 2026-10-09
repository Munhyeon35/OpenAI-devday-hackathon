import hmac
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import Depends, FastAPI, Header, HTTPException, Request, WebSocket
from fastapi.responses import FileResponse, Response
from fastapi.staticfiles import StaticFiles
from twilio.request_validator import RequestValidator

from app.config import Settings
from app.live import LiveBridge
from app.models import DispatchInput
from app.service import DispatchService
from app.store import Store
from app.telephony import TwilioGateway, voice_xml

STATIC = Path(__file__).resolve().parents[1] / "static"


def create_app(config=None, store=None, gateway=None):
    config = config or Settings.from_env()
    store = store or Store(config.database_path)
    gateway = gateway or (TwilioGateway(config) if config.mode == "live" else None)
    service = DispatchService(config, store, gateway)

    @asynccontextmanager
    async def lifespan(app):
        await service.start()
        yield
        await service.close()
        store.close()

    app = FastAPI(title="응급실 수용 확인 · gpt-backbed", lifespan=lifespan)
    app.state.service = service
    app.mount("/static", StaticFiles(directory=STATIC), name="static")

    async def authorized(authorization: str = Header(default="")):
        if config.operator_token and not hmac.compare_digest(authorization, "Bearer " + config.operator_token):
            raise HTTPException(401, "운영자 토큰을 확인하세요")

    @app.middleware("http")
    async def headers(request, call_next):
        response = await call_next(request)
        response.headers["Cache-Control"] = "no-store"
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["Referrer-Policy"] = "no-referrer"
        response.headers["Content-Security-Policy"] = "default-src 'self'; style-src 'self'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'"
        return response

    @app.get("/")
    async def index():
        return FileResponse(STATIC / "index.html")

    @app.get("/api/config")
    async def public_config():
        return {"mode": config.mode, "auth_required": bool(config.operator_token),
                "backbed_configured": bool(config.backbed_url)}

    def get_job(job_id):
        job = store.get(job_id)
        if not job:
            raise HTTPException(404, "요청을 찾을 수 없습니다")
        return job

    @app.post("/api/dispatches", status_code=202, dependencies=[Depends(authorized)])
    async def create_dispatch(data: DispatchInput, idempotency_key: str = Header(min_length=8, max_length=100)):
        try:
            return service.public(service.create(data, idempotency_key))
        except ValueError as exc:
            raise HTTPException(409, str(exc)) from exc
        except RuntimeError as exc:
            raise HTTPException(429, str(exc)) from exc

    @app.get("/api/dispatches/{job_id}", dependencies=[Depends(authorized)])
    async def get_dispatch(job_id: str):
        return service.public(get_job(job_id))

    @app.post("/api/dispatches/{job_id}/cancel", dependencies=[Depends(authorized)])
    async def cancel_dispatch(job_id: str):
        get_job(job_id)
        await service.cancel(job_id)
        return service.public(get_job(job_id))

    @app.post("/api/dispatches/{job_id}/retry-delivery", dependencies=[Depends(authorized)])
    async def retry_delivery(job_id: str):
        for h in get_job(job_id)["hospitals"]:
            if h["delivery"]["status"] == "failed":
                service.patch(job_id, h["id"], delivery={"status": "pending", "attempts": 0, "next_attempt": 0})
        return service.public(get_job(job_id))

    async def verify_twilio(request):
        if config.mode != "live":
            raise HTTPException(403)
        form = await request.form()
        expected_url = config.public_base_url + request.url.path
        if request.url.query:
            expected_url += "?" + request.url.query
        signature = request.headers.get("x-twilio-signature", "")
        if not RequestValidator(config.twilio_token).validate(expected_url, form, signature):
            raise HTTPException(403, "Invalid Twilio signature")
        if form.get("AccountSid") != config.twilio_sid:
            raise HTTPException(403)
        return form

    @app.post("/twilio/{job_id}/{hospital_id}/voice")
    async def twilio_voice(job_id: str, hospital_id: str, request: Request):
        form = await verify_twilio(request)
        if not service.bind_sid(job_id, hospital_id, form.get("CallSid")):
            raise HTTPException(404)
        hospital = service.hospital(job_id, hospital_id)
        xml = "<Response><Hangup/></Response>" if hospital["result"] else voice_xml(config, job_id, hospital)
        return Response(xml, media_type="application/xml")

    @app.post("/twilio/{job_id}/{hospital_id}/status")
    async def twilio_status(job_id: str, hospital_id: str, request: Request):
        form = await verify_twilio(request)
        if not service.bind_sid(job_id, hospital_id, form.get("CallSid")):
            raise HTTPException(404)
        service.call_status(job_id, hospital_id, form.get("CallStatus", ""))
        return Response(status_code=204)

    @app.websocket("/twilio/media")
    async def media(websocket: WebSocket):
        import asyncio
        signature = websocket.headers.get("x-twilio-signature", "")
        url = config.public_base_url + "/twilio/media"
        validator = RequestValidator(config.twilio_token)
        # Twilio may sign the HTTPS handshake or the configured WSS URL.
        urls = [url, url.replace("https://", "wss://", 1)]
        if config.mode != "live" or not any(validator.validate(u, {}, signature) for u in urls):
            await websocket.close(code=1008)
            return
        await websocket.accept()
        try:
            async with asyncio.timeout(10):
                event = await websocket.receive_json()
                if event["event"] == "connected":
                    event = await websocket.receive_json()
                if event["event"] != "start":
                    raise ValueError("Expected start")
                start = event["start"]
                params = start["customParameters"]
                jid, hid = params["job_id"], params["hospital_id"]
                h = service.hospital(jid, hid)
                if (not h or h["result"] or h["stream_claimed"]
                    or not hmac.compare_digest(params.get("token", ""), h["stream_token"])
                    or start.get("accountSid") != config.twilio_sid
                    or not service.bind_sid(jid, hid, start.get("callSid"))):
                    raise ValueError("Invalid stream binding")
                fmt = start.get("mediaFormat", {})
                if fmt != {"encoding": "audio/x-mulaw", "sampleRate": 8000, "channels": 1}:
                    raise ValueError("Expected mono PCMU 8kHz")
                service.patch(jid, hid, stream_claimed=True, phase="connected")
            await LiveBridge(config, service, websocket, jid, hid, start["streamSid"]).run()
        except Exception:
            from contextlib import suppress
            with suppress(Exception):
                await websocket.close(code=1008)

    return app


app = create_app()
