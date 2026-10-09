import { dispatchAsset } from "@/lib/server/dispatch-assets";

export async function GET() { return dispatchAsset("index.html"); }
