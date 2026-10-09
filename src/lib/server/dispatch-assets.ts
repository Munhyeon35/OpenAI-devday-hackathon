import { readFile } from "node:fs/promises";
import path from "node:path";

const types: Record<string, string> = {
  "index.html": "text/html", "style.css": "text/css", "app.js": "text/javascript",
  "voice-flow.html": "text/html", "voice-flow.css": "text/css", "voice-flow.js": "text/javascript",
};

export async function dispatchAsset(file: string) {
  // Explicit allowlist; never expose .env, backend source, or arbitrary filesystem paths.
  if (!Object.hasOwn(types, file)) return new Response(null, { status: 404 });
  const content = await readFile(path.join(process.cwd(), "backend", "static", file), "utf8");
  return new Response(content, { headers: {
    "Content-Type": `${types[file]}; charset=utf-8`, "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer",
    "Content-Security-Policy": "default-src 'self'; style-src 'self'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'",
  } });
}
