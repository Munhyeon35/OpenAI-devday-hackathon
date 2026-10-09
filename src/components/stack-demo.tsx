"use client";

import { useQuery } from "@tanstack/react-query";
import { healthSchema } from "@/lib/schemas/health";
import { useCounterStore } from "@/stores/counter-store";

export function StackDemo() {
  const count = useCounterStore((state) => state.count);
  const increment = useCounterStore((state) => state.increment);
  const reset = useCounterStore((state) => state.reset);
  const health = useQuery({
    queryKey: ["health"],
    queryFn: async () => {
      const response = await fetch("/api/health");
      if (!response.ok) throw new Error("상태 확인에 실패했습니다.");
      return healthSchema.parse(await response.json());
    },
  });

  return (
    <section className="mt-10 rounded-2xl border border-neutral-200 bg-white p-6">
      <h2 className="font-semibold">개발 환경 확인</h2>
      <p className="mt-3 text-sm text-neutral-600" role="status">
        API 상태: {health.isPending ? "확인 중…" : health.isError ? "연결 실패" : `${health.data.service} · ${health.data.status}`}
      </p>
      {health.isError && <button onClick={() => health.refetch()} className="mt-2 text-sm underline">다시 확인</button>}
      <div className="mt-5 flex flex-wrap items-center gap-3">
        <button onClick={increment} className="rounded-lg bg-neutral-900 px-4 py-2 text-sm text-white hover:bg-neutral-700">카운터 +1</button>
        <button onClick={reset} className="rounded-lg border border-neutral-200 px-4 py-2 text-sm hover:bg-neutral-50">초기화</button>
        <span className="text-sm tabular-nums" aria-live="polite">Zustand: {count}</span>
      </div>
    </section>
  );
}
