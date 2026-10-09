"use client";

import dynamic from "next/dynamic";
import { useEffect, useState, type CSSProperties } from "react";
import { Check, ChevronRight, Clock3, MapPin } from "lucide-react";
import { CALL_STATUS, formatDuration, type CallStatus } from "@/lib/dashboard/types";
import { PatientPanel } from "./patient-panel";
import { CallPanel } from "./call-panel";
import { ReceptionHistory } from "./reception-history";
import { ReceptionSidebar, CASE_STATUS_LABELS } from "./reception-sidebar";
import { useDemoDashboard } from "./use-demo-dashboard";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { SidebarProvider } from "@/components/ui/sidebar";

const HospitalMap = dynamic(() => import("./hospital-map"), {
  ssr: false,
  loading: () => <div className="map-loading"><MapPin size={28} /><span>주변 병원을 지도에 표시하고 있습니다.</span></div>,
});

export function Dashboard() {
  const { cases, getStream, savePatient, retryCall } = useDemoDashboard();
  const [selectedCaseId, setSelectedCaseId] = useState("008");
  const [selectedHospitalId, setSelectedHospitalId] = useState<string | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [saved, setSaved] = useState(false);
  const selectedCase = cases.find((reception) => reception.id === selectedCaseId)!;
  const selectedHospital = selectedCase.hospitals.find((hospital) => hospital.id === selectedHospitalId);
  const stream = getStream(selectedCase, selectedHospital);
  const counts = selectedCase.hospitals.reduce((result, hospital) => ({ ...result, [hospital.status]: result[hospital.status] + 1 }), { calling: 0, available: 0, unavailable: 0, error: 0 });

  useEffect(() => {
    if (!saved) return;
    const timeout = window.setTimeout(() => setSaved(false), 2600);
    return () => window.clearTimeout(timeout);
  }, [saved]);

  return (
    <SidebarProvider open={!sidebarCollapsed} onOpenChange={(open) => setSidebarCollapsed(!open)} className={`dashboard${sidebarCollapsed ? " sidebar-collapsed" : ""}`} style={{ "--sidebar-width": "var(--reception-sidebar-width)", "--sidebar-width-icon": "112px" } as CSSProperties}>
      <ReceptionSidebar cases={cases} selectedCaseId={selectedCaseId} collapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed((current) => !current)} onSelect={(id) => { setSelectedCaseId(id); setSelectedHospitalId(null); setSaved(false); }} />
      <main className="workspace" aria-label={`${selectedCase.unit} ${selectedCase.label} 관제`}>
        <section className="map-area" aria-label="주변 병원 지도">
          <HospitalMap hospitals={selectedCase.hospitals} ambulancePosition={selectedCase.position} unit={selectedCase.unit} selectedHospitalId={selectedHospitalId} onSelectHospital={setSelectedHospitalId} />
        </section>
        <Card className="case-header" role="region" aria-label="선택한 접수 요약">
          <div className="case-heading-row"><span className="selected-reception-number">접수 {selectedCase.id}</span><Separator orientation="vertical" className="case-heading-divider" /><h1>{selectedCase.unit} · {selectedCase.label}</h1><Badge variant="secondary" className={`case-status case-main-status ${selectedCase.status}`}><i />{CASE_STATUS_LABELS[selectedCase.status]}</Badge></div>
          <div className="case-metadata"><Clock3 size={18} /><span>접수 후</span><strong className="case-elapsed-time">{formatDuration(selectedCase.elapsedSeconds)}</strong><ReceptionHistory reception={selectedCase} open={historyOpen} onOpenChange={setHistoryOpen}><Button variant="ghost" className="history-button">접수 기록<ChevronRight size={17} /></Button></ReceptionHistory></div>
        </Card>
        <aside className="detail-column" aria-label="환자 정보 및 병원 전화">
          <PatientPanel key={`patient-${selectedCase.id}`} patient={selectedCase.patient} onSave={(patient) => { savePatient(selectedCase.id, patient); setSaved(true); }} />
          <CallPanel key={`calls-${selectedCase.id}`} canRetry={selectedCase.status !== "completed"} hospitals={selectedCase.hospitals} selectedHospitalId={selectedHospitalId} onSelectHospital={setSelectedHospitalId} streamingText={stream.text} streamingRole={stream.role} onRetry={(hospitalId) => retryCall(selectedCase.id, hospitalId)} />
        </aside>
        <Card className="map-legend" aria-label="병원 상태 범례">{(["calling", "available", "unavailable", "error"] as CallStatus[]).map((status) => <Badge variant="outline" key={status}><span className={`status-dot ${status}`} /><span>{CALL_STATUS[status].shortLabel}</span><strong>{counts[status]}</strong></Badge>)}</Card>
        <p className="map-demo-note">환자·통화·거리·예상 시간은 시연용 데이터입니다.</p>
      </main>
      {saved && <Alert className="save-toast" role="status"><Check size={18} /><AlertDescription>환자 정보를 수정했습니다.</AlertDescription></Alert>}
    </SidebarProvider>
  );
}
