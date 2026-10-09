"use client";

import { useState } from "react";
import { Clock3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverAnchor, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const hours = Array.from({ length: 24 }, (_, hour) => String(hour).padStart(2, "0"));
const minutes = Array.from({ length: 60 }, (_, minute) => String(minute).padStart(2, "0"));

type PatientTimeFieldProps = {
  id: string;
  label: string;
  value: string;
  onValueChange: (value: string) => void;
};

export function PatientTimeField({ id, label, value, onValueChange }: PatientTimeFieldProps) {
  const [open, setOpen] = useState(false);
  const [hour, setHour] = useState("");
  const [minute, setMinute] = useState("");

  function changeOpen(nextOpen: boolean) {
    if (nextOpen) {
      const time = /^([01]?\d|2[0-3]):([0-5]\d)(?::[0-5]\d)?$/.exec(value.trim());
      setHour(time?.[1].padStart(2, "0") ?? "");
      setMinute(time?.[2] ?? "");
    }
    setOpen(nextOpen);
  }

  return (
    <Popover open={open} onOpenChange={changeOpen} modal>
      <PopoverAnchor asChild>
        <div className="pp-time-input">
          <Input id={id} aria-label={label} aria-describedby={`${id}-format`} className="pp-control pp-time-control" type="text" placeholder="HH:mm" autoComplete="off" value={value} onChange={(event) => onValueChange(event.target.value)} />
          <span id={`${id}-format`} className="sr-only">24시간 형식으로 입력하세요. 예: 14:30</span>
          <PopoverTrigger asChild>
            <Button type="button" variant="ghost" size="icon-sm" className="pp-time-trigger" aria-label={`${label} 시간 선택`}>
              <Clock3 aria-hidden="true" />
            </Button>
          </PopoverTrigger>
        </div>
      </PopoverAnchor>
      <PopoverContent align="start" className="pp-time-popover" aria-label={`${label} 선택`}>
        <p className="pp-time-title">{label} <span>24시간</span></p>
        <div className="pp-time-selectors">
          <div>
            <Label htmlFor={`${id}-hour`}>시</Label>
            <Select value={hour} onValueChange={setHour}>
              <SelectTrigger id={`${id}-hour`} aria-label={`${label} 시`}><SelectValue placeholder="시 선택" /></SelectTrigger>
              <SelectContent position="popper" className="pp-time-options">
                {hours.map((entry) => <SelectItem key={entry} value={entry}>{entry}시</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor={`${id}-minute`}>분</Label>
            <Select value={minute} onValueChange={setMinute}>
              <SelectTrigger id={`${id}-minute`} aria-label={`${label} 분`}><SelectValue placeholder="분 선택" /></SelectTrigger>
              <SelectContent position="popper" className="pp-time-options">
                {minutes.map((entry) => <SelectItem key={entry} value={entry}>{entry}분</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
        <Button type="button" className="pp-time-apply" disabled={!hour || !minute} onClick={() => { onValueChange(`${hour}:${minute}`); setOpen(false); }}>적용</Button>
      </PopoverContent>
    </Popover>
  );
}
