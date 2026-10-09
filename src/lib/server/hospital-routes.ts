import { get } from "node:https";
import { z } from "zod";
import type { HospitalSearch, HospitalSearchResult } from "../hospitals.ts";

// Public demo policy: at most one request/second, no uptime guarantee.
// One table request covers all displayed candidates. Only coordinates are sent.
const ROUTING_ORIGIN = "https://router.project-osrm.org";
const CACHE_MS = 5 * 60 * 1000;
const MAX_SNAP_METERS = 250;
type TableResponse = { data: unknown; calculatedAt: string };
const cache = new Map<string, { expiresAt: number; promise: Promise<TableResponse> }>();
let queue = Promise.resolve();
let nextRequestAt = 0;

export function routingUrl(input: Pick<HospitalSearch, "latitude" | "longitude">, candidates: HospitalSearchResult["candidates"]): URL {
  const points = [input, ...candidates].map(({ latitude, longitude }) => `${longitude.toFixed(6)},${latitude.toFixed(6)}`).join(";");
  const url = new URL(`/table/v1/driving/${points}`, ROUTING_ORIGIN);
  url.searchParams.set("sources", "0");
  url.searchParams.set("destinations", candidates.map((_, index) => index + 1).join(";"));
  url.searchParams.set("annotations", "distance,duration");
  url.searchParams.set("generate_hints", "false");
  return url;
}

function requestTable(url: URL): Promise<unknown> {
  // Native HTTPS keeps precise coordinates out of Next.js fetch URL logs.
  return new Promise((resolve, reject) => {
    const request = get(url, { headers: { "User-Agent": "Olppaengi-local-demo/1.0", Accept: "application/json" } }, (response) => {
      if (response.statusCode !== 200) { response.resume(); reject(new Error("경로 서비스 응답 실패")); return; }
      const chunks: Buffer[] = [];
      let size = 0;
      response.on("data", (chunk: Buffer) => {
        size += chunk.length;
        if (size > 256 * 1024) { request.destroy(new Error("경로 응답 크기 초과")); return; }
        chunks.push(chunk);
      });
      response.on("error", () => reject(new Error("경로 응답 수신 실패")));
      response.on("end", () => {
        try { resolve(JSON.parse(Buffer.concat(chunks).toString("utf8"))); }
        catch { reject(new Error("경로 응답 형식 오류")); }
      });
    });
    const timeout = setTimeout(() => request.destroy(new Error("경로 조회 시간 초과")), 10000);
    request.on("close", () => clearTimeout(timeout));
    request.on("error", () => reject(new Error("경로 서비스 연결 실패")));
  });
}

function readTable(url: URL): Promise<TableResponse> {
  const key = url.toString();
  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.promise;
  const promise = queue.then(async () => {
    const delay = nextRequestAt - Date.now();
    if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay));
    nextRequestAt = Date.now() + 1100;
    const data = await requestTable(url);
    return { data, calculatedAt: new Date().toISOString() };
  });
  queue = promise.then(() => undefined, () => undefined);
  cache.set(key, { expiresAt: Date.now() + CACHE_MS, promise });
  while (cache.size > 50) cache.delete(cache.keys().next().value!);
  void promise.catch(() => { if (cache.get(key)?.promise === promise) cache.delete(key); });
  return promise;
}

const metric = z.number().finite().nonnegative();
const tableSchema = z.object({
  code: z.literal("Ok"),
  distances: z.array(z.array(metric.nullable())).length(1),
  durations: z.array(z.array(metric.nullable())).length(1),
  sources: z.array(z.object({ distance: metric })).length(1),
  destinations: z.array(z.object({ distance: metric })),
});

export async function enrichRoadRoutes(input: HospitalSearch, result: HospitalSearchResult, read: (url: URL) => Promise<TableResponse> = readTable): Promise<HospitalSearchResult> {
  if (!result.candidates.length) return result;
  // Strip any previous route values before applying a fresh response or fallback.
  let candidates = result.candidates.map((candidate) => { const clean = { ...candidate }; delete clean.roadRoute; return clean; });
  try {
    const { data, calculatedAt } = await read(routingUrl(input, candidates));
    const table = tableSchema.parse(data);
    if (table.distances[0].length !== candidates.length || table.durations[0].length !== candidates.length || table.destinations.length !== candidates.length || table.sources[0].distance > MAX_SNAP_METERS) throw new Error("경로 좌표 불일치");
    candidates = candidates.map((candidate, index) => {
      const meters = table.distances[0][index], seconds = table.durations[0][index];
      if (meters === null || seconds === null || table.destinations[index].distance > MAX_SNAP_METERS) return candidate;
      return { ...candidate, roadRoute: { provider: "OSRM" as const, distanceKm: meters / 1000, durationSeconds: seconds, calculatedAt } };
    });
  } catch { /* Keep hospital search usable; never expose upstream errors/URLs. */ }
  const routed = candidates.filter((candidate) => candidate.roadRoute).length;
  const warnings = result.warnings.filter((warning) => warning !== "거리는 직선거리입니다. 도로 이동시간은 제공하지 않습니다.");
  if (routed) warnings.push("도로 거리·예상 시간은 OSRM의 일반 자동차 경로 기준입니다. 실시간 교통 및 구급차 우선 통행은 반영하지 않습니다.");
  if (routed < candidates.length) warnings.push(`경로를 확인하지 못한 ${candidates.length - routed}곳은 직선거리로 표시하며 예상 시간을 제공하지 않습니다.`);
  return { ...result, candidates, warnings,
    distanceType: routed === candidates.length ? "road" : routed ? "mixed" : "straight_line",
    routing: { provider: "OSRM", status: routed === candidates.length ? "complete" : routed ? "partial" : "unavailable" },
  };
}
