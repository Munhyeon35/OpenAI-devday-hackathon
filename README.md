# 올뺑이 | AI Voice Caller

현재 기준 버전은 **v1 (1.0.0)**입니다. [변경 기록](CHANGELOG.md) · Git 태그 `v1`

Twilio + OpenAI Realtime으로 한국어 음성 대화를 실험하는 프로젝트입니다.
Vapi 없이 동작합니다. 브라우저 대화와 실제 전화는 서로 다른 실행 경로입니다.

응급실 수용 확인 기능이 추가되었습니다. 기존 Realtime 음성 테스트는 유지하며,
환자 정보·병원 두 곳·ETA를 받아 GPT-Live로 수용 확답을 수집하는 별도 백엔드를 함께 제공합니다.
[기능 비교 및 병합 범위](docs/feature-comparison.md) · [응급실 API 상세](docs/hospital-dispatch.md)

## 추가: 응급실 두 곳 수용 확인

Python 3.11+가 필요합니다. 기존 `.env`를 유지하고 `.env.example`의 BedLink 항목만 추가하세요.

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements-dev.txt
# 터미널 1: APP_MODE=demo는 실제 전화 없이 통합 흐름을 확인합니다.
APP_MODE=demo npm run dispatch:dev
# 터미널 2
npm run dev
```

`http://localhost:3000`의 **응급실 수용 확인** 링크 또는 `http://localhost:3000/dispatch`에서 사용합니다.
Next.js가 `DISPATCH_BACKEND_URL`(기본 `http://127.0.0.1:8000`)로 요청을 전달하고,
`OPERATOR_TOKEN`은 서버에서만 읽습니다. 두 서버는 같은 토큰을 사용해야 합니다.
Next.js 프록시는 localhost / 동일 출처 전용이며, 외부 사용자는 운영자 토큰으로 보호된
FastAPI API를 직접 사용합니다. 임시 화면은 `http://127.0.0.1:8000/`에서도 사용할 수 있습니다.

실제 응급실 전화는 `APP_MODE=live`, OpenAI·Twilio 설정 및 **8000번 서버로 연결되는**
`PUBLIC_BASE_URL`이 필요합니다. 아래 기존 Node 음성 테스트의 `PUBLIC_VOICE_URL`(3001번)과 혼동하지 마세요.
두 기능의 시나리오와 오디오 API는 별도입니다. 테스트를 위해 API에 병원 한 곳만 보내는 것도 지원합니다.
외부 결과 수신 서버가 있으면 `GPT_BACKBED_URL`과 선택적 `GPT_BACKBED_TOKEN`을 설정합니다.

```bash
pytest -q
npm run test:dispatch-proxy
```

프록시 테스트는 Node 22.6+ 또는 24+에서 실행합니다. 앱의 기존 Node 22+ 실행 조건은 유지됩니다.
키·토큰·로컬 DB는 커밋하지 않습니다.

## 처음 받은 사람이 할 일

Node.js **22 이상**과 npm을 준비하세요(`--env-file` 사용).

```bash
git clone https://github.com/Munhyeon35/OpenAI-devday-hackathon.git
cd OpenAI-devday-hackathon
npm ci
cp .env.example .env
```

이미 전달받은 `.env`가 있으면 복사 명령을 실행하지 말고 그 파일을 사용하세요.
키와 토큰은 팀의 비공개 경로로 전달받습니다. `.env`는 Git에 포함하지 않습니다.
Supabase 설정은 현재 음성 테스트에 필요 없습니다.

| 목적 | 필요한 설정 | 실행 |
| --- | --- | --- |
| 내 코드로 브라우저 대화 | `OPENAI_API_KEY` | `npm run dev` |
| 운영자의 공용 서버로 전화 | `PUBLIC_VOICE_URL`, `VOICE_API_TOKEN` | 아래 발신 명령 |
| 내 코드로 독립적인 전화 실험 | OpenAI·Twilio 키, 발신번호, 내 ngrok, 서버 토큰 | ngrok + `npm run voice:dev` |

## 1. 로컬 브라우저에서 대화하기

`.env`에 `OPENAI_API_KEY`를 넣습니다. 모델은 기본 `gpt-realtime-2.1`입니다.

```bash
npm run dev
```

http://localhost:3000 에서 **대화 시작**을 누르고 마이크를 허용하세요.
AI가 인사하면 질문에 답합니다. 목소리 확인 → 기분 질문 → 숫자 따라 말하기
순서가 끝나면 작별 인사 후 자동 종료합니다. “종료해 주세요”라고 말하거나
**대화 종료**를 눌러도 됩니다. 마이크 끄기와 대화 기록을 지원합니다.
최대 3분이며 OpenAI 사용료가 발생합니다.

