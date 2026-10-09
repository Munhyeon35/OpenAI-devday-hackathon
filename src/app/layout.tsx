import type { Metadata } from "next";
import { Providers } from "@/components/providers";
import "./globals.css";

export const metadata: Metadata = {
  title: "올뺑이 | 응급 AI Caller",
  description: "올뺑이, 응급 AI Caller 서비스",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body className="min-h-screen antialiased"><Providers>{children}</Providers></body>
    </html>
  );
}
