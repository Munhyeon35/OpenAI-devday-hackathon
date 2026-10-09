# 올뺑이 | 응급 AI Caller

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
