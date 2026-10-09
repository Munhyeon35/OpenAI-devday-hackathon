import type { CallStatus, EmergencyCase, Hospital, Patient } from "./types";

// All patients, calls, acceptance responses, timings, distances, and assessments
// are deterministic demo data. Hospital coordinates are approximate map anchors;
// this file does not represent live capacity or provide clinical recommendations.

type HospitalSeed = Omit<Hospital, "id" | "status" | "note" | "callSeconds" | "messages">;

const HOSPITALS: HospitalSeed[] = [
  {
    name: "서울성모병원",
    shortName: "서울성모",
    department: "응급의료센터",
    position: [37.502, 127.0045],
    distance: 1.8,
    eta: 5,
  },
  {
    name: "강남세브란스병원",
    shortName: "강남세브란스",
    department: "응급진료센터",
    position: [37.4925, 127.0463],
    distance: 4.2,
    eta: 12,
  },
  {
    name: "중앙대학교병원",
    shortName: "중앙대병원",
    department: "응급의료센터",
    position: [37.5069, 126.9607],
    distance: 6.1,
    eta: 16,
  },
  {
    name: "순천향대 서울병원",
    shortName: "순천향대 서울",
    department: "응급의료센터",
    position: [37.5333, 127.0044],
    distance: 6.8,
    eta: 18,
  },
  {
    name: "서울특별시 보라매병원",
    shortName: "보라매병원",
    department: "응급의료센터",
    position: [37.4928, 126.924],
    distance: 9.3,
    eta: 24,
  },
  {
    name: "강남베드로병원",
    shortName: "강남베드로",
    department: "응급실",
    position: [37.4867, 127.0383],
    distance: 3.4,
    eta: 10,
  },
];

const PATIENT_008: Patient = {
  age: "58",
  gender: "남성",
  impression: "창백한 안색, 식은땀",
  infection: "의심 없음",
  disease: "질병",
  category: "심혈관",
  symptom: "흉통",
  associatedSymptoms: "식은땀, 왼팔 방사통, 오심",
  onset: "13:50",
  onsetAccuracy: "환자 진술 · 약 5분 오차",
  pain: "8",
  history: "고혈압, 당뇨 · 정기 복약 중",
  consciousness: "명료 (Alert)",
  systolic: "148",
  diastolic: "92",
  pulse: "108",
  spo2: "95",
  respiratoryRate: "24",
  temperature: "36.7",
  measuredAt: "14:23",
  assessment: "흉통과 동반 식은땀, 통증 점수 및 활력징후를 현장 평가자가 확인함",
  ktas: "2",
  evaluator: "서초119 구급대 · 1조",
};

const PATIENT_007: Patient = {
  age: "72",
  gender: "여성",
  impression: "짧은 문장으로 대화, 호흡 불편 호소",
  infection: "의심 없음",
  disease: "질병",
  category: "호흡기",
  symptom: "호흡곤란",
  associatedSymptoms: "기침, 가슴 답답함",
  onset: "13:40",
  onsetAccuracy: "보호자 진술 · 약 10분 오차",
  pain: "3",
  history: "천식 · 흡입제 사용 중",
  consciousness: "명료 (Alert)",
  systolic: "138",
  diastolic: "84",
  pulse: "112",
  spo2: "91",
  respiratoryRate: "28",
  temperature: "37.1",
  measuredAt: "14:20",
  assessment: "호흡곤란, 산소포화도 및 호흡수를 현장 평가자가 확인함",
  ktas: "2",
  evaluator: "강남119 구급대 · 2조",
};

const PATIENT_006: Patient = {
  age: "46",
  gender: "남성",
  impression: "오른쪽 발목 통증, 보행 어려움",
  infection: "의심 없음",
  disease: "외상",
  category: "근골격계",
  symptom: "낙상 후 발목 통증",
  associatedSymptoms: "오른쪽 발목 부종",
  onset: "13:20",
  onsetAccuracy: "환자 진술 · 시각 확인",
  pain: "6",
  history: "특이 병력 없음",
  consciousness: "명료 (Alert)",
  systolic: "126",
  diastolic: "80",
  pulse: "88",
  spo2: "98",
  respiratoryRate: "18",
  temperature: "36.5",
  measuredAt: "14:05",
  assessment: "낙상 경위, 발목 통증과 부종 및 의식 상태를 현장 평가자가 확인함",
  ktas: "3",
  evaluator: "동작119 구급대 · 1조",
};

const PATIENT_005: Patient = {
  age: "34",
  gender: "여성",
  impression: "복부를 감싸고 통증 호소",
  infection: "확인 중",
  disease: "질병",
  category: "소화기",
  symptom: "복통",
  associatedSymptoms: "오심, 구토 1회",
  onset: "12:40",
  onsetAccuracy: "환자 진술 · 약 10분 오차",
  pain: "7",
  history: "특이 병력 없음",
  consciousness: "명료 (Alert)",
  systolic: "118",
  diastolic: "76",
  pulse: "96",
  spo2: "98",
  respiratoryRate: "20",
  temperature: "37.4",
  measuredAt: "13:38",
  assessment: "복통의 위치, 발생 시각, 동반 구토와 활력징후를 현장 평가자가 확인함",
  ktas: "3",
  evaluator: "용산119 구급대 · 3조",
};