이 경로에는 Twilio·ngrok·`voice:dev`가 필요 없습니다.
`http://localhost`는 브라우저 마이크 사용이 허용되지만 다른 컴퓨터의 LAN
HTTP 주소는 그렇지 않을 수 있습니다. API는 localhost 전용입니다.
OpenAI 키는 브라우저에 전달하지 않고 Next.js 서버에서만 사용합니다.

## 2. 운영자의 공용 서버로 실제 전화하기

운영자의 ngrok 주소를 같이 사용할 수 있습니다. 팀원에게는
`PUBLIC_VOICE_URL`과 `VOICE_API_TOKEN`만 전달하면 됩니다.
팀원이 Twilio/OpenAI 키나 ngrok을 설정하거나 `voice:dev`를 실행할 필요는 없습니다.
공용 서버가 사용하는 Twilio/OpenAI 계정으로 비용이 청구됩니다.

운영자는 자신의 컴퓨터에서 ngrok과 음성 서버를 계속 켜두고 현재 주소를 공유합니다.
주소는 고정이라고 가정하지 말고 운영자가 전달한 값을 사용하세요.
팀원의 `.env` 예시(실제 값은 비공개로 전달):

```dotenv
PUBLIC_VOICE_URL=https://YOUR-SHARED-DOMAIN.ngrok-free.dev
VOICE_API_TOKEN=YOUR_SHARED_SECRET
```

먼저 상태만 확인합니다(전화가 걸리지 않습니다).

```bash
node --env-file=.env --input-type=module -e 'const r=await fetch(process.env.PUBLIC_VOICE_URL+"/health",{headers:{"ngrok-skip-browser-warning":"1"}});console.log(r.status,await r.text())'
```

다음 명령은 **실제로 한 번 발신**합니다. 마지막 인수를 전화를 받기로 한
테스트 참여자의 번호로 바꾸세요. 한국 `010-1234-5678`은 `+821012345678`로 입력합니다.

```bash
node --env-file=.env --input-type=module -e 'const to=process.argv[1];const r=await fetch(process.env.PUBLIC_VOICE_URL+"/calls",{method:"POST",headers:{Authorization:`Bearer ${process.env.VOICE_API_TOKEN}`,"Content-Type":"application/json","ngrok-skip-browser-warning":"1"},body:JSON.stringify({to})});console.log(r.status,await r.text())' +821012345678
```

성공 응답은 `201`과 `callSid`, `status: queued`입니다.
`queued`/`ringing`은 실제 수신·대화 성공의 증거가 아닙니다. 휴대폰에 도착하고
AI가 들리는지 확인하세요. 미국 번호로 발신하면 국제전화 표시가 나올 수 있습니다.
발신 API를 프런트엔드에 직접 연결해 비밀 토큰을 노출하지 마세요.

**공용 주소는 운영자의 코드로 연결됩니다.** 팀원이 자기 컴퓨터의 시나리오를
수정해도 공용 전화에는 반영되지 않습니다. PR/커밋을 전달하고 운영자가
변경사항을 받은 후 `voice:dev`를 재시작해야 합니다.

## 3. 내 코드로 독립적인 전화 실험하기

Twilio 계정을 업그레이드하고 Voice 지원 발신번호를 준비하세요.
한국 발신은 Twilio Console의 **Voice → Settings → Geo permissions**에서
South Korea를 허용해야 합니다. 인증한 개인 번호도 API 발신번호로 사용할 수
있지만 실제 전달 여부는 전화 테스트가 필요합니다.

`.env`에 다음을 설정합니다. 기존 `twilio_ACCESS_TOKEN`도 Auth Token 별칭으로 지원합니다.

```dotenv
OPENAI_API_KEY=YOUR_OPENAI_KEY
OPENAI_REALTIME_MODEL=gpt-realtime-2.1
TWILIO_ACCOUNT_SID=YOUR_ACCOUNT_SID
TWILIO_AUTH_TOKEN=YOUR_AUTH_TOKEN
TWILIO_FROM_NUMBER=YOUR_TWILIO_NUMBER_IN_E164
VOICE_API_TOKEN=YOUR_RANDOM_SECRET
VOICE_PORT=3001
VOICE_MAX_CONCURRENT=5
```

`VOICE_API_TOKEN`은 `openssl rand -hex 32`로 생성할 수 있습니다.
ngrok Authtoken은 API Key와 다릅니다. 아래 인증에는 **Authtoken**을 사용하세요.

```bash
brew install --cask ngrok
ngrok config add-authtoken YOUR_NGROK_AUTHTOKEN
ngrok http 3001
```

