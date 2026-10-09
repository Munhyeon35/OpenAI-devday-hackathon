"use client";

import { ArrowLeft, Bot, Check, ChevronRight, CircleAlert, Clock3, Hospital as HospitalIcon, PhoneCall, RefreshCw, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatDuration, type Hospital } from "@/lib/dashboard/types";

interface CallPanelProps {
  hospitals: Hospital[];
  mode?: "live" | "demo";
  pinned?: boolean;
  selectedHospitalId: string | null;
  onSelectHospital: (id: string | null) => void;
  streamingText: string;
  streamingRole: "hospital" | "ai";
  canRetry: boolean;
  onRetry: (id: string) => void;
}

export function StatusIcon({ status, size = 14 }: { status: Hospital["status"]; size?: number }) {
  const Icon = status === "available" ? Check : status === "unavailable" ? X : status === "error" ? CircleAlert : PhoneCall;
  return <Icon size={size} aria-hidden="true" />;
}

const PANEL_STATUS: Record<Hospital["status"], string> = {
  calling: "통화 중",
  available: "수용 가능",
  unavailable: "수용 불가",
  error: "응답 오류",
  unknown: "수용 미확인",
  processing: "결과 정리 중",
};

export function CallPanel({ mode = "demo", pinned = false, hospitals, selectedHospitalId, onSelectHospital, streamingText, streamingRole, canRetry, onRetry }: CallPanelProps) {
  const [filter, setFilter] = useState<"all" | "available" | "calling">("all");
  const [sort, setSort] = useState<"distance" | "eta">("distance");
  const selected = hospitals.find((hospital) => hospital.id === selectedHospitalId);
  const scrollRef = useRef<HTMLDivElement>(null);
  const followRef = useRef(true);
  const liveCount = hospitals.filter((hospital) => hospital.status === "calling").length;
  const availableCount = hospitals.filter((hospital) => hospital.status === "available").length;
  const sortedHospitals = [...hospitals]
    .sort((first, second) => sort === "distance"
      ? first.distance - second.distance || first.eta - second.eta
      : first.eta - second.eta || first.distance - second.distance);
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
  }, [selectedHospitalId, selected?.messages, streamingText]);

  return (
    <Card className="call-panel" role="region" aria-label="병원 전화 현황">
      {selected ? (
        <>
          <div className="conversation-header">
            {!pinned && <Button type="button" variant="ghost" size="icon" className="conversation-back" aria-label="병원 전화 목록으로 돌아가기" onClick={() => onSelectHospital(null)}><ArrowLeft size={20} /></Button>}
            <h2>병원 통화</h2>
            <span className="call-duration"><Clock3 size={14} />{formatDuration(selected.callSeconds)}</span>
          </div>
          <div className="conversation-heading">
            <div className="conversation-hospital-title"><h3>{selected.name}</h3><Badge variant="secondary" className={`status-badge ${selected.status}`}><StatusIcon status={selected.status} size={12} />{selected.statusLabel || PANEL_STATUS[selected.status]}</Badge></div>
            <p>{selected.department}<span>·</span>{selected.distanceKnown === false ? "거리 미등록" : `${selected.distance.toFixed(1)} km`}<span>·</span>예상 {selected.eta}분</p>
          </div>
          {["calling", "processing"].includes(selected.status) && <div className="conversation-progress"><PhoneCall size={15} /><span>{selected.note}</span></div>}
          <ScrollArea className="conversation-feed" ref={scrollRef} onScrollCapture={(event) => {
            const viewport = event.target;
            if (viewport instanceof HTMLDivElement && viewport.dataset.slot === "scroll-area-viewport") {
              followRef.current = viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight < 60;
            }
          }}>
            <div className="conversation-content">
            <div className="conversation-start"><Separator /><span>AI 통화 대화</span><Separator /></div>
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
            {!["calling", "processing"].includes(selected.status) && <Alert className={`call-result ${selected.status}`}><StatusIcon status={selected.status} /><AlertDescription>{selected.note}</AlertDescription></Alert>}
            </div>
          </ScrollArea>
          <div className="conversation-footer">
            {["calling", "processing"].includes(selected.status) ? <><span className="waveform" aria-hidden="true"><i /><i /><i /><i /><i /></span><span>{selected.status === "processing" ? "통화 종료 · 결과 정리 중" : "대화 수신 중"}</span><Badge variant="outline" className="demo-mini">{mode === "live" ? "실제 통화" : "모의 통화"}</Badge></> : selected.status === "error" && canRetry ? <Button type="button" variant="ghost" className="retry-button" onClick={() => onRetry(selected.id)}><RefreshCw size={15} />연결 다시 시도<Badge variant="outline" className="demo-mini">{mode === "live" ? "실제 통화" : "모의 통화"}</Badge></Button> : <><Check size={15} /><span>통화 종료 · 접수 기록에 반영됨</span><Badge variant="outline" className="demo-mini">{mode === "live" ? "실제 통화" : "모의 통화"}</Badge></>}
          </div>
        </>
      ) : (
        <>
          <div className="call-panel-heading"><h2>병원 연락 <Badge variant="secondary" className="call-count">{hospitals.length}</Badge></h2></div>
          <Tabs className="call-list-tabs" value={filter} onValueChange={(value) => setFilter(value as typeof filter)}>
            <div className="call-toolbar">
              <TabsList className="call-tabs" aria-label="전화 상태 필터">
                {tabs.map((tab) => <TabsTrigger value={tab.value} key={tab.value}>{tab.label} <span>{tab.count}</span></TabsTrigger>)}
              </TabsList>
              <Select value={sort} onValueChange={(value) => setSort(value as typeof sort)}>
                <SelectTrigger className="call-sort" aria-label="병원 정렬"><SelectValue /></SelectTrigger>
                <SelectContent className="call-sort-options" position="popper" align="end">
                  <SelectItem value="distance">가까운 순</SelectItem>
                  <SelectItem value="eta">도착 빠른 순</SelectItem>
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
                        <span className="hospital-info"><strong>{hospital.name}</strong><span className="hospital-meta"><span className="hospital-distance">{hospital.distanceKnown === false ? "거리 미등록" : `${hospital.distance.toFixed(1)} km`}</span><Badge variant="secondary" className={`status-badge ${hospital.status}`}><StatusIcon status={hospital.status} size={11} />{hospital.statusLabel || PANEL_STATUS[hospital.status]}</Badge></span></span>
                        <span className="hospital-eta" aria-label={`예상 이송 시간 ${hospital.eta}분`}><strong>{hospital.eta}</strong><span>분</span></span>
                        <ChevronRight size={18} className="hospital-chevron" aria-hidden="true" />
                      </Button>
                    ))}
                    {!visibleHospitals.length && <p className="empty-state">해당 상태의 병원이 없습니다.</p>}
                  </div>
                </ScrollArea>
              </TabsContent>;
            })}
          </Tabs>
          <div className="call-panel-footnote"><span className={`call-live-dot${liveCount ? " active" : ""}`} /><span><strong>{liveCount}개</strong> 병원과 통화 중</span><Badge variant="outline" className="demo-mini">{mode === "live" ? "실제 통화" : "모의 통화"}</Badge></div>
        </>
      )}
    </Card>
  );
}
