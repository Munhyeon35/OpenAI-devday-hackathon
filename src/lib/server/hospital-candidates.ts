import { BEDS, DEPARTMENTS, EQUIPMENT, PROCEDURES, hospitalSearchSchema,
  type ConditionCheck, type HospitalCandidate, type HospitalSearch, type HospitalSearchResult } from "../hospitals.ts";
import { OpenDataError, readOpenData, type OpenDataRead, type OpenDataRow } from "./opendata.ts";

const STALE_AFTER_MS = 20 * 60 * 1000;
const numberValue = (value: string | undefined) => value?.trim() && /^-?\d+(\.\d+)?$/.test(value.trim()) ? Number(value) : null;
const yesNo = (value: string | undefined): ConditionCheck["status"] =>
  value?.trim().toUpperCase() === "Y" ? "reported_available" : value?.trim().toUpperCase() === "N" ? "reported_unavailable" : "unknown";

export function parseReportTime(value: string | undefined): string | null {
  if (!value || !/^\d{14}$/.test(value)) return null;
  const iso = `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}T${value.slice(8, 10)}:${value.slice(10, 12)}:${value.slice(12, 14)}+09:00`;
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return null;
  const roundtrip = new Date(date.getTime() + 9 * 3600000).toISOString().slice(0, 19).replace(/\D/g, "");
  return roundtrip === value ? iso : null;
}

export function distanceKm(lat: number, lon: number, otherLat: number, otherLon: number) {
  const rad = (degree: number) => degree * Math.PI / 180;
  const a = Math.sin(rad(otherLat - lat) / 2) ** 2 + Math.cos(rad(lat)) * Math.cos(rad(otherLat)) * Math.sin(rad(otherLon - lon) / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(Math.min(1, a)));
}

const byId = (rows: OpenDataRow[]) => new Map(rows.filter((row) => row.hpid).map((row) => [row.hpid, row]));

export async function searchHospitalCandidates(input: HospitalSearch, read: OpenDataRead = readOpenData, now = new Date()): Promise<HospitalSearchResult> {
  // Fetch the national list, then calculate a geographic radius ourselves. The
  // location endpoint has no configurable radius; a nearby first page is not exhaustive.
  const hospitals = await read("getEgytListInfoInqire");
  const nearby = [...byId(hospitals.items).values()].flatMap((row) => {
    const latitude = numberValue(row.wgs84lat), longitude = numberValue(row.wgs84lon);
    if (latitude === null || longitude === null || Math.abs(latitude) > 90 || Math.abs(longitude) > 180 || (latitude === 0 && longitude === 0)) return [];
    const distance = distanceKm(input.latitude, input.longitude, latitude, longitude);
    return distance <= input.radiusKm ? [{ row, latitude, longitude, distance }] : [];
  });
  const warnings: string[] = [
    "공공데이터 조회 결과는 환자 수용 확정이 아닙니다. 이송 전 병원 확인이 필요합니다.",
    "거리는 직선거리입니다. 도로 이동시간은 제공하지 않습니다.",
  ];
  if (!nearby.length) return { source: "국립중앙의료원", retrievedAt: now.toISOString(), sourceRetrievedAt: { hospitals: hospitals.retrievedAt, beds: null, procedures: null }, distanceType: "straight_line", totalNearby: 0, totalMatched: 0, candidates: [], warnings };

  const [bedResult, procedureResult, ...departmentResults] = await Promise.allSettled([
    read("getEmrrmRltmUsefulSckbdInfoInqire", { STAGE1: "", STAGE2: "" }),
    input.procedures.length ? read("getSrsillDissAceptncPosblInfoInqire", { STAGE1: "", STAGE2: "" }) : Promise.resolve(null),
    ...input.departments.map((QD) => read("getEgytListInfoInqire", { QD })),
  ]);
  const bedData = bedResult.status === "fulfilled" ? bedResult.value : null;
  const procedureData = procedureResult.status === "fulfilled" ? procedureResult.value : null;
  if (bedResult.status === "rejected") warnings.push("실시간 병상·장비 조회에 실패하여 해당 조건은 확인 필요로 표시합니다.");
  if (procedureResult.status === "rejected") warnings.push("중증질환 수용정보 조회에 실패하여 시술 조건은 확인 필요로 표시합니다.");
  if (departmentResults.some((result) => result.status === "rejected")) warnings.push("일부 진료과 조회에 실패했습니다. 해당 진료과는 병원 확인이 필요합니다.");
  if (input.departments.length) warnings.push("진료과 등록 여부는 현재 당직 의료진의 진료 가능 여부를 뜻하지 않습니다.");
  if (input.procedures.length) warnings.push("시술 수용정보는 제공기관 보고값이며 개별 갱신 시각이 없을 수 있습니다. 연령 등 부가조건은 별도 확인해야 합니다.");
  const bedRows = byId(bedData?.items ?? []), procedureRows = byId(procedureData?.items ?? []);
  const departmentIds = departmentResults.map((result) => result.status === "fulfilled" && result.value ? new Set(result.value.items.map((row) => row.hpid)) : null);

  const candidates: HospitalCandidate[] = nearby.flatMap(({ row, latitude, longitude, distance }) => {
    const bed = bedRows.get(row.hpid), procedure = procedureRows.get(row.hpid);
    const bedUpdatedAt = parseReportTime(bed?.hvidate);
    const age = bedUpdatedAt ? now.getTime() - Date.parse(bedUpdatedAt) : Infinity;
    const bedDataFresh = age >= -60000 && age <= STALE_AFTER_MS;
    const staleNote = bedDataFresh ? null : "병상·장비 보고 시각이 없거나 20분을 초과했습니다.";
    const checks: ConditionCheck[] = [
      ...input.departments.map((code, index): ConditionCheck => ({ code, label: DEPARTMENTS[code],
        status: departmentIds[index] ? departmentIds[index]!.has(row.hpid) ? "reported_available" : "reported_unavailable" : "unknown", detail: "진료과 등록 기준 · 당직 여부 별도 확인" })),
      ...input.procedures.map((code): ConditionCheck => {
        const note = procedure?.[`${code}msg`] || null;
        const status = yesNo(procedure?.[code]);
        return { code, label: PROCEDURES[code], status: note && status === "reported_available" ? "unknown" : status, detail: note };
      }),
      ...input.equipment.map((code): ConditionCheck => ({ code, label: EQUIPMENT[code], status: bedDataFresh ? yesNo(bed?.[code]) : "unknown", detail: staleNote })),
      ...input.beds.map((code): ConditionCheck => {
        const count = numberValue(bed?.[code]);
        return { code, label: BEDS[code], status: !bedDataFresh || count === null ? "unknown" : count > 0 ? "reported_available" : "reported_unavailable", detail: staleNote ?? (count === null ? null : `보고된 가용 수: ${count}`) };
      }),
    ];
    if (checks.some((check) => check.status === "reported_unavailable")) return [];
    if (!input.includeUnknown && checks.some((check) => check.status === "unknown")) return [];
    return [{ id: row.hpid, name: row.dutyname || row.hpid, address: row.dutyaddr || "",
      emergencyPhone: row.dutytel3 || bed?.dutytel3 || null, phone: row.dutytel1 || null,
      classification: row.dutyemclsname || null, latitude, longitude,
      distanceKm: Math.round(distance * 100) / 100, acceptance: "unconfirmed" as const,
      match: checks.length && checks.every((check) => check.status === "reported_available") ? "reported_match" as const : "needs_confirmation" as const,
      checks, beds: Object.fromEntries(Object.keys(BEDS).map((code) => [code, numberValue(bed?.[code])])) as HospitalCandidate["beds"],
      bedUpdatedAt, bedDataFresh,
      procedureNotes: input.procedures.flatMap((code) => {
        const note = procedure?.[`${code}msg`];
        return note ? [`${PROCEDURES[code]}: ${note}`] : [];
      }),
    }];
  });
  candidates.sort((left, right) => Number(left.match === "needs_confirmation") - Number(right.match === "needs_confirmation") || left.distanceKm - right.distanceKm);
  return { source: "국립중앙의료원", retrievedAt: now.toISOString(), sourceRetrievedAt: { hospitals: hospitals.retrievedAt, beds: bedData?.retrievedAt ?? null, procedures: procedureData?.retrievedAt ?? null },
    distanceType: "straight_line", totalNearby: nearby.length, totalMatched: candidates.length, candidates: candidates.slice(0, input.limit), warnings };
}

