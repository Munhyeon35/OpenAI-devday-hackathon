import type { HospitalSearch } from "../hospitals";
import { DEMO_CASES } from "./demo-data";
import { DEMO_SEARCH } from "./patient-workflow";
import type { Patient } from "./types";

export type PatientPreset = {
  id: string;
  label: string;
  location: string;
  patient: Patient;
  search: HospitalSearch;
};

// Fictional patients and field assessments for UI demonstrations only.
// Search conditions are explicit scenario inputs, not inferred diagnoses.
export const PATIENT_PRESETS: PatientPreset[] = [
  {
    id: "seoul-chest-pain",
    label: "서울 · 흉통",
    location: "서울 서초역 인근",
    patient: { ...DEMO_CASES[0].patient, onsetAccuracy: "추정" },
    search: { ...DEMO_SEARCH },
  },
  {
    id: "busan-neurological",
    label: "부산 · 편측 마비·언어장애",
    location: "부산 부산진구 서면 인근",
    patient: {
      age: "67", gender: "여성", impression: "오른팔 힘 빠짐, 말이 어눌함",
      infection: "의심 없음", disease: "질병", category: "신경계",
      symptom: "편측 마비·언어장애", associatedSymptoms: "오른쪽 팔·다리 위약, 어지럼",
      onset: "14:10", onsetAccuracy: "추정", pain: "0", history: "고혈압 · 정기 복약 중",
      consciousness: "명료 (Alert)", systolic: "172", diastolic: "98", pulse: "96",
      spo2: "97", respiratoryRate: "20", temperature: "36.6", measuredAt: "14:25",
      assessment: "데모 시나리오: 편측 위약과 언어장애를 현장 평가자가 확인한 가상 사례",
      ktas: "2", evaluator: "부산진119 구급대 · 2조",
    },
    search: {
      latitude: 35.1577, longitude: 129.0592, radiusKm: 20, limit: 10,
      departments: ["D003"], procedures: ["mkioskty2"], equipment: ["hvctayn"],
      beds: ["hvec"], includeUnknown: true,
    },
  },
];
