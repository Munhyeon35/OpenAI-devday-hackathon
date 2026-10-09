"use client";

import { useEffect, useReducer, useRef } from "react";
import { DEMO_CASES } from "@/lib/dashboard/demo-data";
import { type EmergencyCase, type Hospital, type Patient } from "@/lib/dashboard/types";
import type { HospitalSearch, HospitalSearchResult } from "@/lib/hospitals";
import { dashboardReducer, scriptFor } from "@/lib/dashboard/state";


export function useDemoDashboard() {
  const [state, dispatch] = useReducer(dashboardReducer, { cases: DEMO_CASES, runtime: {} });
  const requests = useRef(new Map<string, AbortController>());
  useEffect(() => {
    const active = requests.current;
    return () => { active.forEach((controller) => controller.abort()); active.clear(); };
  }, []);

  async function searchHospitals(caseId: string, patient: Patient, parameters: HospitalSearch) {
    requests.current.get(caseId)?.abort();
    const controller = new AbortController();
    requests.current.set(caseId, controller);
    const requestId = crypto.randomUUID();
    dispatch({ type: "search", caseId, patient, parameters, requestId });
    try {
      const response = await fetch("/api/hospitals/candidates", {
        method: "POST", headers: { "Content-Type": "application/json" },
        signal: controller.signal, body: JSON.stringify(parameters),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "병원 조회에 실패했습니다.");
      if (!controller.signal.aborted) dispatch({ type: "searchResult", caseId, requestId, result: data as HospitalSearchResult });
    } catch (error) {
      if (!controller.signal.aborted) dispatch({ type: "searchError", caseId, requestId, error: error instanceof Error ? error.message : "병원 조회에 실패했습니다." });
    } finally { if (requests.current.get(caseId) === controller) requests.current.delete(caseId); }
  }
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

  return { cases: state.cases, getStream, searchHospitals,
    addCase: (reception: EmergencyCase) => dispatch({ type: "add", reception }),
    startDemoCalls: (caseId: string) => dispatch({ type: "startDemoCalls", caseId }),
    savePatient: (caseId: string, patient: Patient) => dispatch({ type: "save", caseId, patient }),
    retryCall: (caseId: string, hospitalId: string) => dispatch({ type: "retry", caseId, hospitalId }) };
}
