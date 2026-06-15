import type { Metadata } from "next";
import { notFound } from "next/navigation";

import PartDetailClient, { type PriceProfileData } from "./client";

type Params = {
  params: Promise<{ slug: string }>;
};

function getBaseUrl(): string {
  const fromEnv = process.env.NEXT_PUBLIC_BASE_URL ?? process.env.NEXT_PUBLIC_APP_URL;
  if (fromEnv) return fromEnv.replace(/\/$/, "");
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://localhost:3000";
}

async function loadPriceProfile(slug: string): Promise<PriceProfileData | null> {
  const res = await fetch(
    `${getBaseUrl()}/api/parts/${encodeURIComponent(slug)}/price-profile?days=60`,
    { next: { revalidate: 3600 } },
  );
  if (!res.ok) return null;

  const data = (await res.json()) as { ok?: boolean } & Partial<PriceProfileData>;
  if (!data.ok || !data.part || !data.summary) return null;

  return data as PriceProfileData;
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const data = await loadPriceProfile(slug);

  if (!data) {
    const fallbackName = slug.replace(/-/g, " ");
    return { title: `${fallbackName} 중고 시세 | PC시세` };
  }

  const { part, summary } = data;
  const midKrw = summary.usedMid != null ? `₩${summary.usedMid.toLocaleString("ko-KR")}` : "";
  const depStr =
    summary.depreciationPct != null ? ` · 신품 대비 -${summary.depreciationPct}%` : "";

  return {
    title: `${part.fullName} 중고 시세 | PC시세`,
    description: `${part.fullName} 중고 적정가 ${midKrw}${depStr}`,
    openGraph: {
      title: `${part.fullName} 중고 시세 | PC시세`,
      description: `${part.fullName} 중고 적정가 ${midKrw}${depStr}`,
    },
  };
}

export default async function PartDetailPage({ params }: Params) {
  const { slug } = await params;
  const data = await loadPriceProfile(slug);
  if (!data) notFound();

  return <PartDetailClient data={data} />;
}