ngrok이 표시하는 HTTPS 주소를 `.env`에 넣습니다. 경로와 마지막 `/`는 넣지 않습니다.

```dotenv
PUBLIC_VOICE_URL=https://YOUR-DOMAIN.ngrok-free.dev
```

새 터미널에서:

```bash
npm run voice:dev
```

2번의 상태 확인·발신 명령을 사용하세요. 로컬 3001 포트에 HTTPS를 직접
설정할 필요는 없습니다. Twilio가 공개 WSS 주소로 접속하면 ngrok이 로컬로
전달합니다. ngrok과 서버는 모두 켜두어야 하며, 주소/환경변수 변경 후 서버를 재시작합니다.
다른 사람의 ngrok 주소를 넣으면 **다른 사람의 서버**로 연결됩니다.

## 함께 개발하기 / Codex에 줄 지시

아래를 Codex에 전달하세요:

> 먼저 AGENTS.md와 README.md를 읽으세요. 로컬 브라우저 테스트는 npm ci와
> npm run dev로 실행하고 서버/시나리오 코드를 수정하세요. 공용 전화 서버를
> 사용할 때는 PUBLIC_VOICE_URL과 VOICE_API_TOKEN만 필요합니다. 내 코드로
> 전화 실험을 하려면 내 ngrok 터널과 voice:dev가 필요합니다. 비밀키를 출력하거나
> 커밋하지 마세요. 실제 발신은 사용자가 지정한 수신번호로 요청한 횟수만 실행하세요.

- `server/scenario.txt`: 브라우저와 전화가 공유하는 한국어 시나리오.
- `src/components/voice-test.tsx`: 브라우저 WebRTC, 기록, 마이크와 자동 종료.
- `src/app/api/realtime/route.ts`: 서버 키로 WebRTC SDP 연결 생성.
- `server/voice.mjs`: Twilio Media Streams ↔ OpenAI Realtime 연결과 발신 API.
- `server/voice.mjs`의 `VOICE_INSTRUCTIONS`는 전화 시나리오만 덮어씁니다.
- 시나리오의 `end_call` 도구가 호출되면 작별 음성 재생 후 종료합니다.
- 브라우저 시나리오는 새 대화부터 반영됩니다. 전화 코드는 서버 재시작 후 반영됩니다.

```bash
npm run lint
npm run typecheck
npm run build
node --check server/voice.mjs
```

문법/빌드 통과와 실제 음성 품질 검증은 별개입니다. 마이크 대화와 전화는 직접
테스트하세요. 현재 동시 연결 제한은 서버 프로세스 단위이며 엄격한 발신 큐 제한은
아닙니다. Twilio CPS와 OpenAI 계정 제한도 적용됩니다. 다중 서버 운영에는 공유
통화 관리가 필요합니다. 통화/브라우저 세션 최대 시간은 180초입니다.

## 문제 해결

| 증상 | 확인할 것 |
| --- | --- |
| 브라우저 마이크가 안 됨 | localhost 접속, 브라우저 마이크 권한, OS 입력 장치 |
| 연결 API가 502 | OpenAI 키·결제·모델 접근 권한, Next.js 로그 |
| 공용 서버가 안 열림 | 운영자 컴퓨터·ngrok·voice:dev 실행 여부, 현재 주소 |
| 발신 API가 401 | VOICE_API_TOKEN이 서버와 일치하는지 |
| 전화가 도착하지 않음 | Twilio 통화 로그, Geo permissions, 발신번호, 수신 측 국제전화 차단 |
| 받자마자 종료됨 | Twilio 오류 로그와 voice:dev 로그, WebSocket 연결 |
| Twilio 오류 31920 | WSS upgrade 실패. /media-stream 경로와 서명 검증 주소 확인 |
| 음성이 안 들림 | 브라우저 자동재생, 볼륨, 출력 장치, OpenAI Realtime 오류 |

전화 WebSocket 서명은 **실제 공개 wss:// 주소**로 검증합니다. HTTPS로 잘못
검증하거나 검증을 꺼서 문제를 우회하지 마세요.

## 기술 / 참고

Next.js 16 / React / TypeScript / Tailwind / Zod / React Query / Zustand.
Supabase는 도입 예정입니다. 개발·빌드는 현재 Webpack을 사용합니다.

- [OpenAI Realtime](https://developers.openai.com/api/docs/guides/realtime-conversations)
- [Twilio Media Streams](https://www.twilio.com/docs/voice/media-streams/websocket-messages)
- [ngrok Authtoken](https://dashboard.ngrok.com/get-started/your-authtoken)
