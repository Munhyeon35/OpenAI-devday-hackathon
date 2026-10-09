import { VoiceTest } from "@/components/voice-test";
export default function Home() {
  return <>
    <nav aria-label="음성 기능 선택" className="mx-auto flex max-w-3xl flex-wrap gap-4 px-6 pt-8 text-sm">
      <span className="font-semibold">브라우저 음성 테스트</span>
      <a className="underline underline-offset-4" href="/dispatch">응급실 수용 확인 ↗</a>
      <a className="underline underline-offset-4" href="/static/voice-flow.html">전화 데이터 흐름 ↗</a>
    </nav>
    <VoiceTest />
  </>;
}
