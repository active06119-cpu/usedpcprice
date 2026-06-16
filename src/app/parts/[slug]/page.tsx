import type { Metadata } from "next";
import Link from "next/link";
import { PartCondition, type Part, type PriceSnapshot } from "@prisma/client";

import PartPriceClient, { type PriceProfileData } from "./client";
import { prisma } from "@/lib/prisma";

type Params = {
  params: Promise<{ slug: string }>;
};

const LOOKBACK_MS = 60 * 86_400_000;
const USED_SOURCES = new Set(["BUNJANG", "DAANGN", "JOONGNA", "MANUAL"]);
const CONDITION_ORDER: PartCondition[] = [
  PartCondition.NEW,
  PartCondition.LIKE_NEW,
  PartCondition.GOOD,
  PartCondition.FAIR,
];

export type PartPriceClientProps = {
  part: Part;
  snapshots: Pick<PriceSnapshot, "priceKrw" | "condition" | "capturedAt" | "sourceType">[];
  mid: number | null;
  low: number | null;
  high: number | null;
  slug: string;
};

function slugToKeyword(slug: string): string {
  return slug.replace(/-/g, " ").trim();
}

function quantile(sorted: number[], q: number): number | null {
  if (sorted.length === 0) return null;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor(sorted.length * q)));
  return sorted[idx];
}

function toPriceProfileData(
  input: PartPriceClientProps,
  newPrice: number | null,
): PriceProfileData {
  const { part, snapshots, mid, low, high, slug } = input;

  const usedSnapshots = snapshots
    .filter((row) => USED_SOURCES.has(row.sourceType))
    .sort((a, b) => a.capturedAt.getTime() - b.capturedAt.getTime());

  const conditions = CONDITION_ORDER.map((condition) => {
    const prices = usedSnapshots
      .filter((row) => row.condition === condition)
      .map((row) => row.priceKrw)
      .sort((a, b) => a - b);

    return {
      condition,
      priceKrw: quantile(prices, 0.5),
      sampleSize: prices.length,
    };
  });

  const depreciationPct =
    mid != null && newPrice != null && newPrice > 0
      ? Math.max(0, Math.round((1 - mid / newPrice) * 100))
      : null;

  return {
    ok: true,
    part: {
      id: part.id,
      slug,
      fullName: part.fullName,
      category: part.category,
    },
    summary: {
      usedLow: low,
      usedMid: mid,
      usedHigh: high,
      newPrice,
      depreciationPct,
      sampleSize: snapshots.length,
    },
    trend: usedSnapshots.map((row) => ({
      capturedAt: row.capturedAt.toISOString(),
      priceKrw: row.priceKrw,
    })),
    conditions,
    latestCapturedAt:
      usedSnapshots.length > 0
        ? usedSnapshots[usedSnapshots.length - 1].capturedAt.toISOString()
        : null,
  };
}

function PartLoadErrorFallback({ partName }: { partName: string }) {
  const analyzeHref = `/?q=${encodeURIComponent(partName)}`;

  return (
    <main className="mx-auto max-w-2xl space-y-6 px-4 py-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">{partName}</h1>
        <p className="mt-3 text-sm text-zinc-600">현재 시세 데이터를 불러올 수 없습니다</p>
      </header>
      <Link
        href={analyzeHref}
        className="inline-flex items-center rounded-xl bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-zinc-800"
      >
        분석하기로 돌아가기
      </Link>
    </main>
  );
}

async function loadPartPageData(slug: string): Promise<
  | { kind: "not_found" }
  | { kind: "success"; clientProps: PartPriceClientProps; profile: PriceProfileData }
> {
  const keyword = slugToKeyword(slug);
  const from = new Date(Date.now() - LOOKBACK_MS);

  const part = await prisma.part.findFirst({
    where: {
      isActive: true,
      OR: [
        { modelName: { contains: keyword, mode: "insensitive" } },
        { fullName: { contains: keyword, mode: "insensitive" } },
      ],
    },
  });

  if (!part) {
    return { kind: "not_found" };
  }

  const snapshots = await prisma.priceSnapshot.findMany({
    where: {
      partId: part.id,
      sourceType: { notIn: ["BUYOUT", "SEED"] as any },
      capturedAt: { gte: from },
    },
    orderBy: { capturedAt: "desc" },
    select: {
      priceKrw: true,
      condition: true,
      capturedAt: true,
      sourceType: true,
    },
  });

  const prices = snapshots.map((row) => row.priceKrw).sort((a, b) => a - b);
  const mid = prices.length ? prices[Math.floor(prices.length / 2)] : null;
  const low = prices.length ? prices[Math.floor(prices.length * 0.1)] : null;
  const high = prices.length ? prices[Math.floor(prices.length * 0.9)] : null;

  const newSnapshot = await prisma.priceSnapshot.findFirst({
    where: {
      partId: part.id,
      sourceType: { in: ["NAVER_SHOPPING", "DANAWA"] as any },
      capturedAt: { gte: new Date(Date.now() - 30 * 86_400_000) },
    },
    orderBy: { capturedAt: "desc" },
    select: { priceKrw: true },
  });

  const clientProps: PartPriceClientProps = {
    part,
    snapshots,
    mid,
    low,
    high,
    slug,
  };

  return {
    kind: "success",
    clientProps,
    profile: toPriceProfileData(clientProps, newSnapshot?.priceKrw ?? null),
  };
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const fallbackName = slugToKeyword(slug);

  try {
    const result = await loadPartPageData(slug);

    if (result.kind === "not_found") {
      return { title: `${fallbackName} 중고 시세 | PC시세` };
    }

    const { part, summary } = result.profile;
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
  } catch (error) {
    console.error("[parts/[slug]] generateMetadata error:", { slug, error });
    return { title: `${fallbackName} 중고 시세 | PC시세` };
  }
}

export default async function PartPage({ params }: Params) {
  const { slug } = await params;

  try {
    const result = await loadPartPageData(slug);

    if (result.kind === "not_found") {
      return (
        <div className="mx-auto max-w-xl px-4 py-16 text-center">
          <p className="text-gray-400">부품을 찾을 수 없습니다</p>
          <Link href="/parts" className="mt-4 block text-sm text-teal-600">
            ← 부품 목록으로
          </Link>
        </div>
      );
    }

    const { profile } = result;

    return <PartPriceClient data={profile} />;
  } catch (error) {
    console.error("[parts/[slug]] page render error:", { slug, error });
    return <PartLoadErrorFallback partName={slugToKeyword(slug)} />;
  }
}
