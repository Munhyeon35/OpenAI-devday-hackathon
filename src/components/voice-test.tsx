"use client";
import { useEffect, useRef, useState } from "react";
export function VoiceTest() {
  const [status, setStatus] = useState("대기 중"),
    [active, setActive] = useState(false),
    [muted, setMuted] = useState(false),
    [error, setError] = useState(""),
    [lines, setLines] = useState<{ role: string; text: string }[]>([]);
  const pc = useRef<RTCPeerConnection | null>(null),
    mic = useRef<MediaStream | null>(null),
    audio = useRef<HTMLAudioElement | null>(null),
    dc = useRef<RTCDataChannel | null>(null),
    run = useRef(0),
    ending = useRef(false),
    done = useRef(false),
    timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  function stop(label = "종료됨") {
    run.current++;
    if (timer.current) clearTimeout(timer.current);
    dc.current?.close();
    pc.current?.close();
    mic.current?.getTracks().forEach((t) => t.stop());
    if (audio.current) {
      audio.current.pause();
      audio.current.srcObject = null;
    }
    setActive(false);
    setMuted(false);
    setStatus(label);
  }
  useEffect(
    () => () => {
      run.current++;
      if (timer.current) clearTimeout(timer.current);
      dc.current?.close();
      pc.current?.close();
      mic.current?.getTracks().forEach((t) => t.stop());
      audio.current?.pause();
    },
    [],
  );
  async function start() {
    const id = ++run.current;
    setActive(true);
    setStatus("연결 중");
    setError("");
    setLines([]);
    ending.current = false;
    done.current = false;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      });
      if (id !== run.current) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      mic.current = stream;
      const peer = new RTCPeerConnection();
      pc.current = peer;
      const speaker = new Audio();
      speaker.autoplay = true;
      audio.current = speaker;
      peer.ontrack = (e) => {
        speaker.srcObject = e.streams[0];
        void speaker
          .play()
          .catch(() => setError("소리 재생 버튼을 눌러 주세요."));
      };
      peer.onconnectionstatechange = () => {
        if (
          id === run.current &&
          ["failed", "disconnected"].includes(peer.connectionState)
        )
          stop("연결 끊김");
      };
      stream.getTracks().forEach((t) => peer.addTrack(t, stream));
      const channel = peer.createDataChannel("oai-events");
      dc.current = channel;
      const send = (e: object) => {
        if (channel.readyState === "open") channel.send(JSON.stringify(e));
      };
      channel.onopen = () => {
        setStatus("대화 중");
        send({
          type: "response.create",
          response: {
            instructions:
              "한국어로 AI 테스트라고 소개하고 목소리가 잘 들리는지 물어보세요.",
          },
        });
        timer.current = setTimeout(() => stop("3분 제한으로 종료됨"), 180000);
      };
      channel.onmessage = (e) => {
        const v = JSON.parse(e.data);
        if (v.type === "conversation.item.input_audio_transcription.completed")
          setLines((l) => [...l, { role: "나", text: v.transcript }]);
        if (v.type === "response.output_audio_transcript.done")
          setLines((l) => [...l, { role: "올뺑이", text: v.transcript }]);
        if (v.type === "error") {
          setError(v.error?.message || "음성 오류");
          stop("오류로 종료됨");
        }
        if (v.type === "response.done" && v.response.status === "completed") {
          if (ending.current) done.current = true;
          else {
            const tool = v.response.output?.find(
              (x: { type: string; name?: string }) =>
                x.type === "function_call" && x.name === "end_call",
            );
            if (tool) {
              ending.current = true;
              setStatus("마무리 중");
              stream.getTracks().forEach((t) => {
                t.enabled = false;
              });
              send({
                type: "conversation.item.create",
                item: {
                  type: "function_call_output",
                  call_id: tool.call_id,
                  output: '{"farewell_pending":true}',
                },
              });
              send({
                type: "session.update",
                session: {
                  type: "realtime",
                  audio: { input: { turn_detection: null } },
                },
              });
              send({
                type: "response.create",
                response: {
                  tool_choice: "none",
                  instructions:
                    "테스트에 참여해 주셔서 감사합니다. 이제 대화를 종료하겠습니다. 좋은 하루 보내세요. 라고만 말하세요.",
                },
              });
            }
          }
        }
        if (
          v.type === "output_audio_buffer.stopped" &&
          ending.current &&
          done.current
        )
          stop("시나리오 완료 · 자동 종료됨");
      };
      const offer = await peer.createOffer();
      await peer.setLocalDescription(offer);
      const r = await fetch("/api/realtime", {
        method: "POST",
        headers: { "Content-Type": "application/sdp" },
        body: offer.sdp,
      });
      if (!r.ok) {
        const d = await r.json();
        throw Error(d.error);
      }
      const sdp = await r.text();
      if (id !== run.current) return;
      await peer.setRemoteDescription({ type: "answer", sdp });
    } catch (e) {
      if (id !== run.current) return;
      setError(e instanceof Error ? e.message : "마이크 권한을 확인하세요.");
      stop("연결 실패");
    }
  }
  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <p className="text-sm text-neutral-500">올뺑이 · 로컬 음성 테스트</p>
      <h1 className="mt-3 text-4xl font-bold">AI와 직접 대화하기</h1>
      <p className="mt-4 text-neutral-600">
        목소리 확인 → 기분 질문 → 숫자 따라 말하기 → 자동 종료
      </p>
      <section className="mt-8 rounded-3xl border bg-white p-6">
        <p role="status">{status}</p>
        <div className="mt-5 flex flex-wrap gap-3">
          <button
            className="rounded-xl bg-black px-5 py-3 text-white disabled:opacity-30"
            disabled={active}
            onClick={() => void start()}
          >
            대화 시작
          </button>
          <button
            className="rounded-xl border px-5 py-3 disabled:opacity-30"
            disabled={!active || status === "마무리 중"}
            onClick={() => {
              mic.current?.getTracks().forEach((t) => {
                t.enabled = muted;
              });
              setMuted(!muted);
            }}
          >
            {muted ? "마이크 켜기" : "마이크 끄기"}
          </button>
          <button
            className="rounded-xl border px-5 py-3 disabled:opacity-30"
            disabled={!active}
            onClick={() => stop()}
          >
            대화 종료
          </button>
          {error.includes("소리 재생") && (
            <button onClick={() => void audio.current?.play()}>
              소리 재생
            </button>
          )}
        </div>
        {error && (
          <p role="alert" className="mt-4 text-red-600">
            {error}
          </p>
        )}
        <p className="mt-5 text-sm text-neutral-500">
          마이크를 허용하고 말해 주세요. “종료해 주세요”라고 말해도 종료됩니다.
          최대 3분이며 OpenAI 사용료가 발생합니다.
        </p>
      </section>
      <h2 className="mt-8 font-semibold">대화 기록</h2>
      <div className="mt-4 space-y-3">
        {!lines.length && (
          <p className="text-neutral-400">대화를 시작하면 여기에 표시됩니다.</p>
        )}
        {lines.map((l, i) => (
          <div key={i} className="rounded-2xl bg-white p-4">
            <p className="text-xs text-neutral-500">{l.role}</p>
            <p className="mt-1">{l.text}</p>
          </div>
        ))}
      </div>
    </main>
  );
}
