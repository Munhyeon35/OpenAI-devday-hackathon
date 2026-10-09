import { dispatchAsset } from "@/lib/server/dispatch-assets";

export async function GET(_request: Request, { params }: { params: Promise<{ file: string }> }) {
  return dispatchAsset((await params).file);
}
