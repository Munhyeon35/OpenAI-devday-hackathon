"use client";

import { useEffect, useReducer } from "react";
import { DEMO_CASES } from "@/lib/dashboard/demo-data";
import { formatDuration, type EmergencyCase, type Hospital, type Patient } from "@/lib/dashboard/types";

type State = { cases: EmergencyCase[]; runtime: Record<string, number> };
type Action = { type: "tick"; delta: number } | { type: "save"; caseId: string; patient: Patient } | { type: "retry"; caseId: string; hospitalId: string };

function timeOfCase(reception: EmergencyCase, offsetSeconds = 0) {
  const [hours, minutes] = reception.receivedAt.split(":").map(Number);
  const total = hours * 3600 + minutes * 60 + Math.floor(reception.elapsedSeconds + offsetSeconds);
  return `${Math.floor(total / 3600).toString().padStart(2, "0")}:${formatDuration(total % 3600)}`;
}

function scriptFor(reception: EmergencyCase, hospital: Hospital, index: number) {
  const outcome = index % 2 === 0 ? "available" as const : "unavailable" as const;
  return [
    { at: 2, role: "hospital" as const, text: `${reception.patient.symptom} 환자 확인했습니다. 현재 수용 가능한 병상과 담당 의료진을 확인하고 있습니다.` },
    { at: 30, role: "ai" as const, text: `네, ${reception.patient.age}세 ${reception.patient.gender} 환자입니다. 현재 의식은 ${reception.patient.consciousness}이며, 예상 도착 시간은 ${hospital.eta}분입니다. 수용 가능 여부 확인 부탁드립니다.` },
    { at: 72 + index * 5, role: "hospital" as const, text: outcome === "available" ? "확인했습니다. 환자 수용 가능합니다. 응급실로 이송해 주세요." : "현재 응급실 가용 병상이 없어 환자 수용이 어렵습니다.", outcome },
  ].map((line) => ({ ...line, until: line.at + line.text.length / 4 }));
}

function reducer(state: State, action: Action): State {
  if (action.type === "save") return { ...state, cases: state.cases.map((reception) => reception.id !== action.caseId ? reception : {
    ...reception, patient: action.patient, label: `${action.patient.symptom} 환자`,
    logs: [...reception.logs, { id: `${reception.id}-edit-${reception.logs.length}`, time: timeOfCase(reception), title: "환자 정보 수정", detail: "관제 담당자가 환자 기본정보, 증상 및 현장 평가 정보를 수정했습니다." }],
  }) };
  if (action.type === "retry") {
    const targetCase = state.cases.find((reception) => reception.id === action.caseId);
    const targetHospital = targetCase?.hospitals.find((hospital) => hospital.id === action.hospitalId);
    if (!targetCase || targetCase.status === "completed" || targetHospital?.status !== "error") return state;
    return { runtime: { ...state.runtime, [action.hospitalId]: 0 }, cases: state.cases.map((reception) => reception.id !== action.caseId ? reception : {
    ...reception,
    hospitals: reception.hospitals.map((hospital) => hospital.id !== action.hospitalId ? hospital : { ...hospital, status: "calling", callSeconds: 0, note: "연결을 다시 시도하고 있습니다.", messages: [...hospital.messages, { id: `${hospital.id}-retry-${reception.logs.length}`, role: "ai", time: timeOfCase(reception), text: `${reception.unit}의 환자 이송 문의입니다. 연결을 다시 시도합니다.` }] }),
    logs: [...reception.logs, { id: `${reception.id}-retry-${reception.logs.length}`, time: timeOfCase(reception), title: "병원 연결 재시도", detail: `${reception.hospitals.find((hospital) => hospital.id === action.hospitalId)?.name}에 다시 연결합니다.`, status: "calling" }],
    }) };
  }
  const runtime = { ...state.runtime };
  const cases = state.cases.map((reception) => {
    let logs = reception.logs;
    const hospitals = reception.hospitals.map((hospital, index) => {
      if (hospital.status !== "calling") return hospital;
      const before = runtime[hospital.id] ?? 0;
      const script = scriptFor(reception, hospital, index);
      const elapsed = Math.min(before + action.delta, script[script.length - 1].until);
      runtime[hospital.id] = elapsed;
      let next = { ...hospital, callSeconds: hospital.callSeconds + elapsed - before };
      script.forEach((line, lineIndex) => {
        if (before < line.until && elapsed >= line.until && !next.messages.some((message) => message.id === `${hospital.id}-stream-${lineIndex}`)) {
          const time = timeOfCase(reception, line.until - before);
          next = { ...next, messages: [...next.messages, { id: `${hospital.id}-stream-${lineIndex}`, role: line.role, text: line.text, time }] };
          if ("outcome" in line) {
            next = { ...next, status: line.outcome!, note: line.text };
            logs = [...logs, { id: `${hospital.id}-outcome`, time, title: `${hospital.name} · ${line.outcome === "available" ? "이송 가능" : "이송 불가"}`, detail: line.text, status: line.outcome }];
          }
        }
      });
      return next;
    });
    return { ...reception, hospitals, logs: logs === reception.logs ? logs : [...logs].sort((left, right) => left.time.localeCompare(right.time)), elapsedSeconds: reception.elapsedSeconds + (reception.status !== "completed" ? action.delta : 0) };
  });
  return { cases, runtime };
}

export function useDemoDashboard() {
  const [state, dispatch] = useReducer(reducer, { cases: DEMO_CASES, runtime: {} });
  useEffect(() => {
    let previous = Date.now();
    const interval = window.setInterval(() => {
      const now = Date.now();
      dispatch({ type: "tick", delta: (now - previous) / 1000 });
      previous = now;
    }, 200);
    return () => window.clearInterval(interval);
  }, []);

  function getStream(reception: EmergencyCase, hospital: Hospital | undefined) {
    if (!hospital || hospital.status !== "calling") return { text: "", role: "hospital" as const };
    const runtime = state.runtime[hospital.id] ?? 0;
    const line = scriptFor(reception, hospital, reception.hospitals.findIndex((entry) => entry.id === hospital.id)).find((entry) => runtime >= entry.at && runtime < entry.until);
    return line ? { text: line.text.slice(0, Math.floor((runtime - line.at) * 4)), role: line.role } : { text: "", role: "hospital" as const };
  }

  return { cases: state.cases, getStream, savePatient: (caseId: string, patient: Patient) => dispatch({ type: "save", caseId, patient }), retryCall: (caseId: string, hospitalId: string) => dispatch({ type: "retry", caseId, hospitalId }) };
}
