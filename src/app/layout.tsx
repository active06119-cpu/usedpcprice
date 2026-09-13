import type { Metadata, Viewport } from "next";
import { PublicShell } from "@/components/layout/PublicShell";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { SiteHeader } from "@/components/layout/SiteHeader";
import "./globals.css";

export const metadata: Metadata = {
  title: "PC시세 - 중고컴퓨터 시세",
  description: "당근·번개 매물 글을 붙여넣어 중고 PC 적정가를 보십니다.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" className="h-full">
      <body className="flex min-h-full flex-col overflow-x-hidden bg-[#f3f4f6] text-zinc-900">
        <SiteHeader />
        <div className="flex-1">
          <PublicShell>{children}</PublicShell>
        </div>
        <SiteFooter />
      </body>
    </html>
  );
}
