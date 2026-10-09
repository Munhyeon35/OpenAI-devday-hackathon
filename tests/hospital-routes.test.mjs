import assert from "node:assert/strict";
import test from "node:test";
import { hospitalSearchSchema } from "../src/lib/hospitals.ts";
import { enrichRoadRoutes, routingUrl } from "../src/lib/server/hospital-routes.ts";
import { candidateHospitals } from "../src/lib/dashboard/patient-workflow.ts";
import { compareHospitalTravel, hospitalDistanceLabel } from "../src/lib/dashboard/types.ts";

const input = hospitalSearchSchema.parse({ latitude: 35.1577, longitude: 129.0592 });
const candidates = [
  { id: "B", name: "가상 응급실", latitude: 35.16, longitude: 129.05, distanceKm: 0.8, acceptance: "unconfirmed", checks: [], match: "reported_match" },
  { id: "A", name: "다른 응급실", latitude: 35.17, longitude: 129.07, distanceKm: 2.1, acceptance: "unconfirmed", checks: [], match: "reported_match" },
];
const base = () => ({ source: "국립중앙의료원", candidates, distanceType: "straight_line", totalNearby: 10, totalMatched: 2, warnings: ["공공데이터 조회 결과는 환자 수용 확정이 아닙니다. 이송 전 병원 확인이 필요합니다.", "거리는 직선거리입니다. 도로 이동시간은 제공하지 않습니다."] });
const calculatedAt = "2026-10-09T06:00:00Z";
const table = (overrides = {}) => ({ code: "Ok", distances: [[1350, 4260]], durations: [[104.7, 370]], sources: [{ distance: 10 }], destinations: [{ distance: 5 }, { distance: 25 }], ...overrides });
const read = (data) => async () => ({ data, calculatedAt });

test("batch routing sends coordinates in longitude/latitude order with one source and independent destinations", () => {
  const url = routingUrl(input, candidates);
  assert.equal(url.origin, "https://router.project-osrm.org");
  assert.equal(url.pathname, "/table/v1/driving/129.059200,35.157700;129.050000,35.160000;129.070000,35.170000");
  assert.equal(url.searchParams.get("sources"), "0");
  assert.equal(url.searchParams.get("destinations"), "1;2");
  assert.equal(url.searchParams.get("annotations"), "distance,duration");
  assert.ok(!decodeURIComponent(url.href).includes(candidates[0].name));
});

test("road meters and seconds map to each hospital, preserving straight distance, capacity and source time", async () => {
  let calls = 0;
  const result = await enrichRoadRoutes(input, base(), async () => { calls++; return { data: table(), calculatedAt }; });
  assert.equal(calls, 1);
  assert.equal(result.distanceType, "road");
  assert.equal(result.routing.status, "complete");
  assert.equal(result.candidates[0].roadRoute.distanceKm, 1.35);
  assert.equal(result.candidates[1].roadRoute.durationSeconds, 370);
  assert.equal(result.candidates[0].roadRoute.calculatedAt, calculatedAt);
  assert.equal(result.candidates[0].distanceKm, 0.8);
  assert.equal(result.candidates[0].acceptance, "unconfirmed");
  assert.match(result.warnings.join(" "), /실시간 교통/);
  assert.ok(!("roadRoute" in candidates[0]));
  const hospitals = candidateHospitals("009", result);
  assert.equal(hospitals[0].distance, 1.35);
  assert.equal(hospitals[0].eta, 2);
  assert.equal(hospitals[1].eta, 7);
  assert.equal(hospitalDistanceLabel(hospitals[0]), "도로");
  assert.ok(hospitals.every((hospital) => hospital.status === "pending" && !hospital.messages.length));
});

test("unreachable destinations keep a clearly distinguished straight distance and no ETA", async () => {
  const result = await enrichRoadRoutes(input, base(), read(table({ distances: [[1350, null]], durations: [[104.7, null]] })));
  assert.equal(result.distanceType, "mixed");
  assert.equal(result.routing.status, "partial");
  const hospitals = candidateHospitals("009", result);
  assert.equal(hospitals[1].distance, 2.1);
  assert.equal(hospitals[1].eta, null);
  assert.equal(hospitalDistanceLabel(hospitals[1]), "직선");
  assert.match(result.warnings.join(" "), /확인하지 못한 1곳/);
});

test("network errors fall back to straight distance without leaking errors or reusing old routes", async () => {
  const enriched = await enrichRoadRoutes(input, base(), read(table()));
  const result = await enrichRoadRoutes(input, enriched, async () => { throw new Error("secret and sensitive coordinates"); });
  assert.equal(result.routing.status, "unavailable");
  assert.ok(result.candidates.every((candidate) => !candidate.roadRoute));
  assert.ok(!JSON.stringify(result).includes("secret"));
  assert.ok(candidateHospitals("009", result).every((hospital) => hospital.eta === null));
});

test("malformed matrices and non-numeric values never produce a road distance or ETA", async () => {
  for (const invalid of [
    { code: "NoTable" }, table({ distances: [[1350]] }), table({ durations: [[104.7, "370"]] }),
    table({ distances: [[-1, 4260]] }), table({ durations: [[Infinity, 370]] }),
    table({ destinations: [{ distance: 5 }] }), table({ sources: [] }),
  ]) {
    const result = await enrichRoadRoutes(input, base(), read(invalid));
    assert.equal(result.routing.status, "unavailable");
    assert.ok(result.candidates.every((candidate) => !candidate.roadRoute));
  }
});

test("coordinates snapped over 250m away cannot stand in for the ambulance or hospital", async () => {
  const origin = await enrichRoadRoutes(input, base(), read(table({ sources: [{ distance: 251 }] })));
  assert.equal(origin.routing.status, "unavailable");
  const destination = await enrichRoadRoutes(input, base(), read(table({ destinations: [{ distance: 5 }, { distance: 251 }] })));
  assert.equal(destination.routing.status, "partial");
  assert.equal(destination.candidates[1].roadRoute, undefined);
});

test("valid zero-length routes are accepted while missing values remain unknown", async () => {
  const result = await enrichRoadRoutes(input, base(), read(table({ distances: [[0, null]], durations: [[0, null]] })));
  const hospitals = candidateHospitals("009", result);
  assert.equal(hospitals[0].distance, 0);
  assert.equal(hospitals[0].eta, 1);
  assert.equal(hospitals[1].eta, null);
});

test("distance and ETA sorting put unknown routes after known routes", async () => {
  const result = await enrichRoadRoutes(input, base(), read(table({ distances: [[null, 4260]], durations: [[null, 370]] })));
  const hospitals = candidateHospitals("009", result);
  for (const sort of ["distance", "eta"]) {
    assert.equal([...hospitals].sort((a, b) => compareHospitalTravel(a, b, sort))[0].candidate.id, "A");
  }
});

test("no hospital candidates means no external route request", async () => {
  const empty = { ...base(), candidates: [] };
  assert.equal(await enrichRoadRoutes(input, empty, async () => { assert.fail("unexpected request"); }), empty);
});
