// Server Route Handlers only. Native HTTPS avoids logging key-bearing URLs in
// Next's fetch instrumentation. Never forward upstream bodies or error objects.
import { get } from "node:https";
import { XMLParser, XMLValidator } from "fast-xml-parser";

export type OpenDataRow = Record<string, string>;
export type OpenDataPage = { items: OpenDataRow[]; totalCount: number };
export type OpenDataDataset = { items: OpenDataRow[]; retrievedAt: string };
export type OpenDataOperation = "getEgytListInfoInqire" | "getEmrrmRltmUsefulSckbdInfoInqire" | "getSrsillDissAceptncPosblInfoInqire";
export type OpenDataRead = (operation: OpenDataOperation, params?: Record<string, string>) => Promise<OpenDataDataset>;

export class OpenDataError extends Error {
  status: number;
  constructor(message: string, status = 502) { super(message); this.status = status; }
}

const parser = new XMLParser({ ignoreAttributes: true, parseTagValue: false, trimValues: true,
  transformTagName: (name: string) => name.toLowerCase(), isArray: (name: string) => name === "item" });

function serviceError(code: string): never {
  if (code === "30") throw new OpenDataError("등록되지 않은 공공데이터 서비스키입니다 (오류 30). 포털의 인증키를 확인하고, 발급 직후라면 등록 반영 후 다시 조회하세요.", 503);
  if (code === "31") throw new OpenDataError("공공데이터 인증키 사용 기간이 만료되었습니다 (오류 31). 포털에서 이용 기간을 갱신하세요.", 503);
  if (["20", "32"].includes(code))
    throw new OpenDataError("공공데이터 인증에 실패했습니다. OPENDATA_API_KEY와 ‘전국 응급의료기관 정보 조회 서비스’ 활용신청 승인 상태를 확인하세요.", 503);
  if (["22", "23"].includes(code)) throw new OpenDataError("공공데이터 API 호출 한도를 초과했습니다. 잠시 후 다시 조회하세요.", 503);
  throw new OpenDataError("공공데이터 제공기관이 정상 응답을 반환하지 않았습니다.");
}

export function parseOpenDataXml(xml: string): OpenDataPage {
  // This feed needs no DTD/custom entities. Reject rather than expand them.
  if (/<!DOCTYPE|<!ENTITY/i.test(xml) || XMLValidator.validate(xml) !== true)
    throw new OpenDataError("공공데이터 응답 형식이 올바르지 않습니다.");
  const data = parser.parse(xml);
  const gatewayError = data.openapi_serviceresponse?.cmmmsgheader;
  if (gatewayError) serviceError(String(gatewayError.returnreasoncode ?? ""));
  const response = data.response;
  if (response?.header?.resultcode !== "00") serviceError(String(response?.header?.resultcode ?? ""));
  const body = response.body;
  const totalCount = Number(body?.totalcount);
  if (!body || !Number.isSafeInteger(totalCount) || totalCount < 0)
    throw new OpenDataError("공공데이터 응답에 조회 건수가 없습니다.");
  const items: OpenDataRow[] = (body.items?.item ?? []).map((row: Record<string, unknown>) =>
    Object.fromEntries(Object.entries(row).filter(([, value]) => typeof value === "string")));
  return { items, totalCount };
}

export function openDataUrl(operation: OpenDataOperation, params: Record<string, string>, key: string) {
  // Both encoded and decoded keys issued by data.go.kr are supported.
  let decoded = key.trim();
  try { decoded = decodeURIComponent(decoded); } catch { /* already a raw key */ }
  const url = new URL(`https://apis.data.go.kr/B552657/ErmctInfoInqireService/${operation}`);
  url.search = new URLSearchParams({ ...params, ServiceKey: decoded }).toString();
  return url;
}

function download(url: URL): Promise<string> {
  return new Promise((resolve, reject) => {
    const fail = () => reject(new OpenDataError("공공데이터 API 연결에 실패했습니다. 잠시 후 다시 조회하세요."));
    const request = get(url, { signal: AbortSignal.timeout(12000), headers: { Accept: "application/xml" } }, (response) => {
      // The gateway returns useful XML error codes with HTTP 401/403 too.
      // Parse only those codes below; never expose its raw message/body.
      if (![200, 401, 403].includes(response.statusCode ?? 0)) {
        response.resume();
        fail();
        return;
      }
      let size = 0;
      const chunks: Buffer[] = [];
      response.on("data", (chunk: Buffer) => {
        size += chunk.length;
        if (size > 8 * 1024 * 1024) { request.destroy(); fail(); }
        else chunks.push(chunk);
      });
      response.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
      response.on("error", fail);
    });
    request.on("error", fail);
  });
}

export async function collectPages(read: (page: number) => Promise<OpenDataPage>): Promise<OpenDataRow[]> {
  const items: OpenDataRow[] = [];
  for (let page = 1; page <= 20; page++) {
    const result = await read(page);
    items.push(...result.items);
    if (items.length >= result.totalCount) return items;
    if (!result.items.length) break;
  }
  // Incomplete data must not silently appear to be a complete search.
  throw new OpenDataError("공공데이터 목록을 끝까지 조회하지 못했습니다. 다시 조회하세요.");
}

const cache = new Map<string, { expires: number; value: Promise<OpenDataDataset> }>();
let activeKey = "";
export const readOpenData: OpenDataRead = async (operation, params = {}) => {
  const key = process.env.OPENDATA_API_KEY?.trim();
  if (!key) throw new OpenDataError("서버 .env.local에 OPENDATA_API_KEY를 설정한 뒤 개발 서버를 다시 시작하세요.", 503);
  if (key !== activeKey) { cache.clear(); activeKey = key; }
  const cacheKey = JSON.stringify([operation, params]);
  const previous = cache.get(cacheKey);
  if (previous && previous.expires > Date.now()) return previous.value;
  const ttl = operation === "getEgytListInfoInqire" ? 300000 : 30000;
  const value = collectPages(async (page) => parseOpenDataXml(await download(openDataUrl(operation,
    { ...params, pageNo: String(page), numOfRows: "500" }, key))))
    .then((items) => ({ items, retrievedAt: new Date().toISOString() }));
  cache.set(cacheKey, { expires: Date.now() + ttl, value });
  try { return await value; } catch (error) { cache.delete(cacheKey); throw error; }
};
