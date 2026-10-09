import { NextResponse } from "next/server";
import { healthSchema } from "@/lib/schemas/health";

export function GET() {
  return NextResponse.json(healthSchema.parse({ status: "ok", service: "올뺑이" }));
}
