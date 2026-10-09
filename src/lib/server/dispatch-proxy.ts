// Imported only by server Route Handlers. Operator credentials never enter a browser bundle.
type Options = {
  env?: Record<string, string | undefined>;
  fetcher?: typeof fetch;
};
const loopbacks = new Set(["localhost", "127.0.0.1", "[::1]"]);
const uuid = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const readPath = new RegExp(`^/api/dispatches/${uuid}$`);
const actionPath = new RegExp(`^/api/dispatches/${uuid}/(cancel|retry-delivery)$`);
const failure = (status: number, detail: string) =>
  Response.json({ detail }, { status, headers: { "Cache-Control": "no-store" } });

export async function proxyDispatch(request: Request, path: string, options: Options = {}) {
  const env = options.env ?? process.env;
  const fetcher = options.fetcher ?? fetch;
  const incoming = new URL(request.url);
  let browserOrigin: URL;
  try {
    // Next may reconstruct request.url with its listening hostname. The browser's
    // Host must independently be loopback, and Origin must match that exact host.
    browserOrigin = new URL(`${incoming.protocol}//${request.headers.get("host") || incoming.host}`);
  } catch { return failure(403, "잘못된 Host입니다."); }
  // This route uses the operator's token, so it is intentionally localhost-only.
  // Public/shared clients must use the separately authenticated FastAPI API.
  if (!loopbacks.has(incoming.hostname) || !loopbacks.has(browserOrigin.hostname) ||
      browserOrigin.username || browserOrigin.password || browserOrigin.pathname !== "/" || browserOrigin.search || browserOrigin.hash)
    return failure(403, "응급실 요청 화면은 localhost에서만 사용할 수 있습니다.");
  const origin = request.headers.get("origin");
  if ((origin && origin !== browserOrigin.origin) || (request.method === "POST" && origin !== browserOrigin.origin))
    return failure(403, "같은 출처의 요청만 허용됩니다.");
  if (!(request.method === "GET" && (path === "/api/config" || readPath.test(path))) &&
      !(request.method === "POST" && (path === "/api/dispatches" || actionPath.test(path))))
    return failure(404, "지원하지 않는 요청입니다.");

  try {
    const upstream = new URL(env.DISPATCH_BACKEND_URL || "http://127.0.0.1:8000");
    if ((upstream.protocol !== "https:" && !(upstream.protocol === "http:" && loopbacks.has(upstream.hostname))) ||
        upstream.username || upstream.password || upstream.pathname !== "/" || upstream.search || upstream.hash)
      return failure(503, "DISPATCH_BACKEND_URL은 로컬 HTTP 또는 HTTPS origin이어야 합니다.");
    let body: string | undefined;
    if (request.method === "POST" && request.body) {
      if (!request.headers.get("content-type")?.startsWith("application/json"))
        return failure(415, "JSON 요청을 사용하세요.");
      const reader = request.body.getReader();
      const chunks: Uint8Array[] = [];
      let size = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > 65536) { await reader.cancel(); return failure(413, "요청이 너무 큽니다."); }
        chunks.push(value);
      }
      body = Buffer.concat(chunks).toString("utf8");
    }
    const headers = new Headers({ "Content-Type": "application/json" });
    if (env.OPERATOR_TOKEN) headers.set("Authorization", `Bearer ${env.OPERATOR_TOKEN}`);
    const key = request.headers.get("idempotency-key");
    if (key) headers.set("Idempotency-Key", key);
    // No retries: an uncertain POST response must never create another call.
    const result = await fetcher(new URL(path, upstream), {
      method: request.method, headers, body, cache: "no-store", redirect: "error",
      signal: AbortSignal.timeout(25000),
    });
    const data = await result.json();
    if (path === "/api/config" && result.ok) {
      return Response.json({ mode: data.mode, auth_required: false, backbed_configured: Boolean(data.backbed_configured) },
        { headers: { "Cache-Control": "no-store" } });
    }
    return Response.json(data, { status: result.status, headers: { "Cache-Control": "no-store" } });
  } catch {
    return failure(502, "수용 확인 백엔드 연결 실패. 8000번 서버와 DISPATCH_BACKEND_URL을 확인하세요. 발신은 자동 재시도하지 않습니다.");
  }
}
