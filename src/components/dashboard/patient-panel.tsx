"use client";

import { useId, useRef, useState, type FormEvent } from "react";
import { Activity, ChevronDown, ClipboardList, Pencil, UserRound, X } from "lucide-react";
import type { Patient } from "@/lib/dashboard/types";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";

type PatientPanelProps = {
  patient: Patient;
  onSave: (patient: Patient) => void;
};

type PatientField = {
  key: keyof Patient;
  label: string;
  type?: "number" | "textarea" | "select" | "time";
  options?: { value: string; label: string }[];
  min?: number;
  max?: number;
  step?: number;
  required?: boolean;
  wide?: boolean;
};

const optionsFor = (...values: string[]) => values.map((value) => ({ value, label: value }));
const stageLabels: Record<string, string> = { "1": "소생", "2": "긴급", "3": "응급", "4": "준응급", "5": "비응급" };

const fieldGroups: { title: string; fields: PatientField[] }[] = [
  {
    title: "환자 기본정보",
    fields: [
      { key: "age", label: "나이", type: "number", min: 0, max: 120, required: true },
      { key: "gender", label: "성별", type: "select", options: optionsFor("남성", "여성", "미상") },
      { key: "impression", label: "첫인상" },
      { key: "infection", label: "감염 의심", type: "select", options: optionsFor("의심 없음", "의심", "확인 중") },
    ],
  },
  {
    title: "환자 증상",
    fields: [
      { key: "disease", label: "질병 구분", type: "select", options: optionsFor("질병", "외상", "기타", "미상") },
      { key: "category", label: "대분류" },
      { key: "symptom", label: "주증상 (소분류)", required: true, wide: true },
      { key: "associatedSymptoms", label: "동반 증상", wide: true },
      { key: "onset", label: "발생 시각", type: "time" },
      { key: "onsetAccuracy", label: "시각 정확도", type: "select", options: optionsFor("정확", "추정", "미상") },
      { key: "pain", label: "통증 점수 (0–10)", type: "number", min: 0, max: 10 },
      { key: "history", label: "병력", type: "textarea", wide: true },
    ],
  },
  {
    title: "의식·활력징후",
    fields: [
      { key: "consciousness", label: "의식 상태", type: "select", wide: true, options: optionsFor("명료 (Alert)", "언어 반응 (Verbal)", "통증 반응 (Pain)", "무반응 (Unresponsive)") },
      { key: "systolic", label: "수축기 혈압 (mmHg)", type: "number", min: 0, max: 300 },
      { key: "diastolic", label: "이완기 혈압 (mmHg)", type: "number", min: 0, max: 200 },
      { key: "pulse", label: "맥박 (회/분)", type: "number", min: 0, max: 300 },
      { key: "spo2", label: "SpO₂ (%)", type: "number", min: 0, max: 100 },
      { key: "respiratoryRate", label: "호흡수 (회/분)", type: "number", min: 0, max: 100 },
      { key: "temperature", label: "체온 (°C)", type: "number", min: 25, max: 45, step: 0.1 },
      { key: "measuredAt", label: "측정 시각", type: "time" },
    ],
  },
  {
    title: "Pre-KTAS 평가 결과",
    fields: [
      { key: "assessment", label: "고려사항·세부 판단 근거", type: "textarea", wide: true },
      { key: "ktas", label: "현장 분류 단계", type: "select", options: Object.entries(stageLabels).map(([value, label]) => ({ value, label: `${value}단계 · ${label}` })) },
      { key: "evaluator", label: "평가자 / 구급대" },
    ],
  },
];

function valueOrDash(value: string) {
  return value.trim() || "—";
}

