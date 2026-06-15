"use client";

import Link from "next/link";

export type PriceProfileData = {
  ok: boolean;
  part: {
    id: string;
    slug: string;
    fullName: string;
    category: string;
  };
  summary: {
    usedLow: number | null;
    usedMid: number | null;
    usedHigh: number | null;
    newPrice: number | null;
    depreciationPct: number | null;
    sampleSize: number;
  };
  trend: Array<{ capturedAt: string; priceKrw: number }>;
  conditions: Array<{
    condition: string;
    priceKrw: number | null;
    sampleSize: number;
  }>;
  latestCapturedAt: string | null;
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

const CONDITION_ORDER = ["NEW", "LIKE_NEW", "GOOD", "FAIR"] as const;

const COND_KO: Record<string, string> = {
  NEW: "새 제품",
  LIKE_NEW: "개봉만",
  GOOD: "사용감 적음",
  FAIR: "사용감 있음",
};

const krw = (n: number | null | undefined) =>
  typeof n === "number" && Number.isFinite(n) ? `₩${n.toLocaleString("ko-KR")}` : "—";

function buildWeeklyAverages(trend: PriceProfileData["trend"]) {
  const buckets = new Map<string, number[]>();

  for (const point of trend) {
    const date = new Date(point.capturedAt);
    if (!Number.isFinite(date.getTime()) || !Number.isFinite(point.priceKrw)) continue;

    const weekStart = new Date(date);
    const day = weekStart.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    weekStart.setDate(weekStart.getDate() + diff);
    weekStart.setHours(0, 0, 0, 0);

    const key = weekStart.toISOString().slice(0, 10);
    const rows = buckets.get(key) ?? [];
    rows.push(point.priceKrw);
    buckets.set(key, rows);
  }

  return Array.from(buckets.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([weekStart, prices]) => {
      const avg = Math.round(prices.reduce((sum, price) => sum + price, 0) / prices.length);
      const labelDate = new Date(weekStart);
      const label = `${labelDate.getMonth() + 1}/${labelDate.getDate()}`;
      return { weekStart, label, avgPrice: avg, count: prices.length };
    });
}

type Props = {
  data: PriceProfileData;
};

export default function PartDetailClient({ data }: Props) {
  const { part, summary, trend, conditions } = data;
  const weeklyTrend = buildWeeklyAverages(trend);
  const trendMax = weeklyTrend.length > 0 ? Math.max(...weeklyTrend.map((w) => w.avgPrice)) : 0;
  const trendMin = weeklyTrend.length > 0 ? Math.min(...weeklyTrend.map((w) => w.avgPrice)) : 0;

  const conditionRows = CONDITION_ORDER.map((condition) => {
    const row = conditions.find((item) => item.condition === condition);
    return {
      condition,
      label: COND_KO[condition] ?? condition,
      priceKrw: row?.priceKrw ?? null,
      isDefault: condition === "GOOD",
    };
  });

  const analyzeHref = `/?q=${encodeURIComponent(part.fullName)}`;

  return (
    <main className="mx-auto max-w-2xl space-y-6 px-4 py-8">
      <nav className="flex items-center gap-2 text-sm text-zinc-400">
        <Link href="/parts" className="hover:text-zinc-600">
          부품 시세
        </Link>
        <span aria-hidden>›</span>
        <span>{CAT_KO[part.category] ?? part.category}</span>
      </nav>

      <header>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">{part.fullName}</h1>
          <span className="rounded-full border border-zinc-200 bg-zinc-50 px-2.5 py-0.5 text-xs font-medium text-zinc-600">
            {CAT_KO[part.category] ?? part.category}
          </span>
        </div>
        <p className="mt-2 text-sm text-zinc-500">
          실거래 {summary.sampleSize.toLocaleString("ko-KR")}건 기준 · 최근 60일
        </p>
      </header>

      <section className="grid grid-cols-3 gap-3">
        <div className="rounded-xl bg-zinc-50 p-4 text-center">
          <div className="text-xs text-zinc-500">하한가</div>
          <div className="mt-1 text-lg font-semibold text-zinc-900">{krw(summary.usedLow)}</div>
        </div>
        <div className="rounded-xl border border-green-200 bg-green-50 p-4 text-center">
          <div className="text-xs font-medium text-green-700">적정가</div>
          <div className="mt-1 text-xl font-bold text-green-800">{krw(summary.usedMid)}</div>
        </div>
        <div className="rounded-xl bg-zinc-50 p-4 text-center">
          <div className="text-xs text-zinc-500">상한가</div>
          <div className="mt-1 text-lg font-semibold text-zinc-900">{krw(summary.usedHigh)}</div>
        </div>
      </section>

      {summary.newPrice != null && (
        <section className="rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-700">
          신품가 {krw(summary.newPrice)}
          {summary.depreciationPct != null && (
            <span className="text-zinc-500"> · 중고 대비 -{summary.depreciationPct}%</span>
          )}
        </section>
      )}

      <section className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
        <div className="border-b border-zinc-100 bg-zinc-50 px-4 py-3 text-sm font-medium text-zinc-700">
          상태별 가격
        </div>
        <table className="w-full text-sm">
          <tbody className="divide-y divide-zinc-100">
            {conditionRows.map((row) => (
              <tr
                key={row.condition}
                className={row.isDefault ? "bg-green-50/60" : undefined}
              >
                <td className="px-4 py-3 text-zinc-700">
                  {row.label}
                  {row.isDefault && (
                    <span className="ml-2 text-xs font-medium text-green-700">← 기본값</span>
                  )}
                </td>
                <td className="px-4 py-3 text-right font-semibold text-zinc-900">
                  {krw(row.priceKrw)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="rounded-xl border border-zinc-200 bg-white p-4">
        <h2 className="text-sm font-medium text-zinc-800">최근 60일 시세 추이</h2>
        <p className="mt-0.5 text-xs text-zinc-500">주간 평균 가격</p>

        {weeklyTrend.length === 0 ? (
          <p className="mt-4 text-sm text-zinc-400">표시할 시세 데이터가 없습니다.</p>
        ) : (
          <div className="mt-4">
            <div className="flex h-36 items-end gap-1.5">
              {weeklyTrend.map((week) => {
                const range = trendMax - trendMin;
                const heightPct =
                  range === 0 ? 100 : Math.max(12, ((week.avgPrice - trendMin) / range) * 100);
                return (
                  <div
                    key={week.weekStart}
                    className="group flex min-w-0 flex-1 flex-col items-center gap-1"
                  >
                    <div
                      className="w-full rounded-sm bg-green-500/80 transition-colors group-hover:bg-green-600"
                      style={{ height: `${heightPct}%` }}
                      title={`${week.label}: ${krw(week.avgPrice)} (${week.count}건)`}
                    />
                  </div>
                );
              })}
            </div>
            <div className="mt-2 flex gap-1.5">
              {weeklyTrend.map((week) => (
                <div
                  key={`${week.weekStart}-label`}
                  className="min-w-0 flex-1 truncate text-center text-[10px] text-zinc-400"
                >
                  {week.label}
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      <section className="rounded-xl border border-green-200 bg-green-50 p-5">
        <Link
          href={analyzeHref}
          className="inline-flex items-center text-sm font-semibold text-green-800 hover:text-green-900"
        >
          이 부품 매물 분석하기 →
        </Link>
        <p className="mt-1 text-xs text-green-700">
          번개장터·당근 매물 본문을 붙여넣으면 적정가인지 바로 확인할 수 있습니다.
        </p>
      </section>
    </main>
  );
}
