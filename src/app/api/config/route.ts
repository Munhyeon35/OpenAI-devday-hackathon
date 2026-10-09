import { proxyDispatch } from "@/lib/server/dispatch-proxy";

export async function GET(request: Request) { return proxyDispatch(request, "/api/config"); }
