"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { DemoDashboard } from "./dashboard";
import { LiveDashboard } from "./live-dashboard";

export function DashboardEntry() {
  const [demo, setDemo] = useState(false);
  return <><nav className="dashboard-mode" aria-label="관제 화면 선택">
    <Button size="sm" variant={!demo ? "default" : "ghost"} onClick={() => setDemo(false)} aria-pressed={!demo}>실시간 통화</Button>
    <Button size="sm" variant={demo ? "default" : "ghost"} onClick={() => setDemo(true)} aria-pressed={demo}>화면 데모</Button>
  </nav>{demo ? <DemoDashboard /> : <LiveDashboard />}</>;
}
