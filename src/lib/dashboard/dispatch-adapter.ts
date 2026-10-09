import type { EmergencyCase, Hospital, Patient } from './types.ts';
import { captionMessages, type DispatchJob, type DispatchHospital } from './live-data.ts';
import { BEDS, DEPARTMENTS, EQUIPMENT, PROCEDURES } from '../hospitals.ts';

export type CallBatch = {
  key: string; caseId: string; jobId?: string; uncertain?: boolean;
  targets: { id: string; phone: string }[];
  body: { patient: DispatchJob['patient']; hospitals: { name: string; phone: string; eta_minutes: number }[] };
};
export function phoneNumber(value: string): string {
  let phone = value.replace(/[\s()-]/g, '');
  if (phone.startsWith('0')) phone = '+82' + phone.slice(1);
  if (!/^\+[1-9]\d{7,14}$/.test(phone)) throw new Error('전화번호를 확인하세요.');
  return phone;
}

export function callPatient(reception: EmergencyCase): DispatchJob['patient'] {
  const p = reception.patient;
  if (!/^\d+$/.test(p.age.trim()) || Number(p.age) > 120) throw new Error('환자 나이를 확인하세요.');
  if (!p.symptom.trim()) throw new Error('환자의 주증상을 입력하세요.');
  const fields: [keyof Patient, string][] = [
    ['gender','성별'], ['symptom','주증상'], ['associatedSymptoms','동반 증상'], ['impression','현장 관찰'],
    ['consciousness','의식'], ['onset','발생 시각'], ['onsetAccuracy','발생 시각 정확도'], ['pain','통증 점수'],
    ['systolic','수축기 혈압 mmHg'], ['diastolic','이완기 혈압 mmHg'], ['pulse','맥박 회/분'],
    ['spo2','산소포화도 %'], ['respiratoryRate','호흡수 회/분'], ['temperature','체온 °C'],
    ['measuredAt','활력징후 측정 시각'], ['infection','감염 관련'], ['history','과거력'],
    ['ktas','현장 Pre-KTAS 단계'], ['assessment','현장 평가'],
  ];
  const lines = fields.filter(([key]) => p[key].trim()).map(([key,label]) => `${label}: ${p[key].trim()}`);
  const search = reception.candidateSearch?.parameters;
  if (search) {
    const requirements = [...search.departments.map(code=>DEPARTMENTS[code]), ...search.procedures.map(code=>PROCEDURES[code]),
      ...search.equipment.map(code=>EQUIPMENT[code]), ...search.beds.map(code=>BEDS[code])];
    if (requirements.length) lines.push(`현장에서 요청한 진료·장비·병상: ${requirements.join(', ')}`);
  }
  const condition = lines.join('\n');
  if (condition.length > 2000) throw new Error('병원에 전달할 환자 정보가 너무 깁니다. 입력 내용을 줄여 주세요.');
  // The current Pre-KTAS form has no name field. This is a missing-data label, never an invented name.
  return { name:'성명 미제공', age:Number(p.age), condition, location:reception.location };
}

export function planCalls(reception: EmergencyCase, targetIds: string[], key: ()=>string) {
  const patient = callPatient(reception);
  const batches: CallBatch[] = [], skipped: { id:string; reason:string }[] = [];
  const eligible: { hospital:Hospital; phone:string }[] = [], numbers = new Set<string>();
  for (const hospital of reception.hospitals.filter(h=>targetIds.includes(h.id))) {
    try {
      const phone = phoneNumber(hospital.demoPhone || hospital.candidate?.emergencyPhone || hospital.candidate?.phone || '');
      if (hospital.eta === null || !Number.isInteger(hospital.eta) || hospital.eta < 1 || hospital.eta > 360)
        throw new Error('도착시간이 확인되지 않아 발신하지 않았습니다. 경로를 다시 조회하세요.');
      if (numbers.has(phone)) throw new Error('같은 전화번호의 중복 후보입니다. 해당 번호에는 한 번만 발신합니다.');
      numbers.add(phone); eligible.push({hospital,phone});
    } catch (error) { skipped.push({id:hospital.id, reason:error instanceof Error ? error.message : '발신 정보를 확인하세요.'}); }
  }
  if (eligible.length > 10) throw new Error('동시 발신은 최대 10곳입니다. 병원 조회 범위를 줄여 주세요.');
  for (let i=0;i<eligible.length;i+=2) {
    const pair=eligible.slice(i,i+2);
    batches.push({key:key(),caseId:reception.id, targets:pair.map(({hospital,phone})=>({id:hospital.id,phone})),
      body:{patient,hospitals:pair.map(({hospital,phone})=>({name:hospital.name,phone,eta_minutes:hospital.eta!}))}});
  }
  return {batches,skipped};
}
export function projectHospital(original:Hospital, call:DispatchHospital, now:number): Hospital {
  const messages=captionMessages(call);
  return {...original, status:call.result ? call.result.availability==='accepted' ? 'available' : 'unavailable' : 'calling',
    note:call.result ? call.result.availability==='accepted' ? '수용 가능' : '수용 불가'
      : call.phase==='processing' ? '통화 종료 · 결과 판정 중' : call.call_status==='in-progress' ? '실시간 통화 중' : '전화 연결 중',
    callSeconds:call.answered_at ? Math.max(0,((call.voice_ended_at ? Date.parse(call.voice_ended_at) : now)-Date.parse(call.answered_at))/1000) : 0,
    messages:call.result ? messages : messages.slice(0,-1)};
}
