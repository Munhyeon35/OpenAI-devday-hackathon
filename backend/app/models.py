import re
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


class InputModel(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class Patient(InputModel):
    name: str = Field(min_length=1, max_length=80)
    age: int = Field(ge=0, le=120, strict=True)
    condition: str = Field(min_length=2, max_length=2000)
    location: str = Field(min_length=2, max_length=300)


class Hospital(InputModel):
    name: str = Field(min_length=1, max_length=100)
    phone: str
    eta_minutes: int = Field(ge=1, le=360, strict=True)

    @field_validator("phone")
    @classmethod
    def normalize_phone(cls, value):
        value = re.sub(r"[\s()-]", "", value)
        if value.startswith("0"):
            value = "+82" + value[1:]
        if not re.fullmatch(r"\+[1-9]\d{7,14}", value):
            raise ValueError("국가번호 포함 전화번호 또는 한국 전화번호를 입력하세요")
        return value


class DispatchInput(InputModel):
    patient: Patient
    hospitals: Annotated[list[Hospital], Field(min_length=1, max_length=2)]

    @model_validator(mode="after")
    def unique_numbers(self):
        if len({h.phone for h in self.hospitals}) != len(self.hospitals):
            raise ValueError("서로 다른 병원 전화번호를 입력하세요")
        return self


class Decision(InputModel):
    availability: Literal["accepted", "rejected"]
    reason: str = Field(min_length=1, max_length=600)
    evidence_quote: str = Field(max_length=600)
    respondent: str = Field(max_length=100)
    explicit_confirmation: bool
    patient_context_confirmed: bool

    @model_validator(mode="after")
    def require_confirmation(self):
        if (self.availability == "accepted" or self.explicit_confirmation) and not (
            self.explicit_confirmation and self.patient_context_confirmed
            and self.evidence_quote and self.respondent
        ):
            raise ValueError("확답, 환자/ETA 맥락 확인, 응답자 정보 및 실제 발언 근거가 필요합니다")
        return self
