import Link from "next/link";

import { CalculatorPanel } from "@/components/calculator/CalculatorPanel";
import { formatKrw } from "@/lib/format";
import { getHomeStats, getPopularParts, getRecentListings } from "@/lib/home-data";

export const dynamic = "force-dynamic";

function relTime(iso: string) {
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return "방금 전";
  if (m < 60) return `${m}분 전`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}시간 전`;
  return `${Math.floor(h / 24)}일 전`;
}

export default async function Home() {
  const [stats, popular, recent] = await Promise.all([
    getHomeStats(),
    getPopularParts(),
    getRecentListings(8),
  ]);

  return (
    <main className="mx-auto w-full max-w-5xl py-8 sm:py-12">
      <div className="grid items-start gap-8 lg:grid-cols-[0.9fr_1.1fr] lg:gap-10">
        <div>
          <p className="text-sm font-medium tracking-wide text-[#c2410c]">당근 · 번개 매물 기준</p>
          <h1 className="mt-3 text-3xl font-bold leading-tight tracking-tight text-stone-900 sm:text-5xl">
            중고컴퓨터 시세
          </h1>
          <p className="mt-4 max-w-xl text-base leading-7 text-stone-600">
            매물 글을 그대로 붙여넣으면 부품별로 나눠서 시세를 더합니다.
            거래는 원문에서 합니다.
          </p>
          <dl className="mt-6 grid grid-cols-3 gap-2 text-sm">
            <div className="rounded-xl border border-stone-200 bg-white px-3 py-3">
              <dt className="text-xs text-stone-500">전체 시세</dt>
              <dd className="mt-1 text-lg font-semibold tabular-nums text-stone-900">{stats.totalSnapshots.toLocaleString("ko-KR")}</dd>
            </div>
            <div className="rounded-xl border border-stone-200 bg-white px-3 py-3">
              <dt className="text-xs text-stone-500">오늘</dt>
              <dd className="mt-1 text-lg font-semibold tabular-nums text-stone-900">{stats.todaySnapshots.toLocaleString("ko-KR")}</dd>
            </div>
            <div className="rounded-xl border border-stone-200 bg-white px-3 py-3">
              <dt className="text-xs text-stone-500">장터 글</dt>
              <dd className="mt-1 text-lg font-semibold tabular-nums text-stone-900">{stats.marketListings.toLocaleString("ko-KR")}</dd>
            </div>
          </dl>
        </div>
        <CalculatorPanel />
      </div>

      <section className="mt-12">
        <div className="mb-3 flex items-end justify-between gap-3">
          <h2 className="text-lg font-semibold text-stone-900">인기 부품 시세</h2>
          <Link href="/part-price" className="text-sm text-stone-500 hover:text-stone-800">단품 더 보기</Link>
        </div>
        <div className="overflow-hidden rounded-2xl border border-stone-200 bg-white">
          <ul className="divide-y divide-stone-100">
            {popular.map((row) => (
              <li key={row.name} className="flex items-center justify-between gap-4 px-4 py-3 sm:px-5">
                <div>
                  <p className="text-sm font-medium text-stone-900">{row.name}</p>
                  <p className="text-[11px] text-stone-400">
                    {row.sampleSize > 0 ? `실매물 ${row.sampleSize}건` : "고정·참고가"}
                  </p>
                </div>
                <p className="text-sm font-semibold tabular-nums text-[#1e3a5f]">{formatKrw(row.mid)}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="mt-12">
        <div className="mb-3 flex items-end justify-between gap-3">
          <h2 className="text-lg font-semibold text-stone-900">최근 매물</h2>
          <Link href="/market" className="text-sm text-stone-500 hover:text-stone-800">장터 더 보기</Link>
        </div>
        {recent.length === 0 ? (
          <p className="rounded-2xl border border-stone-200 bg-white px-5 py-10 text-center text-sm text-stone-500">
            아직 원문 링크가 있는 매물이 없습니다. 단품을 넣으면 여기에 보입니다.
          </p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {recent.map((item) => {
              const body = (
                <>
                  <p className="line-clamp-2 text-sm font-medium text-stone-900">{item.title}</p>
                  <p className="mt-2 text-base font-semibold text-stone-900">{formatKrw(item.priceKrw)}</p>
                  <p className="mt-1 text-xs text-stone-400">
                    {item.sourceLabel} · {relTime(item.at)}
                  </p>
                </>
              );
              return item.sourceUrl ? (
                <li key={item.id}>
                  <a href={item.sourceUrl} target="_blank" rel="noopener noreferrer" className="block rounded-2xl border border-stone-200 bg-white p-4 hover:border-stone-300">
                    {body}
                  </a>
                </li>
              ) : (
                <li key={item.id} className="rounded-2xl border border-stone-200 bg-white p-4">
                  {body}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </main>
  );
}
