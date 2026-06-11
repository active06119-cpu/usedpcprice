import Link from "next/link";

import { prisma } from "@/lib/prisma";

const CONDITION_KO: Record<string, string> = {
  NEW: "새상품",
  LIKE_NEW: "개봉만",
  GOOD: "사용감적음",
  FAIR: "사용감있음",
  POOR: "불량",
};

function formatRelativeTime(date: Date) {
  const diffMs = Date.now() - date.getTime();
  const minutes = Math.floor(diffMs / (60 * 1000));
  if (minutes < 1) return "방금 전";
  if (minutes < 60) return `${minutes}분 전`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}시간 전`;
  const days = Math.floor(hours / 24);
  return `${days}일 전`;
}

const krw = (n: number) => `₩${n.toLocaleString("ko-KR")}`;

type MarketPageProps = {
  searchParams?: Promise<{
    q?: string;
    condition?: string;
    verified?: string;
    sort?: string;
  }>;
};

export default async function MarketPage({ searchParams }: MarketPageProps) {
  const sp = (await searchParams) ?? {};
  const q = (sp.q ?? "").trim();
  const condition = (sp.condition ?? "all").trim();
  const verified = (sp.verified ?? "all").trim();
  const sort = (sp.sort ?? "latest").trim();

  const where = {
    isActive: true,
    title: q ? { contains: q, mode: "insensitive" as const } : undefined,
    condition: condition !== "all" ? (condition as any) : undefined,
    isFairVerified:
      verified === "yes" ? true : verified === "no" ? false : undefined,
  };

  const orderBy =
    sort === "priceAsc"
      ? { priceKrw: "asc" as const }
      : sort === "priceDesc"
        ? { priceKrw: "desc" as const }
        : { createdAt: "desc" as const };

  const listings = await prisma.marketListing
    .findMany({
      where,
      orderBy,
      take: 90,
      select: {
        id: true,
        title: true,
        priceKrw: true,
        condition: true,
        location: true,
        isFairVerified: true,
        createdAt: true,
      },
    })
    .catch(() => []);

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-900">중고 PC 마켓</h1>
          <p className="mt-1 text-sm text-zinc-600">등록된 매물을 확인하고 적정가 인증 여부를 비교해보세요.</p>
        </div>
        <Link
          href="/market/new"
          className="rounded-xl bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800"
        >
          매물 올리기
        </Link>
      </div>

      <form className="mb-5 grid gap-2 rounded-2xl border border-zinc-200 bg-white p-3 sm:grid-cols-[1fr_auto_auto_auto_auto]">
        <input
          name="q"
          defaultValue={q}
          placeholder="제목 검색"
          className="rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-zinc-500"
        />
        <select name="condition" defaultValue={condition} className="rounded-lg border border-zinc-300 px-3 py-2 text-sm">
          <option value="all">전체 상태</option>
          <option value="NEW">새상품</option>
          <option value="LIKE_NEW">개봉만</option>
          <option value="GOOD">사용감적음</option>
          <option value="FAIR">사용감있음</option>
          <option value="POOR">불량</option>
        </select>
        <select name="verified" defaultValue={verified} className="rounded-lg border border-zinc-300 px-3 py-2 text-sm">
          <option value="all">인증 전체</option>
          <option value="yes">인증만</option>
          <option value="no">미인증만</option>
        </select>
        <select name="sort" defaultValue={sort} className="rounded-lg border border-zinc-300 px-3 py-2 text-sm">
          <option value="latest">최신순</option>
          <option value="priceAsc">가격 낮은순</option>
          <option value="priceDesc">가격 높은순</option>
        </select>
        <button type="submit" className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white">
          적용
        </button>
      </form>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {listings.map((item) => (
          <article key={item.id} className="rounded-2xl border border-zinc-200 bg-white p-4">
            <div className="flex items-start justify-between gap-3">
              <h2 className="line-clamp-2 text-sm font-semibold text-zinc-900">{item.title}</h2>
              {item.isFairVerified ? (
                <span className="shrink-0 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700">
                  ✓ 적정가 인증
                </span>
              ) : null}
            </div>
            <p className="mt-3 text-lg font-semibold text-zinc-900">{krw(item.priceKrw)}</p>
            <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-600">
              <span>상태: {CONDITION_KO[item.condition] ?? item.condition}</span>
              <span>지역: {item.location ?? "미입력"}</span>
              <span>{formatRelativeTime(item.createdAt)}</span>
            </div>
          </article>
        ))}
      </section>
    </main>
  );
}
