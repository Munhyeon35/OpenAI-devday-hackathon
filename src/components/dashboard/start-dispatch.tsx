"use client";
import { useRef, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export function StartDispatch({ mode, disabled, onCreated }: { mode: "live" | "demo" | null; disabled: boolean; onCreated: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const request = useRef<{ body: string; key: string } | null>(null);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !mode) return;
    const fields = new FormData(event.currentTarget);
    const get = (name: string) => String(fields.get(name) || "").trim();
    const hospitals = [1,2].filter((i) => get(`phone${i}`)).map((i) => ({ name:get(`hospital${i}`), phone:get(`phone${i}`), eta_minutes:Number(get(`eta${i}`)) }));
    const body = JSON.stringify({ patient:{ name:get("name"), age:Number(get("age")), condition:get("condition"), location:get("location") }, hospitals });
    if (request.current?.body !== body) request.current = { body, key:crypto.randomUUID() };
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/dispatches", { method:"POST", headers:{ "Content-Type":"application/json", "Idempotency-Key":request.current.key }, body, signal:AbortSignal.timeout(25000) });
      const data = await response.json();
      if (!response.ok) throw new Error(typeof data.detail === "string" ? data.detail : "환자 정보, 전화번호와 도착 시간을 확인해 주세요.");
      onCreated(data.id); setOpen(false); request.current = null;
    } catch (cause) {
      setError(cause instanceof Error ? `${cause.message} 발신은 자동 재시도하지 않습니다. 아래 통화 목록에서 접수 여부를 먼저 확인해 주세요.` : "요청 상태를 확인해 주세요.");
    } finally { setBusy(false); }
  }
  return <Dialog open={open} onOpenChange={(value) => { if (!busy) setOpen(value); }}>
    <DialogTrigger asChild><Button disabled={disabled || !mode}>새 수용 요청</Button></DialogTrigger>
    <DialogContent className="dispatch-dialog">
      <DialogTitle>환자 수용 확인 요청</DialogTitle>
      <DialogDescription>{mode === "live" ? "시작하면 입력한 번호로 실제 전화가 걸립니다. 최대 두 곳과 동시에 통화합니다." : "모의 모드입니다. 실제 전화 없이 대화와 결과 표시를 확인합니다."}</DialogDescription>
      <form onSubmit={submit} className="dispatch-form">
        <fieldset disabled={busy}>
          <div className="dispatch-form-grid">
            <Label htmlFor="dispatch-name">환자 이름<Input id="dispatch-name" name="name" required maxLength={80} /></Label>
            <Label htmlFor="dispatch-age">나이<Input id="dispatch-age" name="age" type="number" required min={0} max={120} /></Label>
          </div>
          <Label htmlFor="dispatch-condition">환자 상태<Textarea id="dispatch-condition" name="condition" required minLength={2} maxLength={2000} /></Label>
          <Label htmlFor="dispatch-location">현재 위치<Input id="dispatch-location" name="location" required minLength={2} maxLength={300} /></Label>
          {[1,2].map((i) => <div className="dispatch-hospital-fields" key={i}>
            <strong>병원 {i}{i === 2 ? " (선택)" : ""}</strong>
            <div className="dispatch-form-grid">
              <Label htmlFor={`hospital${i}`}>병원 이름<Input id={`hospital${i}`} name={`hospital${i}`} defaultValue={`병원 ${i}`} required maxLength={100} /></Label>
              <Label htmlFor={`eta${i}`}>도착 예상 (분)<Input id={`eta${i}`} name={`eta${i}`} type="number" min={1} max={360} defaultValue={15} required /></Label>
            </div>
            <Label htmlFor={`phone${i}`}>전화번호<Input id={`phone${i}`} name={`phone${i}`} type="tel" required={i === 1} placeholder="국가번호 포함 또는 010 / 02 번호" /></Label>
          </div>)}
        </fieldset>
        {error && <p role="alert" className="dispatch-error">{error}</p>}
        <Button type="submit" disabled={busy}>{busy ? "요청 중…" : mode === "live" ? "입력한 병원에 전화 시작" : "모의 통화 시작"}</Button>
      </form>
    </DialogContent>
  </Dialog>;
}
