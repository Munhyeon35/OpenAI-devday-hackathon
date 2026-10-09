import httpx
from twilio.twiml.voice_response import VoiceResponse, Connect, Stream


class TwilioGateway:
    def __init__(self, config):
        self.config = config
        self.http = httpx.AsyncClient(
            base_url=f"https://api.twilio.com/2010-04-01/Accounts/{config.twilio_sid}",
            auth=(config.twilio_sid, config.twilio_token), timeout=20,
        )

    async def dial(self, job_id, hospital):
        base = self.config.public_base_url
        path = f"/twilio/{job_id}/{hospital['id']}"
        response = await self.http.post("/Calls.json", data={
            "To": hospital["phone"], "From": self.config.twilio_from,
            "Url": base + path + "/voice", "Method": "POST",
            "StatusCallback": base + path + "/status", "StatusCallbackMethod": "POST",
            "StatusCallbackEvent": ["initiated", "ringing", "answered", "completed"],
            "Timeout": "30", "TimeLimit": str(self.config.max_call_seconds),
        })
        response.raise_for_status()
        return response.json()["sid"]

    async def hangup(self, sid):
        response = await self.http.post(f"/Calls/{sid}.json", data={"Status": "completed"})
        response.raise_for_status()

    async def close(self):
        await self.http.aclose()


def voice_xml(config, job_id, hospital):
    response = VoiceResponse()
    connect = Connect()
    stream = Stream(url=config.public_base_url.replace("https://", "wss://", 1) + "/twilio/media")
    for name, value in {"job_id": job_id, "hospital_id": hospital["id"], "token": hospital["stream_token"]}.items():
        stream.parameter(name=name, value=value)
    connect.append(stream)
    response.append(connect)
    response.hangup()
    return str(response)
