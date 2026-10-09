import type { EmergencyCase, Hospital, Patient, TranscriptMessage } from "./types.ts";

export type Fragment = { id?: string; speaker: "assistant" | "hospital"; text: string; start_ms: number; end_ms: number };
export type DispatchHospital = {
  id: string; name: string; phone: string; eta_minutes: number; phase: string; call_status: string;
  answered_at?: string; voice_ended_at?: string; transcript: Fragment[];
  result: null | { availability: "accepted" | "rejected" | "unknown"; reason: string; confirmed_at: string; event_id: string };
  delivery: { status: string }; hangup_pending: boolean;
};
export type DispatchJob = {
  id: string; mode: "live" | "demo"; created_at: string; status: string;
  patient: { name: string; age: number; condition: string; location: string };
  hospitals: DispatchHospital[];
};
const clock = (date: string | number) => new Date(date).toLocaleTimeString("ko-KR", { hour12: false });

// Fragments retain exact spacing; speaker timelines are grouped independently,
// so overlapping or late captions never concatenate hospital and AI speech.
export function captionMessages(hospital: DispatchHospital): TranscriptMessage[] {
  const messages: (TranscriptMessage & { start: number; end: number })[] = [];
  for (const speaker of ["assistant", "hospital"] as const) {
    let previous: (typeof messages)[number] | undefined;
    const fragments = hospital.transcript.map((fragment, index) => ({ ...fragment, index }))
      .filter((fragment) => fragment.speaker === speaker)
      .sort((a, b) => a.start_ms - b.start_ms || a.index - b.index);
    for (const fragment of fragments) {
      if (!previous || fragment.start_ms - previous.end > 1200) {
        previous = { id: fragment.id || `${hospital.id}:${fragment.index}`, role: speaker === "assistant" ? "ai" : "hospital",
          text: "", time: `+${Math.floor(fragment.start_ms / 60000).toString().padStart(2,"0")}:${Math.floor(fragment.start_ms / 1000 % 60).toString().padStart(2,"0")}`,
          start: fragment.start_ms, end: fragment.end_ms };
        messages.push(previous);
      }
      previous.text += fragment.text;
      previous.end = Math.max(previous.end, fragment.end_ms);
    }
  }
  return messages.sort((a,b) => a.start - b.start || a.id.localeCompare(b.id));
}

export function toReception(job: DispatchJob, now: number): EmergencyCase {
  const patient: Patient = {
    age: String(job.patient.age), gender: "미상", impression: "", infection: "", disease: "", category: "",
    symptom: job.patient.condition, associatedSymptoms: "", onset: "", onsetAccuracy: "", pain: "", history: "",
    consciousness: "", systolic: "", diastolic: "", pulse: "", spo2: "", respiratoryRate: "", temperature: "",
    measuredAt: "", assessment: "", ktas: "", evaluator: "",
  };
  const hospitals: Hospital[] = job.hospitals.map((hospital) => {
    const result = hospital.result;
    const status = result ? ({ accepted: "available", rejected: "unavailable", unknown: "unknown" } as const)[result.availability]
      : hospital.phase === "processing" ? "processing" : "calling";
    const note = result?.reason || ({ queued:"발신 대기", dialing:"전화 연결 중", connected:"음성 세션 연결 중", confirming:"환자 정보 전달 · 수용 여부 확인 중", processing:"통화 종료 · 결과 정리 중" }[hospital.phase] || hospital.phase);
    return { id: hospital.id, name: hospital.name, shortName: hospital.name, department: "응급실 수용 확인", position:[0,0],
      distance:0, distanceKnown:false, eta:hospital.eta_minutes, status, note,
      statusLabel: result ? undefined : hospital.phase === "processing" ? "결과 정리 중" : hospital.call_status === "in-progress" ? "통화 중" : "연결 중",
      callSeconds:hospital.answered_at ? Math.max(0, ((hospital.voice_ended_at ? Date.parse(hospital.voice_ended_at) : now) - Date.parse(hospital.answered_at)) / 1000) : 0,
      messages:captionMessages(hospital) };
  });
  return { id:job.id, displayId:job.id.slice(0,8), source:"live", unit:job.patient.name, label:job.patient.condition,
    receivedAt:clock(job.created_at), elapsedSeconds:Math.max(0,(now-Date.parse(job.created_at))/1000),
    status:job.status === "completed" ? "completed" : "searching", statusLabel:job.status === "completed" ? "확인 완료" : "수용 확인 중",
    location:job.patient.location, position:[0,0], patient, hospitals,
    logs:hospitals.map((h) => ({ id:h.id, time:clock(job.created_at), title:h.name, detail:h.note, status:h.status })) };
}
