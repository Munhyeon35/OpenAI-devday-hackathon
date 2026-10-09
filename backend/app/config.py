import os
from dataclasses import dataclass
from urllib.parse import urlparse

from dotenv import load_dotenv


@dataclass
class Settings:
    mode: str = "demo"
    public_base_url: str = ""
    operator_token: str = ""
    openai_key: str = ""
    live_model: str = "gpt-live-1"
    backend_model: str = "gpt-6-luna"
    voice: str = "marin"
    twilio_sid: str = ""
    twilio_token: str = ""
    twilio_from: str = ""
    backbed_url: str = ""
    backbed_token: str = ""
    database_path: str = "data/dispatch.sqlite3"
    max_call_seconds: int = 180
    demo_delay: float = 1.2

    @classmethod
    def from_env(cls):
        load_dotenv()
        mapping = {
            "mode": "APP_MODE", "public_base_url": "PUBLIC_BASE_URL",
            "operator_token": "OPERATOR_TOKEN", "openai_key": "OPENAI_API_KEY",
            "live_model": "OPENAI_LIVE_MODEL", "backend_model": "OPENAI_BACKEND_MODEL",
            "voice": "OPENAI_VOICE", "twilio_sid": "TWILIO_ACCOUNT_SID",
            "twilio_token": "TWILIO_AUTH_TOKEN", "twilio_from": "TWILIO_FROM_NUMBER",
            "backbed_url": "GPT_BACKBED_URL", "backbed_token": "GPT_BACKBED_TOKEN",
            "database_path": "DATABASE_PATH",
        }
        config = cls(**{k: os.environ[v].strip() for k, v in mapping.items() if v in os.environ})
        config.public_base_url = config.public_base_url.rstrip("/")
        config.max_call_seconds = int(os.getenv("MAX_CALL_SECONDS", "180"))
        config.validate()
        return config

    def validate(self):
        if self.mode not in {"demo", "live"}:
            raise ValueError("APP_MODE must be demo or live")
        if not 30 <= self.max_call_seconds <= 600:
            raise ValueError("MAX_CALL_SECONDS must be between 30 and 600")
        if self.mode == "live":
            required = {
                "OPERATOR_TOKEN": self.operator_token, "OPENAI_API_KEY": self.openai_key,
                "TWILIO_ACCOUNT_SID": self.twilio_sid, "TWILIO_AUTH_TOKEN": self.twilio_token,
                "TWILIO_FROM_NUMBER": self.twilio_from,
            }
            missing = [k for k, v in required.items() if not v]
            if missing:
                raise ValueError("Missing live settings: " + ", ".join(missing))
            url = urlparse(self.public_base_url)
            if url.scheme != "https" or not url.netloc or url.path not in {"", "/"} or url.query:
                raise ValueError("PUBLIC_BASE_URL must be an HTTPS origin without a path")
            if len(self.operator_token) < 24:
                raise ValueError("OPERATOR_TOKEN must be at least 24 characters")
        if self.backbed_url and urlparse(self.backbed_url).scheme != "https":
            raise ValueError("GPT_BACKBED_URL must use HTTPS")
