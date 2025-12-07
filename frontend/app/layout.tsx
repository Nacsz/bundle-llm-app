// frontend/app/layout.tsx
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Bundle LLM Memory",
  description: "Bundle 기반 LLM 장기 기억 메모 시스템",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko">
      {/* 시스템 폰트만 사용 (Geist 제거) */}
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}
