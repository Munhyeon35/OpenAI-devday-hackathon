"use client";

import { useState } from "react";
import { Clock3, PanelLeftClose, Search, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sidebar, SidebarContent, SidebarFooter, SidebarHeader, SidebarMenu, SidebarMenuButton, SidebarMenuItem } from "@/components/ui/sidebar";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { EmergencyCase } from "@/lib/dashboard/types";

export const CASE_STATUS_LABELS = { searching: "병원 선정 중", assigned: "이송 중", completed: "이송 완료" };

interface ReceptionSidebarProps {
  cases: EmergencyCase[];
  selectedCaseId: string;
  collapsed: boolean;
  onToggle: () => void;
  onSelect: (id: string) => void;
}

export function ReceptionSidebar({ cases, selectedCaseId, collapsed, onToggle, onSelect }: ReceptionSidebarProps) {
  const [query, setQuery] = useState("");
  const [activeOnly, setActiveOnly] = useState(false);
  const activeCount = cases.filter((reception) => reception.status !== "completed").length;
  const toggleLabel = collapsed ? "사이드바 펼치기" : "사이드바 접기";
  const visibleIds = new Set(cases.filter((reception) => collapsed || (
    (!activeOnly || reception.status !== "completed") &&
    `${reception.id} ${reception.unit} ${reception.label} ${reception.patient.age} ${reception.patient.gender}`.includes(query.trim())
  )).map((reception) => reception.id));

  return (
    <Sidebar collapsible="icon" className={`reception-sidebar-ui${collapsed ? " is-collapsed" : ""}`} role="complementary" aria-label="환자 접수 목록">
      <SidebarHeader className="sidebar-brand-row">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" className="sidebar-toggle icon-button" type="button" aria-label={toggleLabel} aria-expanded={!collapsed} aria-controls="reception-items" onClick={onToggle}>
              <PanelLeftClose size={21} className="sidebar-toggle-icon" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="right">{toggleLabel}</TooltipContent>
        </Tooltip>
      </SidebarHeader>
      <SidebarContent className="reception-sidebar-content">
        <Collapsible open={!collapsed} className="sidebar-tools-collapse">
          <CollapsibleContent forceMount className="sidebar-reveal" aria-hidden={collapsed} inert={collapsed}>
            <div className="sidebar-reveal-inner">
              <div className="sidebar-tools">
                <div className="sidebar-title"><h2>환자 접수</h2><Badge variant="secondary" className="sidebar-count">{cases.length}</Badge></div>
                <div className="case-search">
                  <Search size={16} />
                  <Input className="sidebar-search-input" aria-label="환자 접수 검색" placeholder="구급대, 환자, 접수번호 검색" value={query} onChange={(event) => setQuery(event.target.value)} />
                  {query && <Button variant="ghost" size="icon" className="sidebar-clear-search" aria-label="검색 초기화" onClick={() => setQuery("")}><X size={14} /></Button>}
                </div>
                <ToggleGroup type="single" value={activeOnly ? "active" : "all"} onValueChange={(value) => { if (value) setActiveOnly(value === "active"); }} className="case-tabs" aria-label="접수 상태 필터">
                  <ToggleGroupItem value="all">전체 <span>{cases.length}</span></ToggleGroupItem>
                  <ToggleGroupItem value="active">진행 중 <span>{activeCount}</span></ToggleGroupItem>
                </ToggleGroup>
              </div>
            </div>
          </CollapsibleContent>
        </Collapsible>
        <ScrollArea className="reception-scroll-area">
          <SidebarMenu className="reception-list" id="reception-items">
            {cases.map((reception) => (
              <SidebarMenuItem key={reception.id} hidden={!visibleIds.has(reception.id)}>
                <SidebarMenuButton
                  className={`reception-card group-data-[collapsible=icon]:w-full! group-data-[collapsible=icon]:h-[var(--reception-card-height)]! group-data-[collapsible=icon]:p-0!${selectedCaseId === reception.id ? " selected" : ""}`}
                  isActive={selectedCaseId === reception.id}
                  aria-pressed={selectedCaseId === reception.id}
                  onClick={() => onSelect(reception.id)}
                >
                  <span className="reception-number">접수 <strong>{reception.id}</strong></span>
                  <Badge variant="outline" className={`case-status ${reception.status}`}><i />{CASE_STATUS_LABELS[reception.status]}</Badge>
                  <span className="reception-expanded-details" aria-hidden={collapsed} inert={collapsed}>
                    <strong className="reception-unit">{reception.unit}</strong>
                    <span className="reception-patient"><strong>{reception.label}</strong><span>{reception.patient.age}세 · {reception.patient.gender}</span></span>
                    <span className="reception-card-bottom"><span><Clock3 size={13} />접수 시각</span><time>{reception.receivedAt}</time></span>
                  </span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
            {!visibleIds.size && <li className="empty-state"><Search size={24} /><p>검색 결과가 없습니다.</p><span>구급대 또는 접수번호를 확인해 주세요.</span></li>}
          </SidebarMenu>
        </ScrollArea>
      </SidebarContent>
      <Collapsible open={!collapsed} className="sidebar-footer-collapse">
        <CollapsibleContent forceMount className="sidebar-reveal" aria-hidden={collapsed} inert={collapsed}>
          <div className="sidebar-reveal-inner"><SidebarFooter className="sidebar-footer"><span className="demo-dot" />데모 데이터<span>서울특별시</span></SidebarFooter></div>
        </CollapsibleContent>
      </Collapsible>
    </Sidebar>
  );
}
