import Link from "next/link";

import { isSchemaDriftError, normalizeMarketListing } from "@/lib/market-listing-meta";
import { prisma } from "@/lib/prisma";

// 요청 시점에 렌더 (빌드 때 DB 안 찌르고, 항상 최신 매물 표시)
export const dynamic = "force-dynamic";

const CONDITION_KO: Record<string, string> = {
  NEW: "새상품",
  LIKE_NEW: "개봉만",
  GOOD: "사용감적음",
  FAIR: "사용감있음",
  POOR: "불량",
};

const VERDICT_KO: Record<string, string> = {
  CHEAP: "저렴해요",
  FAIR: "적정가",
  OVERPRICED: "약간비쌈",
  WAY_OVERPRICED: "많이비쌈",
};

const VERDICT_STYLE: Record<string, string> = {
  CHEAP: "border-blue-200 bg-blue-50 text-blue-700",
  FAIR: "border-emerald-200 bg-emerald-50 text-emerald-700",
  OVERPRICED: "border-amber-200 bg-amber-50 text-amber-700",
  WAY_OVERPRICED: "border-red-200 bg-red-50 text-red-700",
};

function relTime(date: Date) {
  const m = Math.floor((Date.now() - date.getTime()) / 60000);
  if (m < 1) return "방금 전";
  if (m < 60) return `${m}분 전`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}시간 전`;
  return `${Math.floor(h / 24)}일 전`;
}

const krw = (n: number) => `₩${n.toLocaleString("ko-KR")}`;

type Props = { searchParams?: Promise<{ q?: string }> };

export default async function MarketPage({ searchParams }: Props) {
  const q = ((await searchParams)?.q ?? "").trim();
  const where = {
    isActive: true,
    title: q ? { contains: q, mode: "insensitive" as const } : undefined,
  };

  let rows: Array<any> = [];
  try {
    rows = await prisma.marketListing.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 60,
      select: {
        id: true, title: true, priceKrw: true, condition: true, location: true,
        sourceUrl: true, verdict: true, fairPriceMid: true, isFairVerified: true, createdAt: true,
      },
    });
  } catch (error) {
    if (isSchemaDriftError(error)) {
      rows = await prisma.marketListing.findMany({
        where, orderBy: { createdAt: "desc" }, take: 60,
        select: { id: true, title: true, priceKrw: true, condition: true, location: true, fairPriceMid: true, isFairVerified: true, createdAt: true },
      });
    }
  }
  const listings = rows.map((r) => normalizeMarketListing(r));

  return (
    <main className="mx-auto min-h-screen max-w-3xl px-4 py-10">
      <div className="mb-6 text-center">
        <h1 className="text-3xl font-bold tracking-tight text-zinc-900">장터</h1>
        <p className="mt-2 text-zinc-600">적정가로 검증된 중고 매물. 호구 걱정 없이 둘러보세요.</p>
      </div>

      <form className="mb-6 flex items-center gap-2">
        <input
          name="q"
          defaultValue={q}
          placeholder="부품·모델명 검색 (예: 4070, 라이젠)"
          className="flex-1 rounded-xl border border-zinc-300 px-3 py-2.5 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
        />
        <button type="submit" className="rounded-xl bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white">
          검색
        </button>
      </form>

      {listings.length === 0 ? (
        <p className="rounded-2xl border border-zinc-200 bg-white px-4 py-16 text-center text-sm text-zinc-500">
          아직 등록된 매물이 없어요.
        </p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {listings.map((item) => (
            <article key={item.id} className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
              <div className="flex items-start justify-between gap-2">
                <h2 className="line-clamp-2 text-sm font-semibold text-zinc-900">{item.title}</h2>
                {item.isFairVerified ? (
                  <span className="shrink-0 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
                    ✓ 적정가
                  </span>
                ) : item.verdict && VERDICT_KO[item.verdict] ? (
                  <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-medium ${VERDICT_STYLE[item.verdict] ?? ""}`}>
                    {VERDICT_KO[item.verdict]}
                  </span>
                ) : null}
              </div>

              <p className="mt-2 text-xl font-bold text-zinc-900">{krw(item.priceKrw)}</p>
              {item.fairPriceMid ? (
                <p className="text-xs text-zinc-500">적정가 <span className="font-medium text-emerald-700">{krw(item.fairPriceMid)}</span></p>
              ) : null}

              <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-500">
                <span>{CONDITION_KO[item.condition] ?? item.condition}</span>
                <span>{item.location ?? "지역미상"}</span>
                <span>{relTime(item.createdAt)}</span>
              </div>

              {item.sourceUrl ? (
                <a href={item.sourceUrl} target="_blank" rel="noopener noreferrer" className="mt-2 inline-block text-xs font-medium text-emerald-700 hover:underline">
                  매물 보러가기 →
                </a>
              ) : null}
            </article>
          ))}
        </div>
      )}

      <div className="mt-8 text-center">
        <Link href="/market/new" className="text-sm text-zinc-500 underline hover:text-zinc-800">
          내 매물 올리기
        </Link>
      </div>
    </main>
  );
}
