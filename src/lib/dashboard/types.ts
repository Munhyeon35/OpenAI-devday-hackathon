export type CallStatus = "calling" | "unavailable" | "available" | "error" | "processing";
export type CaseStatus = "searching" | "assigned" | "completed";

export interface Patient {
  age: string;
  gender: string;
  impression: string;
  infection: string;
  disease: string;
  category: string;
  symptom: string;
  associatedSymptoms: string;
  onset: string;
  onsetAccuracy: string;
  pain: string;
  history: string;
  consciousness: string;
  systolic: string;
  diastolic: string;
  pulse: string;
  spo2: string;
  respiratoryRate: string;
  temperature: string;
  measuredAt: string;
  assessment: string;
  ktas: string;
  evaluator: string;
}

export interface TranscriptMessage {
  id: string;
  role: "hospital" | "ai";
  text: string;
  time: string;
}

export interface Hospital {
  id: string;
  name: string;
  shortName: string;
  department: string;
  position: [number, number];
  distance: number;
  distanceKnown?: boolean;
  statusLabel?: string;
  eta: number;
  status: CallStatus;
  note: string;
  callSeconds: number;
  messages: TranscriptMessage[];
}

export interface ReceptionLog {
  id: string;
  time: string;
  title: string;
  detail: string;
  status?: CallStatus;
}

export interface EmergencyCase {
  id: string;
  displayId?: string;
  source?: "live" | "demo";
  statusLabel?: string;
  unit: string;
  label: string;
  receivedAt: string;
  elapsedSeconds: number;
  status: CaseStatus;
  location: string;
  position: [number, number];
  patient: Patient;
  hospitals: Hospital[];
  logs: ReceptionLog[];
}

export const CALL_STATUS: Record<CallStatus, { label: string; shortLabel: string; color: string }> = {
  calling: { label: "통화 진행 중", shortLabel: "통화 중", color: "#eb791f" },
  available: { label: "이송 가능", shortLabel: "이송 가능", color: "#16856b" },
  unavailable: { label: "이송 불가", shortLabel: "이송 불가", color: "#d95960" },
  processing: { label: "결과 정리 중", shortLabel: "결과 정리 중", color: "#77758b" },
  error: { label: "API 응답 오류", shortLabel: "응답 오류", color: "#77758b" },
};

export function formatDuration(seconds: number) {
  seconds = Math.floor(seconds);
  return `${Math.floor(seconds / 60).toString().padStart(2, "0")}:${(seconds % 60).toString().padStart(2, "0")}`;
}