const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
export async function handleHospitalSearch(request: Request, read: OpenDataRead = readOpenData, enrich?: (input: HospitalSearch, result: HospitalSearchResult) => Promise<HospitalSearchResult>) {
  const url = new URL(request.url);
  const origin = request.headers.get("origin");
  // Match the existing operator UI's localhost-only boundary.
  const host = request.headers.get("host") || url.host;
  if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) || !["localhost", "127.0.0.1", "[::1]"].some((name) => host === name || host.startsWith(`${name}:`)) || origin !== `${url.protocol}//${host}`)
    return json({ error: "병원 검색은 localhost의 같은 출처에서만 사용할 수 있습니다." }, 403);
  if (!request.headers.get("content-type")?.startsWith("application/json")) return json({ error: "JSON 요청을 사용하세요." }, 415);
  let input: unknown;
  try {
    const reader = request.body?.getReader();
    if (!reader) return json({ error: "검색 조건을 입력하세요." }, 400);
    const chunks: Uint8Array[] = [];
    let size = 0;
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 8192) { await reader.cancel(); return json({ error: "검색 조건이 너무 큽니다." }, 413); }
      chunks.push(value);
    }
    input = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch { return json({ error: "검색 조건의 JSON 형식이 올바르지 않습니다." }, 400); }
  const parsed = hospitalSearchSchema.safeParse(input);
  if (!parsed.success) return json({ error: "좌표·반경·진료 및 시술 조건을 확인하세요.", fields: [...new Set(parsed.error.issues.map((issue) => issue.path.join(".")))] }, 400);
  try {
    const result = await searchHospitalCandidates(parsed.data, read);
    return json(enrich ? await enrich(parsed.data, result) : result);
  }
  catch (error) { return json({ error: error instanceof OpenDataError ? error.message : "병원 정보를 조회하지 못했습니다. 다시 시도하세요." }, error instanceof OpenDataError ? error.status : 502); }
}
