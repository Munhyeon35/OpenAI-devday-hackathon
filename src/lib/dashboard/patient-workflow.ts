import type { HospitalSearch, HospitalSearchResult } from "../hospitals.ts";
import type { EmergencyCase, Hospital, Patient } from "./types.ts";

export const EMPTY_PATIENT: Patient = {
  age: "", gender: "", impression: "", infection: "", disease: "", category: "",
  symptom: "", associatedSymptoms: "", onset: "", onsetAccuracy: "", pain: "", history: "",
  consciousness: "", systolic: "", diastolic: "", pulse: "", spo2: "", respiratoryRate: "",
  temperature: "", measuredAt: "", assessment: "", ktas: "", evaluator: "",
};

export const DEMO_SEARCH: HospitalSearch = {
  latitude: 37.4936, longitude: 127.0125, radiusKm: 20, limit: 10,
  departments: ["D001"], procedures: ["mkioskty1"], equipment: ["hvctayn"],
  beds: ["hvec"], includeUnknown: true,
};

export function createDraftCase(id: string, position: [number, number], now: Date): EmergencyCase {
  const receivedAt = now.toLocaleTimeString("ko-KR", { timeZone: "Asia/Seoul", hour12: false, hour: "2-digit", minute: "2-digit" });
  return {
    id, unit: "신규 접수", label: "환자 정보 입력 중", receivedAt, elapsedSeconds: 0,
    status: "draft", location: "구급차 좌표 확인 필요", position: [...position],
    patient: { ...EMPTY_PATIENT }, hospitals: [],
    logs: [{ id: `${id}-created`, time: `${receivedAt}:00`, title: "신규 환자 추가", detail: "환자 정보와 병원 검색 조건 입력을 시작했습니다." }],
    candidateSearch: { status: "draft", parameters: { latitude: position[0], longitude: position[1], radiusKm: 20, limit: 10, departments: [], procedures: [], equipment: [], beds: [], includeUnknown: true } },
  };
}

export function candidateHospitals(caseId: string, result: HospitalSearchResult): Hospital[] {
  return result.candidates.map((candidate) => ({
    id: `${caseId}-${candidate.id}`, name: candidate.name, shortName: candidate.name,
    department: candidate.classification || "응급의료기관",
    position: [candidate.latitude, candidate.longitude], distance: candidate.roadRoute?.distanceKm ?? candidate.distanceKm,
    eta: candidate.roadRoute ? Math.max(1, Math.ceil(candidate.roadRoute.durationSeconds / 60)) : null,
    candidate, status: "pending", callSeconds: 0, messages: [],
    note: "아직 전화하지 않았습니다. 환자 수용 여부는 병원 확인이 필요합니다.",
  }));
}
