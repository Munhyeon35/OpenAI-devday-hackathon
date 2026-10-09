"use client";

import { useRef } from "react";
import { Clock3, History, X } from "lucide-react";
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { EmergencyCase } from "@/lib/dashboard/types";

export function ReceptionHistory({ reception, open, onOpenChange, children }: { reception: EmergencyCase; open: boolean; onOpenChange: (open: boolean) => void; children: ReactNode }) {
  const returnFocusRef = useRef<HTMLElement | null>(null);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent
        className="reception-history-dialog"
        showCloseButton={false}
        onOpenAutoFocus={() => { returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null; }}
        onCloseAutoFocus={(event) => { event.preventDefault(); returnFocusRef.current?.focus(); }}
      >
        <DialogHeader className="history-header">
          <div>
            <Badge variant="outline" className="history-reception-badge">접수 {reception.id}</Badge>
            <DialogTitle><History size={20} />접수 기록</DialogTitle>
          </div>
          <DialogClose asChild><Button variant="ghost" size="icon" className="icon-button" aria-label="접수 기록 닫기"><X size={20} /></Button></DialogClose>
        </DialogHeader>
        <ScrollArea className="history-scroll-area">
          <div className="history-summary">
            <strong>{reception.unit} · {reception.label}</strong>
            <DialogDescription>병원별 연결과 응답을 시간순으로 확인합니다.</DialogDescription>
          </div>
          <ol className="history-timeline">
            {reception.logs.map((log) => <li key={log.id}><span className={`timeline-dot ${log.status ?? "neutral"}`} /><div><time><Clock3 size={11} />{log.time}</time><h3>{log.title}</h3><p>{log.detail}</p></div></li>)}
          </ol>
        </ScrollArea>
        <DialogFooter className="history-footer"><Badge variant="secondary" className="demo-mini">데모 데이터</Badge><span>현재 브라우저 세션의 접수 기록입니다.</span></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
