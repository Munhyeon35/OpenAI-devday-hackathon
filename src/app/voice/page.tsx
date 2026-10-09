import { VoiceTest } from "@/components/voice-test";
import Link from "next/link";

export default function VoicePage() {
  return (
    <>
      <nav aria-label="음성 기능 선택" className="mx-auto flex max-w-3xl flex-wrap gap-4 px-6 pt-8 text-sm">
        <Link className="underline underline-offset-4" href="/">응급 이송 관제</Link>
        <span className="font-semibold">브라우저 음성 테스트</span>
        <Link className="underline underline-offset-4" href="/dispatch">응급실 수용 확인 ↗</Link>
        <Link className="underline underline-offset-4" href="/static/voice-flow.html">전화 데이터 흐름 ↗</Link>
      </nav>
      <VoiceTest />
    </>
  );
}
