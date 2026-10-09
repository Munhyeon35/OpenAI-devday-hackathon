"use client";
import { useState, type CSSProperties } from "react";
import { Phone, MapPin, Radio, PhoneOff } from "lucide-react";
import { SidebarProvider } from "@/components/ui/sidebar";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ReceptionSidebar } from "./reception-sidebar";
import { CallPanel } from "./call-panel";
import { StartDispatch } from "./start-dispatch";
import { useLiveDashboard } from "./use-live-dashboard";
import { toReception } from "@/lib/dashboard/live-data";

export function LiveDashboard() {
  const { jobs, connection, mode, now } = useLiveDashboard();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [canceling, setCanceling] = useState(false);
  const [error, setError] = useState("");
  const cases = jobs.map((job) => toReception(job, now));
  const selected = cases.find((item) => item.id === selectedId) || cases[0];
  const job = jobs.find((item) => item.id === selected?.id);
  const active = job?.hospitals.some((h) => !["completed","failed","busy","no-answer","canceled"].includes(h.call_status) && !h.voice_ended_at);
  async function cancel() {
    if (!job || canceling) return;
    setCanceling(true); setError("");
    try {
      const response = await fetch(`/api/dispatches/${job.id}/cancel`, { method:"POST", headers:{"Content-Type":"application/json"}, body:"{}" });
      if (!response.ok) throw new Error("통화 종료 요청에 실패했습니다. 연결 상태를 확인해 주세요.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "통화 종료 요청 실패"); }
    finally { setCanceling(false); }
  }
  return <SidebarProvider open={!collapsed} onOpenChange={(open) => setCollapsed(!open)} className={`dashboard live-dashboard${collapsed ? " sidebar-collapsed" : ""}`} style={{ "--sidebar-width":"var(--reception-sidebar-width)", "--sidebar-width-icon":"112px" } as CSSProperties}>
    <ReceptionSidebar mode="live" cases={cases} selectedCaseId={selected?.id || ""} collapsed={collapsed} onToggle={() => setCollapsed(!collapsed)} onSelect={setSelectedId} />
    <main className="live-workspace" aria-label="실시간 병렬 통화 관제">
      <header className="live-page-heading">
        <div><p className="live-eyebrow"><Radio size={15} /> 실시간 병원 연락</p><h1>{selected ? `${selected.unit} · 수용 확인` : "환자 수용 확인"}</h1></div>
        <StartDispatch mode={mode} disabled={connection !== "connected"} onCreated={setSelectedId} />
      </header>
      <div className={`live-connection ${connection}`} role="status">
        <span className="live-connection-dot" />{connection === "connected" ? "대화 연결됨 · 병원별 발언이 실시간으로 표시됩니다" : connection === "connecting" ? "대화 서버 연결 중…" : "연결이 끊겼습니다. 다시 연결하는 중… 이전 대화는 유지됩니다."}
        {mode && <Badge variant="outline">{mode === "live" ? "실제 발신 모드" : "모의 발신 모드"}</Badge>}
      </div>
      {selected && job ? <>
        <Card className="live-patient-summary">
          <div><span className="live-patient-age">{selected.patient.age}세</span><h2>{job.patient.name}</h2><p>{job.patient.condition}</p><span className="live-patient-location"><MapPin size={14} />{job.patient.location}</span></div>
          <div className="live-case-actions"><Badge variant="secondary">{selected.statusLabel}</Badge><span>{job.mode === "live" ? "실제 통화" : "모의 통화"} · 접수 {selected.displayId}</span>{active && <Button variant="outline" disabled={canceling} onClick={cancel}><PhoneOff size={14} />{canceling ? "종료 요청 중…" : "진행 중 통화 종료"}</Button>}</div>
        </Card>
        {error && <p className="dispatch-error" role="alert">{error}</p>}
        <div className="parallel-conversations" aria-label="병원별 실시간 대화">
          {selected.hospitals.map((hospital) => <section key={hospital.id} aria-label={`${hospital.name} 대화`}>
            <CallPanel mode={job.mode} pinned hospitals={[hospital]} selectedHospitalId={hospital.id} onSelectHospital={() => {}} streamingText="" streamingRole="hospital" canRetry={false} onRetry={() => {}} />
          </section>)}
        </div>
        <p className="live-caption-note">AI와 병원 발언의 실시간 전사입니다. 수용 여부는 최종 확답을 검증한 뒤 표시합니다.</p>
      </> : <Card className="live-empty"><Phone size={36} /><h2>아직 통화 요청이 없습니다</h2><p>새 수용 요청에서 환자 정보와 병원 전화번호를 입력하세요.<br />두 병원의 대화가 각각 채팅으로 표시됩니다.</p>{connection === "reconnecting" && <p>8000번 수용 확인 서버의 실행 상태를 확인해 주세요.</p>}</Card>}
    </main>
  </SidebarProvider>;
}
