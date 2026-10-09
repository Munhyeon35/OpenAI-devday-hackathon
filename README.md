# 올뺑이 | 응급 AI Caller

## 브라우저에서 로컬 음성 테스트

`.env`의 `OPENAI_API_KEY`를 설정한 뒤 `npm run dev`를 실행하고
http://localhost:3000 에서 **대화 시작**을 누르세요. 마이크를 허용하면
OpenAI Realtime과 한국어로 대화하며 대화 기록을 화면에서 확인할 수 있습니다.
같은 `server/scenario.txt`를 사용하며 작별 인사 재생 후 자동 종료합니다.
수동 종료와 마이크 끄기도 지원하며 최대 3분입니다.
Twilio, ngrok, 별도 음성 서버 없이 실행되며 OpenAI 사용료는 발생합니다.
API 키는 서버에만 유지됩니다. 세션 생성 API는 localhost에서만 허용됩니다.
브라우저 마이크/스피커의 실제 동작은 직접 대화하면서 확인하세요.

## Twilio + OpenAI Realtime 전화

`server/voice.mjs`는 Twilio 양방향 Media Streams와 OpenAI Realtime을
G.711 μ-law로 연결합니다. 통화마다 별도의 Realtime 세션을 만들며,
한국어 인사와 상대방 발화 시 재생 중단/대화 잘라내기를 처리합니다.
발신 API는 Bearer 인증, WebSocket은 Twilio 서명 검증을 사용합니다.

`.env.example`의 음성 변수를 `.env`에 설정한 뒤 실행합니다.
기존 `twilio_ACCESS_TOKEN`도 Auth Token 별칭으로 지원합니다.

```bash
npm run voice:dev
```

3001 포트를 HTTPS/WSS를 지원하는 서버 또는 터널로 공개하고,
`PUBLIC_VOICE_URL`에 해당 HTTPS origin을 넣으세요(경로 없이).
`VOICE_API_TOKEN`은 직접 생성한 긴 임의 비밀 문자열입니다.
Twilio Geo permissions에서 한국 발신을 활성화해야 합니다.

`POST /calls`에 `Authorization: Bearer <VOICE_API_TOKEN>`과 JSON
`{"to":"+821012345678"}`을 보내면 한 번 발신합니다.
`GET /health`로 활성 음성 연결 수를 확인할 수 있습니다.
통화는 최대 180초이며 발신 실패를 자동 재시도하지 않습니다.
현재 동시 연결 제한은 서버 프로세스 단위이고 Twilio의 발신 CPS와
OpenAI 계정 제한도 적용됩니다. 여러 서버 운영 시 공유 제한이 필요합니다.
공개 `/calls`를 브라우저에서 직접 호출하며 비밀 토큰을 노출하지 마세요.

참고: [OpenAI Realtime](https://developers.openai.com/api/docs/guides/realtime-conversations),
[Twilio Media Streams](https://www.twilio.com/docs/voice/media-streams/websocket-messages).
실제 통화 품질은 전화 테스트로 확인해야 합니다.

Next.js App Router 기반 프로젝트입니다.

## 실행

Node.js 20.9 이상을 사용합니다.

```bash
npm install
npm run dev
```

http://localhost:3000 에서 확인할 수 있습니다.

## 기술 스택

- Next.js / React / TypeScript (strict)
- Tailwind CSS
- Zod: API 응답 스키마 검증
- TanStack React Query: 서버 상태 및 캐시
- Zustand: 클라이언트 상태
- Supabase: 도입 예정 (SDK 및 DB/인증은 아직 연결하지 않음)

## 구조

```text
src/app/                 페이지, 레이아웃, API, 파비콘
src/components/          공통 Provider 및 스택 동작 예제
src/lib/schemas/         Zod 스키마
src/stores/              Zustand 스토어
```

`/api/health` 응답을 React Query로 조회하고 Zod로 검증합니다.
홈 화면 카운터로 Zustand 동작을 확인할 수 있습니다.

Supabase 도입 시 `.env.example`의 변수를 기존 `.env` 또는 `.env.local`에 추가하세요.
공개 키만 `NEXT_PUBLIC_` 변수에 넣고, secret/service role 키는 서버에서만 사용하세요.
현재 앱은 Supabase 환경 변수 없이 실행됩니다.

## 검증

```bash
npm run lint
npm run typecheck
npm run build
```

## 참고 문서

- [Next.js 설치](https://nextjs.org/docs/app/getting-started/installation)
- [TanStack Query 설치](https://tanstack.com/query/latest/docs/framework/react/installation)

현재 환경의 Turbopack 포트 오류를 피하기 위해 개발 및 빌드는 Webpack을 사용합니다.
