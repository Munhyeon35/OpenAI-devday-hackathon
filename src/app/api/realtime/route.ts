import { readFile } from "node:fs/promises";
import { NextRequest } from "next/server";
export async function POST(req: NextRequest) {
  if (
    !["localhost", "127.0.0.1", "[::1]"].includes(req.nextUrl.hostname) ||
    (req.headers.get("origin") &&
      req.headers.get("origin") !== req.nextUrl.origin)
  )
    return new Response(null, { status: 403 });
  if (!process.env.OPENAI_API_KEY)
    return Response.json(
      { error: "OPENAI_API_KEY를 설정하세요." },
      { status: 503 },
    );
  const sdp = await req.text();
  if (!sdp.startsWith("v=0") || sdp.length > 65536)
    return new Response(null, { status: 400 });
  try {
    const instructions = await readFile(
      `${process.cwd()}/server/scenario.txt`,
      "utf8",
    );
    const form = new FormData();
    form.set("sdp", sdp);
    form.set(
      "session",
      JSON.stringify({
        type: "realtime",
        model: process.env.OPENAI_REALTIME_MODEL || "gpt-realtime-2.1",
        instructions,
        output_modalities: ["audio"],
        audio: {
          input: {
            transcription: { model: "gpt-4o-mini-transcribe", language: "ko" },
            turn_detection: {
              type: "server_vad",
              interrupt_response: true,
              create_response: true,
            },
          },
          output: { voice: "marin" },
        },
        tools: [
          {
            type: "function",
            name: "end_call",
            description: "테스트가 끝나거나 종료 요청시 호출",
            parameters: {
              type: "object",
              properties: {},
              additionalProperties: false,
            },
          },
        ],
      }),
    );
    const r = await fetch("https://api.openai.com/v1/realtime/calls", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
      body: form,
      signal: AbortSignal.timeout(20000),
    });
    if (!r.ok)
      return Response.json(
        { error: `음성 연결 실패 (${r.status})` },
        { status: 502 },
      );
    return new Response(await r.text(), {
      headers: {
        "Content-Type": "application/sdp",
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return Response.json({ error: "음성 서버 연결 오류" }, { status: 502 });
  }
}
