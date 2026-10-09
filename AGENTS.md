<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Voice project workflow

Read README.md before setup. There are three separate modes: local browser voice,
shared operator phone server, and independently hosted phone tests. Never assume
that editing a teammate's checkout changes the shared phone server.

- Use Node.js 22+ and npm ci. Preserve existing .env; never overwrite it with the example.
- Local browser voice needs only OPENAI_API_KEY and npm run dev at localhost:3000.
- Shared phone calls need only PUBLIC_VOICE_URL and VOICE_API_TOKEN. Do not start a
  local phone server or ask for provider keys when using the operator's server.
- Independent phone tests require provider credentials, a local voice:dev server,
  and a separate public HTTPS/WSS tunnel pointing to that server's port 3001.
- Keep credentials server-side, out of tool output, commits, and browser bundles.
- Read server/scenario.txt for the shared scenario. Phone server changes require restart.
- Real calls create external effects and charges. Call only the explicitly requested
  recipient and count; do not auto-retry or claim delivery from queued/ringing status.
- Preserve Twilio signature validation using the public wss:// URL.
- Verify relevant changes with lint, typecheck, build, and node --check server/voice.mjs.
  Report real microphone/phone testing separately from static validation.
