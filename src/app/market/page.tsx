import Link from "next/link";

import { isSchemaDriftError, normalizeMarketListing } from "@/lib/market-listing-meta";
import { sourceLabel } from "@/lib/market-source";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const CONDITION_KO: Record<string, string> = {
  NEW: "새상품",
  LIKE_NEW: "개봉만",
  GOOD: "사용감 적음",
  FAIR: "사용감 있음",
  POOR: "불량",
};

const VERDICT_KO: Record<string, string> = {
  CHEAP: "저렴",
  FAIR: "적정",
  OVERPRICED: "약간 비쌈",
  WAY_OVERPRICED: "많이 비쌈",
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

const krw = (n: number) => `${n.toLocaleString("ko-KR")}원`;

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
    <main className="mx-auto max-w-3xl py-8">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">장터</h1>
          <p className="mt-1 text-sm text-zinc-600">시세가 붙은 원문 매물입니다. 거래는 당근·번개에서 하세요.</p>
        </div>
        <Link
          href="/market/new"
          className="rounded-full bg-zinc-900 px-4 py-2 text-sm font-medium text-white"
        >
          원문 올리기
        </Link>
      </div>

      <form className="mb-5 flex gap-2">
        <input
          name="q"
          defaultValue={q}
          placeholder="4070, 라이젠, 980..."
          className="flex-1 rounded-full border border-zinc-300 bg-white px-4 py-2.5 text-sm outline-none focus:border-emerald-500"
        />
        <button type="submit" className="rounded-full border border-zinc-300 bg-white px-4 py-2.5 text-sm text-zinc-700">
          검색
        </button>
      </form>

      {listings.length === 0 ? (
        <div className="rounded-2xl border border-zinc-200 bg-white px-6 py-14 text-center">
          <p className="text-sm font-medium text-zinc-800">아직 올라온 글이 없습니다</p>
          <p className="mt-1 text-sm text-zinc-500">당근이나 번개 링크를 올리면 시세와 함께 여기에 보입니다.</p>
          <Link href="/market/new" className="mt-4 inline-flex rounded-full bg-zinc-900 px-4 py-2 text-sm text-white">
            첫 매물 올리기
          </Link>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {listings.map((item) => {
            const body = (
              <>
                <div className="flex items-start justify-between gap-2">
                  <h2 className="line-clamp-2 text-sm font-semibold text-zinc-900">{item.title}</h2>
                  {item.isFairVerified ? (
                    <span className="shrink-0 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
                      적정
                    </span>
                  ) : item.verdict && VERDICT_KO[item.verdict] ? (
                    <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-medium ${VERDICT_STYLE[item.verdict] ?? ""}`}>
                      {VERDICT_KO[item.verdict]}
                    </span>
                  ) : null}
                </div>
                <p className="mt-2 text-lg font-semibold text-zinc-900">{krw(item.priceKrw)}</p>
                {item.fairPriceMid ? (
                  <p className="text-xs text-zinc-500">시세 {krw(item.fairPriceMid)}</p>
                ) : null}
                <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-xs text-zinc-500">
                  <span>{sourceLabel(item.sourceUrl)}</span>
                  <span>{item.location ?? "지역 미상"}</span>
                  <span>{relTime(item.createdAt)}</span>
                </div>
              </>
            );

            return item.sourceUrl ? (
              <a
                key={item.id}
                href={item.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-2xl border border-zinc-200 bg-white p-4 transition hover:border-zinc-300 hover:shadow-sm"
              >
                {body}
              </a>
            ) : (
              <article key={item.id} className="rounded-2xl border border-zinc-200 bg-white p-4">
                {body}
              </article>
            );
          })}
        </div>
      )}
    </main>
  );
}