interface HospitalOptions {
  caseId: string;
  patient: Patient;
  statuses: CallStatus[];
  callTime: string;
  distances?: number[];
  etas?: number[];
}

function createHospitals({ caseId, patient, statuses, callTime, distances, etas }: HospitalOptions): Hospital[] {
  const notes: Record<CallStatus, string> = {
    pending: "아직 전화하지 않았습니다.",
    calling: "담당 의료진에게 수용 가능 여부 확인 중",
    available: "응급실 수용 가능 응답",
    unavailable: "현재 수용 가능한 병상 없음",
    error: "통화 API 응답 시간 초과 · 상태 확인 필요",
  };
  const responses: Record<CallStatus, string> = {
    pending: "",
    calling: "환자 정보 확인했습니다. 담당 의료진에게 수용 가능 여부를 확인하겠습니다.",
    available: "현재 응급실 수용 가능합니다. 도착 예정 시간을 알려주세요.",
    unavailable: "현재 수용 가능한 병상이 없어 해당 환자 이송을 받을 수 없습니다.",
    error: "환자 정보를 전달해 주세요. 응급실 상황을 확인하겠습니다.",
  };

  return HOSPITALS.map((hospital, index) => {
    const status = statuses[index];
    const id = `${caseId}-hospital-${index + 1}`;
    const summary = `${patient.age}세 ${patient.gender}, ${patient.symptom} 환자입니다. 동반 증상은 ${patient.associatedSymptoms}입니다.`;
    return {
      ...hospital,
      id,
      position: [...hospital.position] as [number, number],
      distance: distances?.[index] ?? hospital.distance,
      eta: etas?.[index] ?? hospital.eta,
      status,
      note: notes[status],
      callSeconds: [83, 48, 67, 92, 55, 31][index],
      messages: [
        {
          id: `${id}-message-1`,
          role: "ai",
          text: `안녕하세요. ${patient.evaluator.split(" · ")[0]} 이송 지원 AI 올뺑이입니다. 환자 수용 가능 여부를 확인하려고 연락드렸습니다.`,
          time: `${callTime}:00`,
        },
        {
          id: `${id}-message-2`,
          role: "hospital",
          text: `${hospital.name} 응급실입니다. 환자 상태를 말씀해 주세요.`,
          time: `${callTime}:08`,
        },
        {
          id: `${id}-message-3`,
          role: "ai",
          text: `${summary} 의식은 ${patient.consciousness}, 혈압 ${patient.systolic}/${patient.diastolic} mmHg, 맥박 ${patient.pulse}회, SpO₂ ${patient.spo2}%입니다. 현장 Pre-KTAS ${patient.ktas}단계로 전달받았습니다.`,
          time: `${callTime}:17`,
        },
        {
          id: `${id}-message-4`,
          role: "hospital",
          text: responses[status],
          time: `${callTime}:28`,
        },
      ],
    };
  });
}

