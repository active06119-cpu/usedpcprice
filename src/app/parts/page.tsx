// src/app/parts/page.tsx
// 부품 시세 목록 페이지

import { Metadata } from "next";
import Link from "next/link";

import { prisma } from "@/lib/prisma";
import { toSlug } from "@/lib/slug";

export const metadata: Metadata = {
  title: "부품별 중고 시세 | PC시세",
  description:
    "GPU, CPU, RAM, SSD 등 PC 부품별 중고 시세를 확인하세요. 번개장터·당근·중고나라 실거래가 기준.",
};

const CAT_KO: Record<string, string> = {
  GPU: "그래픽카드",
  CPU: "CPU",
  RAM: "메모리",
  SSD: "SSD",
  HDD: "HDD",
  MOTHERBOARD: "메인보드",
  PSU: "파워",
  CASE: "케이스",
  COOLER: "쿨러",
};

const USED_MARKET_SOURCES = ["BUNJANG", "DAANGN", "JOONGNA", "MANUAL"] as const;
const NEW_MARKET_SOURCES = ["NAVER_SHOPPING", "DANAWA"] as const;
const LOOKBACK_DAYS = 60;

const krw = (n: number) => `₩${n.toLocaleString("ko-KR")}`;

function quantileNearest(sorted: number[], q: number): number | null {
  if (sorted.length === 0) return null;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor(sorted.length * q)));
  return sorted[idx];
}

type PartRow = {
  id: string;
  fullName: string;
  modelName: string;
  category: string;
  releaseYear: number | null;
};

type PartCardData = PartRow & {
  usedMid: number | null;
  depreciationPct: number | null;
  hasData: boolean;
};

function buildPartCards(
  parts: PartRow[],
  snapshots: Array<{ partId: string; priceKrw: number; sourceType: string }>,
): PartCardData[] {
  const usedByPart = new Map<string, number[]>();
  const newByPart = new Map<string, number>();

  for (const snap of snapshots) {
    if ((USED_MARKET_SOURCES as readonly string[]).includes(snap.sourceType)) {
      const rows = usedByPart.get(snap.partId) ?? [];
      rows.push(snap.priceKrw);
      usedByPart.set(snap.partId, rows);
      continue;
    }

    if (
      (NEW_MARKET_SOURCES as readonly string[]).includes(snap.sourceType) &&
      !newByPart.has(snap.partId)
    ) {
      newByPart.set(snap.partId, snap.priceKrw);
    }
  }

  return parts.map((part) => {
    const usedPrices = (usedByPart.get(part.id) ?? []).sort((a, b) => a - b);
    const usedMid = quantileNearest(usedPrices, 0.5);
    const newPrice = newByPart.get(part.id) ?? null;
    const hasData = usedMid !== null && usedMid > 0;
    const depreciationPct =
      hasData && newPrice && newPrice > 0
        ? Math.max(0, Math.round((1 - usedMid / newPrice) * 100))
        : null;

    return {
      ...part,
      usedMid,
      depreciationPct,
      hasData,
    };
  });
}

function sortPartCards(cards: PartCardData[]): PartCardData[] {
  return [...cards].sort((a, b) => {
    if (a.hasData !== b.hasData) return a.hasData ? -1 : 1;
    if ((b.releaseYear ?? 0) !== (a.releaseYear ?? 0)) {
      return (b.releaseYear ?? 0) - (a.releaseYear ?? 0);
    }
    return a.modelName.localeCompare(b.modelName, "ko");
  });
}

export default async function PartsPage() {
  const parts = await prisma.part.findMany({
    where: { isActive: true },
    select: {
      id: true,
      fullName: true,
      modelName: true,
      category: true,
      releaseYear: true,
    },
    orderBy: [{ category: "asc" }, { releaseYear: "desc" }],
  });

  const from = new Date(Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
  const snapshots = await prisma.priceSnapshot.findMany({
    where: {
      partId: { in: parts.map((part) => part.id) },
      capturedAt: { gte: from },
      sourceType: {
        in: [...USED_MARKET_SOURCES, ...NEW_MARKET_SOURCES] as unknown as [],
      },
    },
    select: {
      partId: true,
      priceKrw: true,
      sourceType: true,
      capturedAt: true,
    },
    orderBy: { capturedAt: "desc" },
  });

  const cards = buildPartCards(parts, snapshots);

  const grouped = cards.reduce(
    (acc, part) => {
      if (!acc[part.category]) acc[part.category] = [];
      acc[part.category].push(part);
      return acc;
    },
    {} as Record<string, PartCardData[]>,
  );

  for (const category of Object.keys(grouped)) {
    grouped[category] = sortPartCards(grouped[category]);
  }

  const catOrder = ["GPU", "CPU", "RAM", "SSD", "MOTHERBOARD", "PSU", "HDD", "CASE", "COOLER"];

  return (
    <div className="mx-auto max-w-3xl space-y-8 px-4 py-8">
      <div>
        <h1 className="mb-1 text-2xl font-medium">부품별 중고 시세</h1>
        <p className="text-sm text-gray-400">실거래가 기반 적정가 · 최근 {LOOKBACK_DAYS}일 기준</p>
      </div>

      {catOrder
        .filter((cat) => grouped[cat]?.length)
        .map((cat) => (
          <div key={cat}>
            <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-gray-400">
              {CAT_KO[cat] ?? cat}
            </h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {grouped[cat].map((part) => (
                <Link
                  key={part.id}
                  href={`/parts/${toSlug(part.modelName)}`}
                  className={`block rounded-xl border px-4 py-3 transition ${
                    part.hasData
                      ? "border-zinc-200 bg-white hover:border-emerald-200 hover:bg-emerald-50/40"
                      : "border-zinc-100 bg-zinc-50 opacity-40 hover:opacity-55"
                  }`}
                >
                  <div
                    className={`truncate text-sm font-semibold ${
                      part.hasData ? "text-zinc-900" : "text-zinc-500"
                    }`}
                  >
                    {part.modelName}
                  </div>

                  {part.hasData && part.usedMid ? (
                    <>
                      <div className="mt-2 text-base font-bold text-zinc-900">{krw(part.usedMid)}</div>
                      {part.depreciationPct !== null ? (
                        <div className="mt-1 text-xs text-emerald-700">
                          신품 대비 -{part.depreciationPct}%
                        </div>
                      ) : (
                        <div className="mt-1 text-xs text-zinc-400">신품가 정보 없음</div>
                      )}
                    </>
                  ) : (
                    <div className="mt-2 text-xs text-zinc-400">시세 데이터 없음</div>
                  )}
                </Link>
              ))}
            </div>
          </div>
        ))}
    </div>
  );
}
