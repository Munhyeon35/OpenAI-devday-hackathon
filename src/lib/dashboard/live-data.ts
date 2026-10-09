import type { TranscriptMessage } from "./types.ts";

export type Fragment = { id?: string; speaker: "assistant" | "hospital"; text: string; start_ms: number; end_ms: number };
export type DispatchHospital = {
  id: string; name: string; phone: string; eta_minutes: number; phase: string; call_status: string;
  answered_at?: string; voice_ended_at?: string; transcript: Fragment[];
  result: null | { availability: "accepted" | "rejected" | "unknown"; reason: string; confirmed_at: string; event_id: string };
  delivery: { status: string }; hangup_pending: boolean;
};
export type DispatchJob = {
  id: string; mode: "live" | "demo"; created_at: string; status: string;
  patient: { name: string; age: number; condition: string; location: string };
  hospitals: DispatchHospital[];
};

// Use audio time, not caption arrival order. A pause containing the other
// speaker's voice starts a new bubble, even within the usual 1.2s merge window.
// Contiguous chunks can still extend overlapping bubbles without fragmenting
// both speakers into individual words during a brief overlap.
export function captionMessages(hospital: DispatchHospital): TranscriptMessage[] {
  const messages: (TranscriptMessage & { start: number; end: number })[] = [];
  const latest: Partial<Record<Fragment["speaker"], (typeof messages)[number]>> = {};
  const fragments = hospital.transcript.map((fragment, index) => ({ ...fragment, index }))
    .sort((a, b) => a.start_ms - b.start_ms || a.index - b.index);
  for (const fragment of fragments) {
    const speaker = fragment.speaker;
    let previous = latest[speaker];
    const other = latest[speaker === "assistant" ? "hospital" : "assistant"];
    const gap = previous ? fragment.start_ms - previous.end : Infinity;
    const interrupted = previous && other && gap > 0 && other.end > previous.end;
    if (!previous || gap > 1200 || interrupted) {
      previous = { id: fragment.id || `${hospital.id}:${fragment.index}`, role: speaker === "assistant" ? "ai" : "hospital",
        text: "", time: `+${Math.floor(fragment.start_ms / 60000).toString().padStart(2,"0")}:${Math.floor(fragment.start_ms / 1000 % 60).toString().padStart(2,"0")}`,
        start: fragment.start_ms, end: fragment.end_ms };
      messages.push(previous);
      latest[speaker] = previous;
    }
    previous.text += fragment.text;
    previous.end = Math.max(previous.end, fragment.end_ms);
  }
  return messages;
}
