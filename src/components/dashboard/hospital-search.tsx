"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { LoaderCircle, Search } from "lucide-react";
import { BEDS, DEPARTMENTS, EQUIPMENT, PROCEDURES, type HospitalSearchResult } from "@/lib/hospitals";
import type { EmergencyCase } from "@/lib/dashboard/types";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import "./hospital-search.css";

function ConditionGroup({ title, name, options }: { title: string; name: string; options: Record<string, string> }) {
  return <details className="candidate-condition-group">
    <summary>{title}</summary>
    <div>{Object.entries(options).map(([code, label]) => <label key={code}>
      <input type="checkbox" name={name} value={code} /><span>{label}</span>
    </label>)}</div>
  </details>;
}

const time = (value: string | null) => value ? new Date(value).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", hour12: false }) : "보고 시각 없음";

export function HospitalSearch({ reception }: { reception: EmergencyCase }) {
  const [result, setResult] = useState<HospitalSearchResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);

  async function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    controller.current?.abort();
    const current = new AbortController();
    controller.current = current;
    setLoading(true); setError(null); setResult(null);
    try {
      const response = await fetch("/api/hospitals/candidates", {
        method: "POST", headers: { "Content-Type": "application/json" }, signal: current.signal,
        body: JSON.stringify({ latitude: Number(form.get("latitude")), longitude: Number(form.get("longitude")), radiusKm: Number(form.get("radiusKm")), limit: 20,
          departments: form.getAll("departments"), procedures: form.getAll("procedures"), equipment: form.getAll("equipment"), beds: form.getAll("beds"), includeUnknown: form.has("includeUnknown") }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "병원 조회에 실패했습니다.");
      if (!current.signal.aborted) setResult(data);
    } catch (error) {
      if (!current.signal.aborted) setError(error instanceof Error ? error.message : "병원 조회에 실패했습니다.");
    } finally { if (!current.signal.aborted) setLoading(false); }
  }

  return <Dialog onOpenChange={(open) => { if (!open) { controller.current?.abort(); setLoading(false); setResult(null); setError(null); } }}>
    <DialogTrigger asChild><Button variant="outline" size="sm"><Search size={15} />병원 후보 조회</Button></DialogTrigger>
    <DialogContent className="candidate-dialog">
      <div className="candidate-heading">
        <DialogTitle>병원 후보 조회</DialogTitle>
        <DialogDescription>접수 {reception.id} · {reception.patient.age}세 {reception.patient.gender} · {reception.patient.symptom}. 필요한 조건을 직접 선택하세요.</DialogDescription>
      </div>
      <div className="candidate-layout">
        <form onSubmit={search} onChange={() => { setResult(null); setError(null); }} className="candidate-form">
          <fieldset disabled={loading}>
            <legend>구급차 위치와 검색 조건</legend>
            <p>현재 접수의 시연 좌표가 입력되어 있습니다. 실제 위치로 수정할 수 있습니다.</p>
            <div className="candidate-coordinates">
              <div><Label htmlFor="candidate-latitude">위도</Label><Input id="candidate-latitude" name="latitude" type="number" required step="any" min={-90} max={90} defaultValue={reception.position[0]} /></div>
              <div><Label htmlFor="candidate-longitude">경도</Label><Input id="candidate-longitude" name="longitude" type="number" required step="any" min={-180} max={180} defaultValue={reception.position[1]} /></div>
            </div>
            <div><Label htmlFor="candidate-radius">검색 반경 (km)</Label><Input id="candidate-radius" name="radiusKm" type="number" required min={1} max={100} defaultValue={20} /></div>
            <ConditionGroup title="필요 진료과 (최대 5개)" name="departments" options={DEPARTMENTS} />
            <ConditionGroup title="필요 시술·치료 (최대 10개)" name="procedures" options={PROCEDURES} />
            <ConditionGroup title="필요 장비" name="equipment" options={EQUIPMENT} />
            <ConditionGroup title="필요 병상 (최대 5개)" name="beds" options={BEDS} />
            <label className="candidate-unknown"><input type="checkbox" name="includeUnknown" defaultChecked />정보가 없어 확인이 필요한 후보 포함</label>
            <Button type="submit" className="candidate-submit" disabled={loading}>{loading ? <LoaderCircle className="animate-spin" size={16} /> : <Search size={16} />}{loading ? "조회 중…" : "조건으로 조회"}</Button>
          </fieldset>
        </form>
        <section className="candidate-results" aria-label="병원 후보 결과" aria-busy={loading}>
          {error && <p role="alert" className="candidate-error">{error}</p>}
          {!result && !error && <div className="candidate-empty" role="status"><Search size={28} /><p>{loading ? "주변 병원과 수용 정보를 조회하고 있습니다." : "좌표와 필요한 조건을 입력하면 병원 후보가 표시됩니다."}</p><small>국립중앙의료원 공공데이터 · 환자 수용 미확정</small></div>}
          {result && <>
            <div className="candidate-result-summary" role="status"><strong>반경 내 {result.totalNearby}곳 · 조건별 후보 {result.totalMatched}곳</strong><span>{result.candidates.length}곳 표시 · 조건 충족 보고 우선, 직선거리 순</span><small>조회 {time(result.retrievedAt)} (한국 시간)</small></div>
            <ul className="candidate-warnings">{result.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul>
            {!result.candidates.length && <p className="candidate-empty">선택한 조건에 해당하는 후보가 없습니다. 검색 반경과 ‘확인 필요 후보 포함’ 설정을 확인하세요.</p>}
            {result.candidates.map((hospital) => <article className="candidate-hospital" key={hospital.id}>
              <div className="candidate-hospital-heading"><h3>{hospital.name}</h3><strong>직선 {hospital.distanceKm.toFixed(1)} km</strong></div>
              <p>{hospital.classification || "응급의료기관"} · {hospital.address}</p>
              <div className="candidate-badges"><span className={hospital.match}>{hospital.match === "reported_match" ? "선택 조건 충족 보고" : "조건 확인 필요"}</span><span>환자 수용 미확정</span></div>
              <p>일반 응급병상 {hospital.beds.hvec ?? "정보 없음"} · 소아 응급병상 {hospital.beds.hv28 ?? "정보 없음"}</p>
              <small className={!hospital.bedDataFresh ? "candidate-stale" : ""}>병상 보고: {time(hospital.bedUpdatedAt)}{!hospital.bedDataFresh && " · 최신 여부 확인 필요"}</small>
              {!!hospital.checks.length && <ul className="candidate-checks">{hospital.checks.map((check) => <li key={check.code}><span>{check.label}</span><strong>{check.status === "reported_available" ? "가능 보고" : "확인 필요"}</strong>{check.detail && <small>{check.detail}</small>}</li>)}</ul>}
              {hospital.procedureNotes.map((note, index) => <p className="candidate-stale" key={index}>수용 부가조건: {note}</p>)}
              <p className="candidate-phone">응급실 {hospital.emergencyPhone || "연락처 정보 없음"}{hospital.phone && ` · 대표 ${hospital.phone}`}</p>
            </article>)}
            <p className="candidate-source">출처: 국립중앙의료원 · 병상 자료 조회 {time(result.sourceRetrievedAt.beds)}<br />시술 자료 조회 {time(result.sourceRetrievedAt.procedures)}</p>
          </>}
        </section>
      </div>
    </DialogContent>
  </Dialog>;
}
