import { StackDemo } from "@/components/stack-demo";

export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center px-6 py-16">
      <div className="mb-8 flex items-center gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/icon.svg" alt="" width={56} height={56} />
        <span className="text-sm font-medium tracking-wide text-neutral-500">응급 AI Caller</span>
      </div>
      <h1 className="text-5xl font-bold tracking-tight">올뺑이</h1>
      <p className="mt-5 text-lg text-neutral-600">응급 AI Caller 서비스를 위한 개발을 시작하세요.</p>
      <div className="mt-8 flex flex-wrap gap-2">
        {["Next.js", "TypeScript", "Tailwind CSS", "Zod", "React Query", "Zustand"].map((name) => (
          <span key={name} className="rounded-full border border-neutral-200 bg-white px-4 py-2 text-sm">{name}</span>
        ))}
      </div>
      <StackDemo />
      <p className="mt-6 text-sm text-neutral-500">Supabase 연결 예정 · 현재는 프로젝트 초기 설정 단계입니다.</p>
    </main>
  );
}
