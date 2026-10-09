"use client";
import { useEffect, useState } from "react";
import type { DispatchJob } from "@/lib/dashboard/live-data";

export function useLiveDashboard() {
  const [jobs, setJobs] = useState<DispatchJob[]>([]);
  const [connection, setConnection] = useState<"connecting" | "connected" | "reconnecting">("connecting");
  const [mode, setMode] = useState<"live" | "demo" | null>(null);
  const [now, setNow] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/config", { signal:controller.signal }).then(async (response) => {
      if (response.ok) setMode((await response.json()).mode);
    }).catch(() => {});
    const stream = new EventSource("/api/dispatches/events");
    stream.addEventListener("snapshot", (event) => {
      try {
        const snapshot = JSON.parse(event.data) as { dispatches: DispatchJob[] };
        if (!Array.isArray(snapshot.dispatches)) return;
        setJobs(snapshot.dispatches); // Replace, never append: reconnects cannot duplicate bubbles.
        setConnection("connected");
      } catch { setConnection("reconnecting"); }
    });
    stream.addEventListener("update", (event) => {
      try {
        const update = JSON.parse(event.data) as { dispatches: DispatchJob[] };
        if (!Array.isArray(update.dispatches)) return;
        setJobs((previous) => {
          const jobs = new Map(previous.map((job) => [job.id, job]));
          update.dispatches.forEach((job) => jobs.set(job.id, job));
          return [...jobs.values()].sort((a,b) => b.created_at.localeCompare(a.created_at)).slice(0,50);
        });
        setConnection("connected");
      } catch { setConnection("reconnecting"); }
    });
    stream.onerror = () => setConnection("reconnecting");
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => { controller.abort(); stream.close(); window.clearInterval(timer); };
  }, []);
  return { jobs, connection, mode, now };
}
