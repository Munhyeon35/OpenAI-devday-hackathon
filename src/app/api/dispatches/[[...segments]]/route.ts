import { proxyDispatch } from "@/lib/server/dispatch-proxy";

type Context = { params: Promise<{ segments?: string[] }> };
async function forward(request: Request, context: Context) {
  const { segments = [] } = await context.params;
  return proxyDispatch(request, "/api/dispatches" + (segments.length ? "/" + segments.join("/") : ""));
}
export const GET = forward;
export const POST = forward;
