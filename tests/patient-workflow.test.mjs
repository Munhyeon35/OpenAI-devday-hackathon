import test from "node:test";
import assert from "node:assert/strict";
import { dashboardReducer, scriptFor } from "../src/lib/dashboard/state.ts";
import { createDraftCase, DEMO_SEARCH } from "../src/lib/dashboard/patient-workflow.ts";

const candidate = { id: "A0001", name: "테스트 응급실", address: "서울", emergencyPhone: "02-000-0000", phone: null, classification: "응급의료센터", latitude: 37.5, longitude: 127, distanceKm: 1.5, acceptance: "unconfirmed", match: "reported_match", checks: [], beds: {}, bedUpdatedAt: null, bedDataFresh: false, procedureNotes: [] };
const result = { source: "국립중앙의료원", retrievedAt: "2026-10-09T06:00:00Z", sourceRetrievedAt: { hospitals: "2026-10-09T06:00:00Z", beds: null, procedures: null }, distanceType: "straight_line", totalNearby: 2, totalMatched: 2, candidates: [candidate, { ...candidate, id: "A0002" }], warnings: [] };
const draft = (id = "009") => createDraftCase(id, [37.49, 127.01], new Date("2026-10-09T06:00:00Z"));
function searching(state = { cases: [draft()], runtime: {} }, requestId = "request-1") {
  return dashboardReducer(state, { type: "search", caseId: "009", requestId, patient: { ...draft().patient, age: "58", symptom: "흉통" }, parameters: DEMO_SEARCH });
}
function ready(state = searching(), requestId = "request-1", response = result) {
  return dashboardReducer(state, { type: "searchResult", caseId: "009", requestId, result: response });
}

test("adding a patient creates an empty draft without hospitals or calls", () => {
  const state = dashboardReducer({ cases: [], runtime: {} }, { type: "add", reception: draft() });
  assert.equal(state.cases[0].status, "draft");
  assert.equal(state.cases[0].patient.age, "");
  assert.deepEqual(state.cases[0].hospitals, []);
  assert.equal(state.cases[0].receivedAt, "15:00");
});

test("real API candidates remain pending through time ticks, with no invented ETA or transcript", () => {
  const state = dashboardReducer(ready(), { type: "tick", delta: 300 });
  assert.equal(state.cases[0].status, "ready");
  for (const hospital of state.cases[0].hospitals) {
    assert.equal(hospital.status, "pending");
    assert.equal(hospital.eta, null);
    assert.equal(hospital.callSeconds, 0);
    assert.deepEqual(hospital.messages, []);
    assert.equal(hospital.candidate.acceptance, "unconfirmed");
    assert.deepEqual(hospital.position, [candidate.latitude, candidate.longitude]);
  }
});

test("explicit bulk demo start applies once to the selected case", () => {
  const state = { ...ready(), cases: [...ready().cases, draft("010")] };
  const started = dashboardReducer(state, { type: "startDemoCalls", caseId: "009" });
  assert.ok(started.cases[0].hospitals.every((hospital) => hospital.status === "calling"));
  assert.equal(started.cases[1], state.cases[1]);
  const twice = dashboardReducer(started, { type: "startDemoCalls", caseId: "009" });
  assert.deepEqual(twice, started);
  assert.match(started.cases[0].logs.at(-1).detail, /실제 발신.*아닙니다/);
});

test("older responses and errors cannot overwrite a newer query", () => {
  const state = searching(searching(), "request-2");
  assert.deepEqual(ready(state), state);
  assert.deepEqual(dashboardReducer(state, { type: "searchError", caseId: "009", requestId: "request-1", error: "old failure" }), state);
  assert.equal(ready(state, "request-2").cases[0].candidateSearch.status, "ready");
});

test("failure or no matches leaves no candidates and cannot start a call", () => {
  const failed = dashboardReducer(searching(), { type: "searchError", caseId: "009", requestId: "request-1", error: "조회 실패" });
  assert.equal(failed.cases[0].candidateSearch.status, "error");
  for (const state of [failed, ready(searching(), "request-1", { ...result, candidates: [], totalMatched: 0 })]) {
    assert.deepEqual(dashboardReducer(state, { type: "startDemoCalls", caseId: "009" }), state);
    assert.deepEqual(state.cases[0].hospitals, []);
  }
});

test("a second search clears former demo progress and starts again from pending", () => {
  const started = dashboardReducer(ready(), { type: "startDemoCalls", caseId: "009" });
  const finished = dashboardReducer(started, { type: "tick", delta: 300 });
  assert.equal(finished.cases[0].hospitals[0].status, "available");
  const refresh = ready(searching(finished, "request-2"), "request-2");
  assert.deepEqual(refresh.runtime, {});
  assert.ok(refresh.cases[0].hospitals.every((hospital) => hospital.status === "pending"));
  const restarted = dashboardReducer(dashboardReducer(refresh, { type: "startDemoCalls", caseId: "009" }), { type: "tick", delta: 1 });
  assert.equal(restarted.cases[0].hospitals[0].callSeconds, 1);
  assert.deepEqual(restarted.cases[0].hospitals[0].messages, []);
});

test("hospital IDs do not collide across patients and demo scripts disclose missing ETA", () => {
  const state = ready();
  const other = dashboardReducer({ cases: [{ ...searching().cases[0], id: "010" }], runtime: {} }, { type: "searchResult", caseId: "010", requestId: "request-1", result });
  assert.notEqual(state.cases[0].hospitals[0].id, other.cases[0].hospitals[0].id);
  assert.match(scriptFor(state.cases[0], state.cases[0].hospitals[0], 0)[1].text, /도착 예정 시간은 아직 확인되지/);
});
