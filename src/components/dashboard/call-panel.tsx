"use client";

import { ArrowLeft, Bot, Check, ChevronRight, CircleAlert, Clock3, Hospital as HospitalIcon, LoaderCircle, PhoneCall, RefreshCw, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { compareHospitalTravel, formatDuration, hospitalDistanceLabel, type EmergencyCase, type Hospital } from "@/lib/dashboard/types";

interface CallPanelProps {
  hospitals: Hospital[];
  selectedHospitalId: string | null;
  onSelectHospital: (id: string | null) => void;
  streamingText: string;
  streamingRole: "hospital" | "ai";
  canRetry: boolean;
  onRetry: (id: string) => void;
  search?: EmergencyCase["candidateSearch"];
  onSearchAgain: () => void;
  onStartCalls: () => void;
}

export function StatusIcon({ status, size = 14 }: { status: Hospital["status"]; size?: number }) {
  const Icon = status === "pending" ? Clock3 : status === "available" ? Check : status === "unavailable" ? X : status === "error" ? CircleAlert : PhoneCall;
  return <Icon size={size} aria-hidden="true" />;
}

const PANEL_STATUS: Record<Hospital["status"], string> = {
  pending: "전화 전",
  calling: "통화 중",
  available: "수용 가능",
  unavailable: "수용 불가",
  error: "응답 오류",
};

export function CallPanel({ hospitals, selectedHospitalId, onSelectHospital, streamingText, streamingRole, canRetry, onRetry, search, onSearchAgain, onStartCalls }: CallPanelProps) {
  const [filter, setFilter] = useState<"all" | "available" | "calling">("all");
  const [sort, setSort] = useState<"distance" | "eta">("distance");
  const selected = hospitals.find((hospital) => hospital.id === selectedHospitalId);
  const scrollRef = useRef<HTMLDivElement>(null);
  const followRef = useRef(true);
  const liveCount = hospitals.filter((hospital) => hospital.status === "calling").length;
  const availableCount = hospitals.filter((hospital) => hospital.status === "available").length;
  const pendingCount = hospitals.filter((hospital) => hospital.status === "pending").length;
  const sortedHospitals = [...hospitals].sort((first, second) => compareHospitalTravel(first, second, sort));
  const tabs = [
    { value: "all", label: "전체", count: hospitals.length },
    { value: "calling", label: "통화 중", count: liveCount },
    { value: "available", label: "수용 가능", count: availableCount },
  ] as const;

  useEffect(() => {
    followRef.current = true;
  }, [selectedHospitalId]);

  useEffect(() => {
    const viewport = scrollRef.current?.querySelector<HTMLDivElement>('[data-slot="scroll-area-viewport"]');
    if (viewport && followRef.current) viewport.scrollTop = viewport.scrollHeight;
  }, [selectedHospitalId, selected?.messages.length, streamingText]);

  return (
    <Card className="call-panel" role="region" aria-label="병원 전화 현황">
      {search && <div className="candidate-flow-status" aria-live="polite">
        {search.status === "draft" && <p>환자 입력을 완료하면 병원 후보가 표시됩니다.</p>}
        {search.status === "loading" && <p><LoaderCircle size={16} className="animate-spin" />조건에 맞는 병원을 조회하고 있습니다…</p>}
        {search.status === "error" && <><p role="alert">{search.error}</p><Button size="sm" variant="outline" onClick={onSearchAgain}><RefreshCw size={14} />다시 조회</Button></>}
        {search.result && <><p><strong>공공데이터 후보 {hospitals.length}곳</strong><span>수용 미확정</span></p>
          {hospitals.length > 0 && !pendingCount && <p className="candidate-demo-status">데모 통화 진행·응답 · 실제 발신 없음</p>}
          {search.result.routing && <p className="candidate-route-source"><a href="https://project-osrm.org/" target="_blank" rel="noopener noreferrer">OSRM</a> · {search.result.routing.status === "unavailable" ? "경로 조회 실패 · 직선거리 표시" : "자동차 경로 · 실시간 교통 미반영"}</p>}
          <details><summary>조회 정보 · 유의사항</summary><p>반경 내 {search.result.totalNearby}곳 · 조건별 후보 {search.result.totalMatched}곳 중 {hospitals.length}곳 표시</p><p>조회 {new Date(search.result.retrievedAt).toLocaleTimeString("ko-KR", { timeZone: "Asia/Seoul" })} · {search.result.distanceType === "road" ? "도로 거리·예상 시간" : search.result.distanceType === "mixed" ? "도로 거리·일부 직선거리" : "직선거리 · 이동시간 미제공"}</p>{search.result.warnings.map((warning) => <p key={warning}>{warning}</p>)}</details>
          {!hospitals.length && <p>조건에 해당하는 후보가 없습니다. 환자 ‘입력·수정’에서 조건이나 반경을 변경해 주세요.</p>}
        </>}
      </div>}
      {selected ? (
        <>
          <div className="conversation-header">
            <Button type="button" variant="ghost" size="icon" className="conversation-back" aria-label="병원 전화 목록으로 돌아가기" onClick={() => onSelectHospital(null)}><ArrowLeft size={20} /></Button>
            <h2>병원 통화</h2>
            <span className="call-duration"><Clock3 size={14} />{formatDuration(selected.callSeconds)}</span>
          </div>
          <div className="conversation-heading">
            <div className="conversation-hospital-title"><h3>{selected.name}</h3><Badge variant="secondary" className={`status-badge ${selected.status}`}><StatusIcon status={selected.status} size={12} />{PANEL_STATUS[selected.status]}</Badge></div>
            <p>{selected.department}<span>·</span>{hospitalDistanceLabel(selected)} {selected.distance.toFixed(1)} km{selected.eta !== null && <><span>·</span>예상 {selected.eta}분</>}</p>
          </div>
          {selected.status === "calling" && <div className="conversation-progress"><PhoneCall size={15} /><span>{selected.note}</span></div>}
          <ScrollArea className="conversation-feed" ref={scrollRef} onScrollCapture={(event) => {
            const viewport = event.target;
            if (viewport instanceof HTMLDivElement && viewport.dataset.slot === "scroll-area-viewport") {
              followRef.current = viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight < 60;
            }
          }}>
            <div className="conversation-content">
            {selected.candidate && <div className="candidate-detail"><p>{selected.candidate.address}</p><p>응급실 {selected.candidate.emergencyPhone || "번호 정보 없음"}</p><strong>{selected.candidate.match === "reported_match" ? "선택 조건 충족 보고" : "조건 확인 필요"} · 수용 미확정</strong>{selected.candidate.checks.map((check) => <p key={check.code}>{check.label}: {check.status === "reported_available" ? "가능 보고" : check.status === "reported_unavailable" ? "불가 보고" : "확인 필요"}{check.detail && ` · ${check.detail}`}</p>)}{selected.candidate.procedureNotes.map((note) => <p key={note}>{note}</p>)}</div>}
            <div className="conversation-start"><Separator /><span>{selected.status === "pending" ? "전화 전 · 아직 대화가 없습니다" : "AI 데모 통화 대화"}</span><Separator /></div>
            {selected.messages.map((message) => (
              <div className={`message ${message.role}`} key={message.id}>
                <div className="message-label">{message.role === "hospital" ? <><HospitalIcon size={14} /> 병원</> : <><Bot size={15} /> 올뺑이 AI</>}</div>
                <p>{message.text}</p>
                <time>{message.time}</time>
              </div>
            ))}
            {selected.status === "calling" && streamingText && (
              <div className={`message ${streamingRole} streaming-message`}>
                <div className="message-label">{streamingRole === "hospital" ? <><HospitalIcon size={14} /> 병원</> : <><Bot size={15} /> 올뺑이 AI</>}</div>
                <p>{streamingText}<span className="stream-cursor" /></p>
                <span className="stream-caption">대화 표시 중</span>
              </div>
            )}
            {selected.status !== "calling" && <Alert className={`call-result ${selected.status}`}><StatusIcon status={selected.status} /><AlertDescription>{selected.note}</AlertDescription></Alert>}
            </div>
          </ScrollArea>
          <div className="conversation-footer">
            {selected.status === "pending" ? <><Clock3 size={15} /><span>일괄 전화 시작을 기다리고 있습니다.</span></> : selected.status === "calling" ? <><span className="waveform" aria-hidden="true"><i /><i /><i /><i /><i /></span><span>대화 수신 중</span><Badge variant="outline" className="demo-mini">데모 통화</Badge></> : selected.status === "error" && canRetry ? <Button type="button" variant="ghost" className="retry-button" onClick={() => onRetry(selected.id)}><RefreshCw size={15} />연결 다시 시도<Badge variant="outline" className="demo-mini">데모 통화</Badge></Button> : <><Check size={15} /><span>통화 종료 · 접수 기록에 반영됨</span><Badge variant="outline" className="demo-mini">데모 통화</Badge></>}
          </div>
        </>
      ) : (
        <>
          <div className="call-panel-heading"><h2>병원 연락</h2></div>
          <Tabs className="call-list-tabs" value={filter} onValueChange={(value) => setFilter(value as typeof filter)}>
            <div className="call-toolbar">
              <TabsList className="call-tabs" aria-label="전화 상태 필터">
                {tabs.map((tab) => <TabsTrigger value={tab.value} key={tab.value}>{tab.label} <span>{tab.count}</span></TabsTrigger>)}
              </TabsList>
              <Select value={sort} onValueChange={(value) => setSort(value as typeof sort)}>
                <SelectTrigger className="call-sort" aria-label="병원 정렬"><SelectValue /></SelectTrigger>
                <SelectContent className="call-sort-options" position="popper" align="end">
                  <SelectItem value="distance">가까운 순</SelectItem>
                  <SelectItem value="eta" disabled={hospitals.every((hospital) => hospital.eta === null)}>도착 빠른 순</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {tabs.map((tab) => {
              const visibleHospitals = sortedHospitals.filter((hospital) => tab.value === "all" || hospital.status === tab.value);
              return <TabsContent key={tab.value} value={tab.value} className="call-tab-content">
                <ScrollArea className="hospital-list">
                  <div className="hospital-list-content">
                    {visibleHospitals.map((hospital) => (
                      <Button type="button" variant="ghost" className={`hospital-row ${hospital.status}`} key={hospital.id} onClick={() => { followRef.current = true; onSelectHospital(hospital.id); }}>
                        <span className="hospital-info"><strong>{hospital.name}</strong><span className="hospital-meta"><span className="hospital-distance">{hospitalDistanceLabel(hospital) + " "}{hospital.distance.toFixed(1)} km</span><Badge variant="secondary" className={`status-badge ${hospital.status}`}><StatusIcon status={hospital.status} size={11} />{PANEL_STATUS[hospital.status]}</Badge></span></span>
                        {hospital.eta !== null ? <span className="hospital-eta" aria-label={`예상 이송 시간 ${hospital.eta}분`}><strong>{hospital.eta}</strong><span>분</span></span> : <span className="hospital-condition">{hospital.candidate?.match === "reported_match" ? "조건 충족 보고" : "조건 확인 필요"}</span>}
                        <ChevronRight size={18} className="hospital-chevron" aria-hidden="true" />
                      </Button>
                    ))}
                    {!visibleHospitals.length && <p className="empty-state">{search?.status === "loading" ? "검색이 끝나면 병원 후보가 여기에 표시됩니다." : "해당 상태의 병원이 없습니다."}</p>}
                  </div>
                </ScrollArea>
              </TabsContent>;
            })}
          </Tabs>
        </>
      )}
      {pendingCount > 0 && search?.status === "ready" && <div className="bulk-call-prompt"><div><strong>{pendingCount}곳에 전화할까요?</strong><span>데모 통화 · 실제 발신 없음</span></div><Button type="button" onClick={onStartCalls}><PhoneCall size={16} />일괄 전화 시작</Button></div>}
    </Card>
  );
}
