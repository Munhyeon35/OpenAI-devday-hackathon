import type { HospitalCandidate, HospitalSearch, HospitalSearchResult } from "../hospitals";

export type CallStatus = "pending" | "calling" | "unavailable" | "available" | "error";
export type CaseStatus = "draft" | "ready" | "searching" | "assigned" | "completed";

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
  eta: number | null;
  candidate?: HospitalCandidate;
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
  candidateSearch?: {
    parameters: HospitalSearch;
    status: "draft" | "loading" | "ready" | "error";
    requestId?: string;
    result?: HospitalSearchResult;
    error?: string;
  };
}

export const CALL_STATUS: Record<CallStatus, { label: string; shortLabel: string; color: string }> = {
  pending: { label: "전화 전", shortLabel: "전화 전", color: "#64748b" },
  calling: { label: "통화 진행 중", shortLabel: "통화 중", color: "#eb791f" },
  available: { label: "이송 가능", shortLabel: "이송 가능", color: "#16856b" },
  unavailable: { label: "이송 불가", shortLabel: "이송 불가", color: "#d95960" },
  error: { label: "API 응답 오류", shortLabel: "응답 오류", color: "#77758b" },
};

export function formatDuration(seconds: number) {
  seconds = Math.floor(seconds);
  return `${Math.floor(seconds / 60).toString().padStart(2, "0")}:${(seconds % 60).toString().padStart(2, "0")}`;
}

export function hospitalDistanceLabel(hospital: Hospital): string {
  return hospital.candidate ? hospital.candidate.roadRoute ? "도로" : "직선" : "";
}

export function compareHospitalTravel(first: Hospital, second: Hospital, sort: "distance" | "eta"): number {
  if (sort === "eta") return (first.eta ?? Infinity) - (second.eta ?? Infinity) || first.distance - second.distance;
  // A failed route's short straight-line distance must not outrank known road distances.
  const unknownRoute = (hospital: Hospital) => Number(Boolean(hospital.candidate && !hospital.candidate.roadRoute));
  return unknownRoute(first) - unknownRoute(second) || first.distance - second.distance || (first.eta ?? Infinity) - (second.eta ?? Infinity) || 0;
}
