import type { Metadata } from "next";
import { Providers } from "@/components/providers";
import "./globals.css";

export const metadata: Metadata = {
  title: "올뺑이 | AI 응급 이송 관제",
  description: "병렬 AI 전화로 병원 수용 여부를 확인하는 올뺑이 응급 이송 관제 대시보드",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body className="min-h-screen antialiased"><Providers>{children}</Providers></body>
    </html>
  );
}
