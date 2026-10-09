# 올뺑이 | 응급 이송 관제

현재 기준 버전은 **v1 (1.0.0)**입니다. [변경 기록](CHANGELOG.md) · Git 태그 `v1`

여러 병원에 동시에 환자 수용 여부를 확인하는 AI Voice Agent 서비스입니다. Next.js App Router 기반의 데스크톱 관제 대시보드와 Twilio + OpenAI Realtime 한국어 음성 테스트, 병원 수용 확인 백엔드를 함께 제공합니다. 대시보드는 최소 가로 1280px 화면을 기준으로 구현합니다.

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

`http://localhost:3000/dispatch`에서 사용합니다.
Next.js가 `DISPATCH_BACKEND_URL`(기본 `http://127.0.0.1:8000`)로 요청을 전달하고,
`OPERATOR_TOKEN`은 서버에서만 읽습니다. 두 서버는 같은 토큰을 사용해야 합니다.
Next.js 프록시는 localhost / 동일 출처 전용이며, 외부 사용자는 운영자 토큰으로 보호된
FastAPI API를 직접 사용합니다. 임시 화면은 `http://127.0.0.1:8000/`에서도 사용할 수 있습니다.

## 관제 대시보드

[localhost:3000](http://localhost:3000)에서 확인할 수 있습니다. 기본 데모 실행에는 API 키나 환경변수가 필요하지 않습니다.

- 왼쪽 사이드바는 펼친 상태로 시작하며, 구급대, 환자 증상, 나이·성별, 접수번호, 접수시각, 진행상태를 표시합니다. 접으면 접수번호와 진행상태만 표시하며 환자 선택은 그대로 가능합니다.
- 지도 위 왼쪽 상단에는 선택한 접수 요약과 경과 시간, 접수 기록 버튼이 표시됩니다.
- 전체 배경 지도에 구급차와 병원 위치, 거리, 예상 이송 시간이 표시됩니다. 병원 마커를 누르면 해당 통화를 볼 수 있으며, 왼쪽 아래에서 구급차 위치로 이동하거나 확대·축소할 수 있습니다. 사이드바를 접고 펼칠 때는 동일한 지도 캔버스를 유지해 현재 이동·확대 상태가 바뀌지 않습니다.
- 오른쪽 위 환자 평가 패널은 Pre-KTAS 요약, 주요 활력징후, 상세 보기와 두 열로 구성된 수정 대화상자를 제공합니다. 기본정보, 증상, 의식·활력징후, 현장 Pre-KTAS 평가를 다룹니다.
- 오른쪽 아래 병원 목록과 통화 대화에서 병원 발언은 왼쪽, AI 발언은 오른쪽에 표시됩니다. 통화 시간과 발언이 데모 시나리오에 따라 갱신됩니다.
- 병원 목록은 상태별 필터와 거리·도착 예상 시간 정렬을 지원하며, 각 행 오른쪽에 예상 이송 시간을 강조합니다.
- 통화 진행 중은 주황색, 이송 가능은 초록색, 이송 불가는 빨간색, API 응답 오류는 회보라색으로 구분하며 상태 문구를 함께 표시합니다.

## 지도와 테마

### 공공데이터 병원 후보 조회

`.env.local`에 `OPENDATA_API_KEY`를 설정하고 `npm run dev`를 실행합니다.
사이드바 하단의 **환자 추가**를 누르면 신규 접수와 기존 환자 평가 대화상자가 열립니다.
환자 정보·구급차 좌표·검색 반경과 필요한 진료과·시술·장비·병상을 입력한 뒤 **완료**를
누르면 국립중앙의료원 데이터를 조회하여 지도와 병원 목록에 최대 10곳을 표시합니다.
**불러오기** 옆에서 **서울 · 흉통** 또는 **부산 · 편측 마비·언어장애**를 선택하면
각 가상 환자 정보와 지역 좌표, 시연용 진료 조건을 한 번에 채울 수 있습니다.
부산 케이스는 67세 여성, 부산진구 서면 좌표, 신경과·뇌경색 재관류중재술·CT·일반 응급병상 조건입니다.
입력창을 취소해도 신규 접수는 ‘입력 중’으로 남으며 ‘입력·수정’으로 다시 열 수 있습니다.
키는 서버에서만 사용하며 공공데이터포털의 **전국 응급의료기관 정보 조회 서비스**
활용신청이 승인되어 있어야 합니다. 기존 환경변수 파일은 덮어쓰지 마세요.

접수의 초기 좌표와 불러온 환자 정보는 데모 값입니다. 새 후보 조회 결과는 실제 공공데이터이며,
모든 후보는 **전화 전** 상태로 시작합니다. **일괄 전화 시작**을 누르면 현재 표시된 후보의
통화를 브라우저에서 시뮬레이션합니다. 화면의 ‘데모 통화 · 실제 발신 없음’을 확인하세요.
조회와 이 버튼은 실제 병원에 전화하지 않으며, 시뮬레이션 응답은 실제 수용 확답이 아닙니다.
실제 발신 기능은 별도 `/dispatch`에 있으며 한 번에 최대 2곳과 병원별 ETA가 필요합니다.
새 후보에는 **OSRM 자동차 경로의 도로 거리와 예상 시간**을 추가로 조회합니다.
지도와 목록에 ‘도로’로 표시하며 ‘도착 빠른 순’ 정렬도 사용할 수 있습니다.
경로 조회에 실패한 병원은 ‘직선’으로 구분하고 예상 시간은 비워 둡니다.
시간은 일반 자동차 기준 추정이며 실시간 교통과 구급차 우선 통행을 반영하지 않습니다.
수용 확정은 병원 확인이 필요합니다.
[입출력 및 데이터 처리 기준](docs/hospital-candidates.md)

```bash
npm run test:hospitals
npm run test:patient-workflow
npm run test:hospital-routes
```

지도는 **OpenStreetMap + Leaflet 1.9.4**를 사용합니다. 키 발급 없이 서울의 실제 지도 타일을 표시할 수 있어 데모의 기본 지도로 선정했습니다. 기본 타일 주소는 `https://tile.openstreetmap.org/{z}/{x}/{y}.png`이며 인터넷 연결이 필요합니다. 지도에는 OpenStreetMap 저작자 표시를 유지합니다.

도로 거리는 서버에서 [OSRM 공개 데모](https://github.com/Project-OSRM/osrm-backend/wiki/Demo-server)의
Table API를 호출해 계산합니다. 구급차·병원 좌표만 전달하며 환자 정보와 진료 조건은 전송하지 않습니다.
한 번에 표시 후보들을 묶어 조회하고 프로세스당 최소 1.1초 간격, 5분 메모리 캐시를 적용합니다.
공개 서버는 비상업적 시연 용도이며 가용성·갱신 주기를 보장하지 않습니다. 운영 시에는 별도
경로 서비스로 전환해야 합니다. 현재 UI의 후보 반경과 후보 선정은 직선거리 기준이며,
선정된 최대 10곳의 도로 거리·예상 시간을 비교합니다.

`NEXT_PUBLIC_MAP_TILE_URL`과 `NEXT_PUBLIC_MAP_TILE_ATTRIBUTION`으로 타일 제공자를 변경할 수 있습니다. 기본값은 OpenStreetMap이며, 데이터 출처 표시는 유지됩니다. 운영 배포 시에는 [OSM 타일 사용 정책](https://operations.osmfoundation.org/policies/tiles/)에 맞는 타일 제공자를 사용해야 합니다.

[tweakcn Tangerine](https://tweakcn.com/r/themes/tangerine.json)의 라이트 테마 토큰을 `src/app/theme.css`에 저장하고, `src/app/globals.css`에서 흰색 배경·주황색 주조색·검정 본문을 적용합니다.

## shadcn/ui 구성

[shadcn/ui 공식 CLI](https://ui.shadcn.com/docs/cli)로 설치한 Radix 기반 `new-york` 컴포넌트를 `src/components/ui/`에서 사용합니다. 설정은 `components.json`에 있으며, 기존 데스크톱 배치와 tweakcn 라이트 테마를 유지합니다.

| 화면 | 사용하는 컴포넌트 |
| --- | --- |
| 접수 사이드바 | Sidebar, SidebarMenu, Collapsible, ToggleGroup, Input, Button, Badge, ScrollArea, Tooltip |
| 환자 평가·수정 | Card, Collapsible, Dialog, Label, Input, Select, Textarea, ScrollArea, Alert |
| 병원 연락·통화 | Card, Tabs, Select, Button, Badge, ScrollArea, Alert |
| 접수 기록 | Dialog, ScrollArea, Badge, Button |
| 접수 요약·지도 조작 | Card, Badge, Separator, Button, Alert |

지도 렌더링과 위치 마커는 Leaflet을 유지합니다. 사이드바 상단에는 접기·펼치기 버튼만 표시합니다.

사이드바 목록과 스크롤 영역은 접기·펼치기 중에도 유지되며, 카드 높이와 접수번호·상태 위치는 280ms 동안 전환됩니다. 숨겨진 검색·상세 정보는 키보드와 스크린리더에서 제외합니다. 운영체제의 동작 줄이기 설정에서는 전환 애니메이션을 생략합니다. 지도 자동 범위 맞춤은 접수 위치가 달라질 때만 수행하고, 패널 크기 변경으로 반복 실행하지 않습니다.

공식 생성 코드 중 모바일 감지 훅은 `useSyncExternalStore`로, 스켈레톤 너비는 고정값으로 조정해 현재 프로젝트의 React lint 규칙을 충족합니다. 나머지 화면별 스타일은 `src/components/dashboard/*.css`에 있습니다.

## 데모 범위

초기 환자 입력 예시 4건과 좌표는 `src/lib/dashboard/demo-data.ts`에서 가져옵니다. 시작할 때 예시 병원·수용 결과·대화는 불러오지 않습니다. 병원 검색 후 공공데이터 후보와 OSRM 도로 ETA를 표시하며 실시간 교통은 반영하지 않습니다.

일괄 전화 버튼은 실제 발신·음성 스트리밍 백엔드에 연결되어 있습니다. `APP_MODE=live`이면 Twilio로 발신하며 `APP_MODE=demo`에서만 백엔드가 모의 통화를 생성합니다. Pre-KTAS 단계는 입력한 현장 평가값이며 앱이 새로 산정하지 않습니다.

환자 입력과 통화 연결 정보는 현재 탭의 sessionStorage에 보관해 새로고침 후 복구합니다. 실제 통화 전사와 수용 결과는 백엔드 SQLite에 저장합니다. 새로고침이나 SSE 재연결만으로 재발신하지 않습니다.

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

## 기술 구성

- Next.js / React / TypeScript (strict)
- Tailwind CSS / shadcn/ui (Radix UI) / tweakcn 테마 토큰 / Lucide 아이콘
- Leaflet / OpenStreetMap
- TanStack React Query, Zustand, Zod: 기존 프로젝트 기반 패키지
- Supabase: 환경변수 자리만 준비됨, SDK·DB·인증 미연결

## 구조

```text
src/app/                              진입 페이지, 레이아웃, 전역 스타일
src/app/theme.css                     tweakcn Tangerine 라이트 테마
src/components/dashboard/dashboard.tsx 대시보드 구성 및 패널 연결
src/components/dashboard/             지도, 환자 정보, 통화, 접수 기록 UI
src/components/ui/                    공식 CLI로 추가한 shadcn/ui 컴포넌트
src/hooks/use-mobile.ts                Sidebar에서 사용하는 화면 크기 구독
src/lib/dashboard/                    공통 타입, 접수별 데모 데이터
src/components/providers.tsx          기존 공통 Provider
src/app/api/health/route.ts            기존 상태 확인 API
```

`src/components/dashboard/use-demo-dashboard.ts`는 기존 컴포넌트 계약을 유지하며 실제 통화 연동 훅으로 동작합니다. `src/lib/dashboard/dispatch-adapter.ts`가 Pre-KTAS 입력과 병원 후보를 발신 요청으로 변환하고, `dispatch-controller.ts`가 병렬 발신·중복 방지·SSE 상태와 채팅을 연결합니다. `src/lib/dashboard/types.ts`의 `EmergencyCase`, `Patient`, `Hospital`, `TranscriptMessage`, `ReceptionLog`가 화면 데이터의 공통 계약입니다.

## 실제 서비스 연결 지점

데모 훅의 상태 공급을 실제 서버 데이터로 교체해야 합니다.

- 접수·환자 API: `EmergencyCase`와 `Patient`를 조회하고 수정 내용을 저장합니다.
- 병원·경로 API: 병원 위치와 수용 상태, 구급차 위치, 실제 도로 거리·ETA를 갱신합니다.
- 통화 이벤트 연결: 접수 ID와 병원 ID를 기준으로 통화 상태·시간과 병원/AI 발언을 전달합니다. 음성 재생에는 별도의 오디오 연결이 필요합니다.
- 접수 기록 API: 병원별 수용·거절·오류와 이송 진행 기록을 저장하고 조회합니다.

위 데모 데이터 교체는 현재 구현되어 있지 않습니다. 별도의 **병원 후보 조회** 창에서는
공공데이터 검색 API를 사용할 수 있습니다. 인증과 접근 제어, 영구 저장도 실제 백엔드를 도입할 때 연결해야 합니다.

Supabase 도입 시 `.env.example`의 변수를 `.env.local`에 추가합니다. 공개 키만 `NEXT_PUBLIC_` 변수에 넣고 secret/service role 키는 서버에서만 사용합니다.

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

http://localhost:3000/voice 에서 **대화 시작**을 누르고 마이크를 허용하세요.
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

## 대시보드 검증

개발 및 빌드는 프로젝트 스크립트에 따라 Webpack을 사용합니다. UI 확인은 1280px 이상 데스크톱에서 접수 전환, 환자 수정, 지도 조작, 병원 대화 선택, 접수 기록을 확인합니다.


## 지도 UI와 병렬 통화 연결

기존 지도에서 병원을 선택하면 해당 병원의 실제 전사가 기존 채팅창에 표시됩니다.
환자 ‘입력·수정’ → 병원 조회 → ‘일괄 전화 시작’ 순서이며, 조회나 지도 클릭만으로 전화하지 않습니다.
`OPENDATA_API_KEY`는 직접 `.env` 또는 `.env.local`에 입력하고 Next 서버를 재시작하세요.
기존 키와 `.env`는 병합 과정에서 변경하지 않습니다.

- Pre-KTAS의 입력된 나이·성별·증상·의식·활력징후·병력·현장 평가 및 선택한 진료 조건만 전달합니다. 평가자 이름은 제외하며, 비어 있는 값이나 새 진단·분류를 만들지 않습니다. 현재 입력 폼에 성명이 없어 ‘성명 미제공’으로 전달합니다.
- 후보의 응급실 번호(없으면 대표번호)와 도로 경로 ETA를 사용합니다. 번호 또는 ETA가 없으면 해당 병원은 발신하지 않고 기존 오류 영역에 사유를 표시합니다.
- 최대 10곳을 2곳씩 나눠 병렬 요청합니다. 동일 번호는 한 번만 발신합니다. 실제/모의 모드를 전화 버튼 영역에 표시하며, ‘일괄 전화 시작’을 누를 때만 발신합니다.
- 불확실한 POST 응답은 자동 재시도하지 않습니다. ‘다시 연결’을 직접 누르면 원래 요청 키와 환자 정보를 사용해 동일 요청을 확인합니다.
- 기존 채팅창에는 병원별 발언 순서와 현재 말풍선, 통화 종료 후 수용 가능/불가가 연결됩니다. 결과 판정 대기 중에는 ‘통화 종료 · 결과 판정 중’으로 표시합니다.
- 통화 채팅의 구조·디자인은 main 컴포넌트를 유지했습니다. 사용자 승인에 따라 고정된 데모 문구만 실제/모의 통화 모드에 맞게 변경했습니다.

```bash
node --experimental-strip-types --test tests/dispatch-controller.test.mjs tests/live-dashboard.test.mjs
```