export function PatientPanel({ patient, onSave }: PatientPanelProps) {
  const [expanded, setExpanded] = useState(false);
  const [draft, setDraft] = useState(patient);
  const [validationError, setValidationError] = useState("");
  const [editorOpen, setEditorOpen] = useState(false);
  const editButtonRef = useRef<HTMLButtonElement>(null);
  const id = useId();
  const stage = patient.ktas.trim().replace(/단계$/, "");

  function openEditor() {
    setDraft({ ...patient });
    setValidationError("");
    setEditorOpen(true);
  }

  function closeEditor() {
    setEditorOpen(false);
  }

  function savePatient(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const updated = { ...draft };
    for (const group of fieldGroups) {
      for (const field of group.fields) {
        const value = draft[field.key].trim();
        updated[field.key] = value;
        if (field.required && !value) {
          setValidationError(`${field.label} 항목을 입력해 주세요.`);
          return;
        }
        if (field.type === "number" && value) {
          const number = Number(value);
          if (
            !Number.isFinite(number) ||
            (field.min !== undefined && number < field.min) ||
            (field.max !== undefined && number > field.max)
          ) {
            setValidationError(`${field.label} 항목은 ${field.min}부터 ${field.max} 사이로 입력해 주세요.`);
            return;
          }
        }
      }
    }
    onSave(updated);
    closeEditor();
  }

  function renderField(field: PatientField) {
    const value = draft[field.key];
    const options = field.options || [];
    const fieldId = `${id}-field-${field.key}`;
    return (
      <div className={`pp-field${field.wide ? " pp-field-wide" : ""}`} key={field.key}>
        <Label htmlFor={fieldId} className="pp-field-label">{field.label}{field.required && <span className="pp-required"> *</span>}</Label>
        {field.type === "textarea" ? (
          <Textarea id={fieldId} aria-label={field.label} className="pp-control" value={value} rows={2} onChange={(event) => setDraft((current) => ({ ...current, [field.key]: event.target.value }))} />
        ) : field.type === "select" ? (
          <Select value={value || "__unselected"} onValueChange={(nextValue) => setDraft((current) => ({ ...current, [field.key]: nextValue === "__unselected" ? "" : nextValue }))}>
            <SelectTrigger id={fieldId} aria-label={field.label} className="pp-control pp-select-trigger"><SelectValue placeholder="선택해 주세요" /></SelectTrigger>
            <SelectContent className="pp-select-content" position="popper">
              <SelectItem value="__unselected">선택해 주세요</SelectItem>
              {value && !options.some((option) => option.value === value) && <SelectItem value={value}>{value}</SelectItem>}
              {options.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
            </SelectContent>
          </Select>
        ) : (
          <Input id={fieldId} aria-label={field.label} className="pp-control" type={field.type === "time" && value && !/^\d{2}:\d{2}(?::\d{2})?$/.test(value) ? "text" : field.type || "text"} value={value} min={field.min} max={field.max} step={field.type === "number" ? field.step || 1 : undefined} required={field.required} onChange={(event) => setDraft((current) => ({ ...current, [field.key]: event.target.value }))} />
        )}
      </div>
    );
  }

  return (
    <Dialog open={editorOpen} onOpenChange={(open) => { if (open) openEditor(); else closeEditor(); }}>
    <Collapsible open={expanded} onOpenChange={setExpanded} asChild>
    <Card className="patient-panel" role="region" aria-labelledby={`${id}-title`}>
      <header className="pp-header">
        <div className="pp-heading">
          <h2 id={`${id}-title`}>환자 평가</h2>
        </div>
        <div className="pp-header-actions">
          <DialogTrigger asChild><Button ref={editButtonRef} type="button" variant="ghost" className="pp-edit-button" aria-label="환자 정보 수정" title="환자 정보 수정">
            <Pencil size={14} /><span>입력·수정</span>
          </Button></DialogTrigger>
          <Separator orientation="vertical" className="pp-action-divider" />
          <CollapsibleTrigger asChild><Button type="button" variant="ghost" className="pp-icon-button" aria-label={expanded ? "환자 정보 접기" : "환자 정보 펼치기"} aria-controls={`${id}-details`} title={expanded ? "환자 정보 접기" : "환자 정보 펼치기"}>
            <ChevronDown size={18} className={expanded ? "pp-chevron pp-chevron-open" : "pp-chevron"} />
          </Button></CollapsibleTrigger>
        </div>
      </header>

      <div className="pp-summary">
        <div className="pp-assessment-summary">
          <div className="pp-stage-block" aria-label={`Pre-KTAS ${valueOrDash(stage)}단계 ${stageLabels[stage] || ""}`}>
            <span>Pre-KTAS</span><strong>{valueOrDash(stage)}</strong><Badge variant="secondary" className="pp-stage-label">{stageLabels[stage] || "현장 분류"}</Badge>
          </div>
          <div className="pp-patient-summary">
            <h3>{valueOrDash(patient.gender)} {valueOrDash(patient.age)}세 <span>·</span> {valueOrDash(patient.symptom)}</h3>
            <p className="pp-associated">{patient.associatedSymptoms || "동반 증상 미입력"}</p>
            <p className="pp-symptom-meta">발생 {valueOrDash(patient.onset)}<span>·</span>통증 <strong>{valueOrDash(patient.pain)}</strong>/10</p>
          </div>
        </div>
        <dl className="pp-vitals">
          <div><dt>혈압</dt><dd>{valueOrDash(patient.systolic)}<span className="pp-vital-separator">/</span>{valueOrDash(patient.diastolic)}</dd><span>mmHg</span></div>
          <div><dt>맥박</dt><dd>{valueOrDash(patient.pulse)}</dd><span>회/분</span></div>
          <div><dt>SpO₂</dt><dd>{valueOrDash(patient.spo2)}</dd><span>%</span></div>
          <div><dt>호흡수</dt><dd>{valueOrDash(patient.respiratoryRate)}</dd><span>회/분</span></div>
        </dl>
        <div className="pp-measurement">측정 {valueOrDash(patient.measuredAt)}</div>
      </div>

      <CollapsibleContent id={`${id}-details`}>
      <ScrollArea className="pp-details">
        {fieldGroups.map((group) => (
          <section className="pp-detail-group" key={group.title} aria-label={group.title}>
            <h3>{group.title}</h3>
            <dl>
              {group.fields.map((field) => (
                <div key={field.key}><dt>{field.label}</dt><dd>{valueOrDash(patient[field.key])}</dd></div>
              ))}
            </dl>
          </section>
        ))}
      </ScrollArea>
      </CollapsibleContent>
    </Card>
    </Collapsible>

      <DialogContent className="pp-dialog" showCloseButton={false} onCloseAutoFocus={(event) => { event.preventDefault(); editButtonRef.current?.focus(); }}>
        <form className="pp-edit-form" onSubmit={savePatient}>
          <header className="pp-dialog-header">
            <div><DialogTitle>Pre-KTAS 환자 평가</DialogTitle><DialogDescription>환자의 기본정보와 현장 평가 내용을 입력해 주세요.</DialogDescription></div>
            <DialogClose asChild><Button type="button" variant="ghost" className="pp-icon-button" aria-label="환자 정보 수정 닫기"><X size={20} /></Button></DialogClose>
          </header>
          <ScrollArea className="pp-form-body"><div className="pp-form-body-content">
            <p className="pp-form-hint"><span>*</span> 필수 입력 항목</p>
            <div className="pp-form-columns">
              {[fieldGroups.slice(0, 2), fieldGroups.slice(2)].map((groups, column) => (
                <div className="pp-form-column" key={column}>
                  {groups.map((group, groupIndex) => (
                    <fieldset className="pp-form-group" key={group.title}>
                      <legend><span className="pp-group-icon">{column === 0 && groupIndex === 0 ? <UserRound size={16} /> : column === 1 && groupIndex === 0 ? <Activity size={16} /> : <ClipboardList size={16} />}</span>{group.title}</legend>
                      <div className="pp-field-grid">{group.fields.map(renderField)}</div>
                    </fieldset>
                  ))}
                </div>
              ))}
            </div>
            {validationError && <Alert variant="destructive" className="pp-form-error"><AlertDescription>{validationError}</AlertDescription></Alert>}
          </div></ScrollArea>
          <footer className="pp-dialog-actions">
            <p>수정 내용은 현재 접수의 환자 정보에 반영됩니다.</p>
            <DialogClose asChild><Button variant="outline" className="pp-cancel-button" type="button">취소</Button></DialogClose>
            <Button className="pp-save-button" type="submit">평가 저장</Button>
          </footer>
        </form>
      </DialogContent>
    </Dialog>
  );
}
