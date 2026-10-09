# main과 응급실 수용 확인 구현 비교

비교 기준: 기존 main `97eb81d`와 로컬 BedLink 구현. 기존 파일을 교체하지 않고 기능을 추가했다.

| 기능 | 기존 main | 추가한 구현 / 병합 결과 |
| --- | --- | --- |
| 브라우저 마이크 대화 / WebRTC | 있음 | 기존 `VoiceTest`, `/api/realtime` 그대로 유지 |
| 공유 한국어 테스트 시나리오 | 있음 | `server/scenario.txt` 그대로 유지 |
| 단일 번호 전화 연결 테스트 | Twilio + Realtime, `/calls` | `server/voice.mjs` 그대로 유지 |
| 말 끊기 처리 / 재생 완료 후 종료 | 기존 Realtime 경로에 있음 | 그대로 유지. GPT-Live에 Realtime 이벤트를 복사하지 않음 |
| 환자 상태·이름·나이·위치·병원별 ETA | 없음 | FastAPI 요청 검증 및 임시 입력 화면 추가 |
| 두 병원 동시 발신, 통화별 세션 격리 | 없음 | GPT-Live 전용 세션과 독립 상태 관리 추가 |
| 수용 확답, 환자·ETA 확인, 발언 근거 검증 | 없음 | Responses delegation + 결과 검증 추가 |
| 수용 가능 / 불가 / 미확인 | 없음 | 병원별 구조화 결과 추가 |
| 상태 / 전사 / 결과 조회 API | 없음 | 인증된 dispatch API 추가 |
| SQLite 저장, 재시작 복구 | 없음 | 통화 상태와 결과 영속 저장 추가 |
| 중복 발신 방지 | 없음 | Idempotency-Key 및 입력 충돌 검증 추가 |
| 통화 취소 / 시간 초과 처리 | 기본 통화 제한 있음 | dispatch별 취소, 미확인 처리, 늦은 콜백 정리 추가 |
| 외부 결과 웹훅 / 재전송 | 없음 | durable outbox와 전송 재시도 추가 |
| 음성 흐름 애니메이션 | 없음 | HTML 설명 페이지 추가 |

## 연결 방식

- Next.js `3000`: 기존 브라우저 음성 테스트와 `/dispatch` 응급실 입력 화면.
- Node `3001`: 기존 단일 전화 테스트. 기존 Realtime 이벤트와 종료 처리를 보존한다.
- FastAPI `8000`: 새 응급실 수용 확인. Python 코드는 `backend/app/`에 있어 Next.js의 `app` 디렉터리 탐색과 충돌하지 않는다.
- Next.js `/api/config`, `/api/dispatches/**`는 FastAPI로 전달한다. localhost / 동일 출처만 허용하고 `OPERATOR_TOKEN`은 서버에서만 주입한다.
- 기존 `/api/health`, `/api/realtime`, `/calls`, `/media-stream`은 변경하지 않는다.
- 공개 Twilio 연결은 대상 서비스별로 다르다. `PUBLIC_VOICE_URL`은 Node `3001`, `PUBLIC_BASE_URL`은 FastAPI `8000`을 향한다.
- GPT-Live와 Realtime은 프로토콜이 다르므로 브리지를 하나로 합치지 않는다. 기존 일반 음성 테스트와 환자 수용 확인의 시나리오도 별도로 유지한다.

## 검증 범위

Python 테스트는 동시 발신, 실패 격리, 서명/통화 바인딩, 취소 경쟁 상태, 저장 및 웹훅 재시도를 검증한다.
Node 프록시 테스트는 인증 정보의 서버 주입, localhost/Origin 제한, API 경로 제한, 중복 재시도 방지와 정적 파일 허용 목록을 검증한다.
통합 화면의 발신 검증은 격리된 demo 서버로 수행한다. 이번 병합 검증에서 실제 전화나 마이크 대화를 새로 시작하지 않는다.
이전 단일 번호 실통화 성공은 GPT-Live 경로의 검증이며, 기존 Realtime 경로와 두 번호 동시 실통화의 성공을 대신하지 않는다.

검증 결과: Python 20개 및 Node 프록시 8개 테스트 통과. lint(기존 경고 1개, 오류 없음), typecheck, production build, `node --check server/voice.mjs` 통과. 격리된 demo 서버에서 Next.js 입력 → 두 결과 저장, 동일 키 중복 방지, 교차 출처 차단, 기존 Realtime 입력 검증 및 정적 자격 증명 접근 차단을 확인했다. 브라우저에서도 기존 홈 메뉴에서 응급실 화면으로 이동해 수용 가능/불가 결과를 확인했다.
