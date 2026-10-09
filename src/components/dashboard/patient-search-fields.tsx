"use client";

import { BEDS, DEPARTMENTS, EQUIPMENT, PROCEDURES, type HospitalSearch } from "@/lib/hospitals";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type ConditionKey = "departments" | "procedures" | "equipment" | "beds";
const groups: { key: ConditionKey; title: string; options: Record<string, string>; max: number }[] = [
  { key: "departments", title: "진료과", options: DEPARTMENTS, max: 5 },
  { key: "procedures", title: "시술·치료", options: PROCEDURES, max: 10 },
  { key: "equipment", title: "장비", options: EQUIPMENT, max: 8 },
  { key: "beds", title: "병상", options: BEDS, max: 5 },
];

export function PatientSearchFields({ id, value, onChange }: { id: string; value: HospitalSearch; onChange: (value: HospitalSearch) => void }) {
  return <fieldset className="pp-form-group pp-search-group">
    <legend>구급차 위치 · 필요한 진료 조건</legend>
    <p className="pp-search-hint">좌표는 현재 접수 위치로 시작합니다. 필요한 조건을 직접 선택하세요.</p>
    <div className="pp-search-coordinates">
      {([
        { key: "latitude", label: "구급차 위도", min: -90, max: 90 },
        { key: "longitude", label: "구급차 경도", min: -180, max: 180 },
        { key: "radiusKm", label: "검색 반경 (km)", min: 1, max: 100 },
      ] as const).map(({ key, label, min, max }) => <div key={key}>
        <Label htmlFor={`${id}-${key}`}>{label}</Label>
        <Input id={`${id}-${key}`} type="number" required step="any" min={min} max={max} value={Number.isNaN(value[key]) ? "" : value[key]} onChange={(event) => onChange({ ...value, [key]: event.target.value === "" ? NaN : Number(event.target.value) })} />
      </div>)}
    </div>
    <div className="pp-search-conditions">{groups.map((group) => <details key={group.key}>
      <summary>{group.title}<span>{value[group.key].length ? `${value[group.key].length}개 선택` : "선택 안 함"}</span></summary>
      <div className="pp-condition-options">{Object.entries(group.options).map(([code, label]) => {
        const selected: string[] = value[group.key];
        return <label key={code}><input type="checkbox" checked={selected.includes(code)} disabled={!selected.includes(code) && selected.length >= group.max} onChange={(event) => onChange({ ...value, [group.key]: event.target.checked ? [...selected, code] : selected.filter((entry) => entry !== code) })} />{label}</label>;
      })}</div>
    </details>)}</div>
    <label className="pp-include-unknown"><input type="checkbox" checked={value.includeUnknown} onChange={(event) => onChange({ ...value, includeUnknown: event.target.checked })} />정보가 없어 확인이 필요한 후보도 포함</label>
    <p className="pp-selected-conditions">{groups.flatMap((group) => (value[group.key] as string[]).map((code) => group.options[code])).join(" · ") || "조건을 선택하지 않으면 거리 기준으로 조회합니다."}</p>
  </fieldset>;
}