export const DEMO_CASES: EmergencyCase[] = [
  {
    id: "008",
    unit: "서초119",
    label: "흉통 환자",
    receivedAt: "14:08",
    elapsedSeconds: 1081,
    status: "searching",
    location: "서울 서초구 반포대로 · 서초역 인근",
    position: [37.4936, 127.0125],
    patient: { ...PATIENT_008 },
    hospitals: createHospitals({
      caseId: "008",
      patient: PATIENT_008,
      statuses: ["calling", "available", "calling", "available", "unavailable", "error"],
      callTime: "14:24",
    }),
    logs: [
      { id: "008-log-1", time: "14:08:00", title: "환자 접수", detail: "서초119 · 58세 남성 · 흉통 환자 접수" },
      { id: "008-log-2", time: "14:23:00", title: "현장 정보 갱신", detail: "활력징후와 현장 Pre-KTAS 2단계 평가 전달" },
      { id: "008-log-3", time: "14:24:00", title: "병원 동시 전화 시작", detail: "인근 6개 병원에 환자 정보 전달 및 수용 여부 확인", status: "calling" },
      { id: "008-log-4", time: "14:25:12", title: "이송 가능 응답", detail: "강남세브란스병원 · 순천향대 서울병원 수용 가능 응답", status: "available" },
      { id: "008-log-5", time: "14:25:42", title: "병원 응답 갱신", detail: "보라매병원 병상 부족으로 이송 불가 · 강남베드로병원 API 응답 시간 초과", status: "unavailable" },
    ],
  },
  {
    id: "007",
    unit: "강남119",
    label: "호흡곤란 환자",
    receivedAt: "13:59",
    elapsedSeconds: 1621,
    status: "searching",
    location: "서울 강남구 역삼동 · 강남역 인근",
    position: [37.498, 127.028],
    patient: { ...PATIENT_007 },
    hospitals: createHospitals({
      caseId: "007",
      patient: PATIENT_007,
      statuses: ["unavailable", "calling", "error", "calling", "unavailable", "available"],
      callTime: "14:21",
      distances: [3.6, 2.8, 8.1, 6.7, 11.2, 2.2],
      etas: [11, 8, 23, 18, 30, 7],
    }),
    logs: [
      { id: "007-log-1", time: "13:59:00", title: "환자 접수", detail: "강남119 · 72세 여성 · 호흡곤란 환자 접수" },
      { id: "007-log-2", time: "14:20:00", title: "현장 정보 갱신", detail: "호흡수 28회, SpO₂ 91% 및 현장 평가 전달" },
      { id: "007-log-3", time: "14:21:00", title: "병원 동시 전화 시작", detail: "인근 6개 병원에 호흡곤란 환자 수용 여부 확인", status: "calling" },
      { id: "007-log-4", time: "14:22:05", title: "이송 불가 응답", detail: "서울성모병원 · 보라매병원 병상 부족 · 중앙대학교병원 API 응답 오류", status: "unavailable" },
      { id: "007-log-5", time: "14:23:18", title: "이송 가능 응답", detail: "강남베드로병원 수용 가능 응답 · 담당자 병원 선정 중", status: "available" },
    ],
  },
  {
    id: "006",
    unit: "동작119",
    label: "낙상 환자",
    receivedAt: "13:42",
    elapsedSeconds: 2641,
    status: "assigned",
    location: "서울 동작구 상도동 · 상도역 인근",
    position: [37.5028, 126.9479],
    patient: { ...PATIENT_006 },
    hospitals: createHospitals({
      caseId: "006",
      patient: PATIENT_006,
      statuses: ["unavailable", "unavailable", "available", "unavailable", "unavailable", "error"],
      callTime: "14:06",
      distances: [7.8, 11.4, 2.1, 8.9, 3.4, 10.7],
      etas: [21, 31, 6, 25, 10, 29],
    }),
    logs: [
      { id: "006-log-1", time: "13:42:00", title: "환자 접수", detail: "동작119 · 46세 남성 · 낙상 후 발목 통증 환자 접수" },
      { id: "006-log-2", time: "14:05:00", title: "현장 정보 갱신", detail: "오른쪽 발목 부종과 통증, 현장 Pre-KTAS 3단계 평가 전달" },
      { id: "006-log-3", time: "14:06:00", title: "병원 동시 전화 시작", detail: "인근 6개 병원에 낙상 환자 수용 여부 확인", status: "calling" },
      { id: "006-log-4", time: "14:08:20", title: "병원 응답 확인", detail: "중앙대학교병원 수용 가능 · 다른 4개 병원 수용 불가 · 강남베드로병원 API 응답 오류", status: "available" },
      { id: "006-log-5", time: "14:10:00", title: "이송 병원 선정", detail: "중앙대학교병원으로 이송 병원 확정 · 구급대 전달 완료", status: "available" },
    ],
  },
  {
    id: "005",
    unit: "용산119",
    label: "복통 환자",
    receivedAt: "13:18",
    elapsedSeconds: 2940,
    status: "completed",
    location: "서울 용산구 한남동 · 한남오거리 인근",
    position: [37.5311, 127.0063],
    patient: { ...PATIENT_005 },
    hospitals: createHospitals({
      caseId: "005",
      patient: PATIENT_005,
      statuses: ["unavailable", "unavailable", "unavailable", "available", "unavailable", "error"],
      callTime: "13:39",
      distances: [5.5, 8.3, 8.1, 0.8, 11.7, 8.6],
      etas: [15, 23, 22, 3, 32, 24],
    }),
    logs: [
      { id: "005-log-1", time: "13:18:00", title: "환자 접수", detail: "용산119 · 34세 여성 · 복통 환자 접수" },
      { id: "005-log-2", time: "13:39:00", title: "병원 동시 전화 시작", detail: "인근 6개 병원에 복통과 동반 구토 증상 전달", status: "calling" },
      { id: "005-log-3", time: "13:41:12", title: "병원 응답 확인", detail: "순천향대 서울병원 수용 가능 · 다른 4개 병원 수용 불가 · 강남베드로병원 API 응답 오류", status: "available" },
      { id: "005-log-4", time: "13:43:00", title: "이송 병원 선정", detail: "순천향대 서울병원으로 이송 병원 확정", status: "available" },
      { id: "005-log-5", time: "14:07:00", title: "이송 완료", detail: "순천향대 서울병원 도착 및 환자 인계 완료", status: "available" },
    ],
  },
];
