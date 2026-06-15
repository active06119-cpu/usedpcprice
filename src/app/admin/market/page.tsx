"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

const VERDICT_KO: Record<string, string> = {
  CHEAP: "저렴해요",
  FAIR: "적정가",
  OVERPRICED: "약간비쌈",
  WAY_OVERPRICED: "많이 비쌈",
  NO_PRICE: "가격 정보 없음",
};

const CONDITION_KO: Record<string, string> = {
  NEW: "새상품",
  LIKE_NEW: "개봉만",
  GOOD: "사용감적음",
  FAIR: "사용감있음",
  POOR: "불량",
};

type MarketListingRow = {
  id: string;
  title: string;
  description: string;
  priceKrw: number;
  condition: string;
  location: string | null;
  contact: string;
  sourceUrl: string | null;
  verdict: string | null;
  isActive: boolean;
  isFairVerified: boolean;
  fairPriceMid: number | null;
  viewCount: number;
  createdAt: string;
  updatedAt: string;
};

type MarketStats = {
  total: number;
  activeCount: number;
  verifiedCount: number;
};

const krw = (n: number | null | undefined) =>
  typeof n === "number" && Number.isFinite(n) ? `₩${n.toLocaleString("ko-KR")}` : "—";

function formatDate(iso: string) {
  return new Date(iso).toLocaleString("ko-KR", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function sourceHostLabel(url: string | null): string {
  if (!url) return "링크 없음";
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "링크";
  }
}

export default function AdminMarketPage() {
  const adminToken = process.env.NEXT_PUBLIC_ADMIN_API_TOKEN ?? "";
  const [items, setItems] = useState<MarketListingRow[]>([]);
  const [stats, setStats] = useState<MarketStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");
  const [verifiedFilter, setVerifiedFilter] = useState<"all" | "yes" | "no">("all");
  const [query, setQuery] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const fetchListings = useCallback(async () => {
    setLoading(true);
    setMessage("");
    try {
      const params = new URLSearchParams({
        status: statusFilter,
        verified: verifiedFilter,
      });
      if (query.trim()) params.set("q", query.trim());

      const res = await fetch(`/api/admin/market-listings?${params.toString()}`, {
        headers: { "x-admin-token": adminToken },
      });
      const data = (await res.json()) as {
        ok?: boolean;
        message?: string;
        items?: MarketListingRow[];
        stats?: MarketStats;
      };

      if (!res.ok || !data.ok || !data.items) {
        throw new Error(data.message ?? "목록을 불러오지 못했습니다.");
      }

      setItems(data.items);
      setStats(data.stats ?? null);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "목록 조회 실패");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [adminToken, query, statusFilter, verifiedFilter]);

  useEffect(() => {
    fetchListings();
  }, [fetchListings]);

  async function patchListing(
    id: string,
    patch: { isActive?: boolean; isFairVerified?: boolean },
  ) {
    setUpdatingId(id);
    setMessage("");
    try {
      const res = await fetch("/api/admin/market-listings", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "x-admin-token": adminToken,
        },
        body: JSON.stringify({ id, ...patch }),
      });
      const data = (await res.json()) as { ok?: boolean; message?: string };
      if (!res.ok || !data.ok) {
        throw new Error(data.message ?? "수정 실패");
      }
      await fetchListings();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "수정 중 오류");
    } finally {
      setUpdatingId(null);
    }
  }

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-zinc-900">마켓 관리</h2>
          <p className="mt-1 text-sm text-zinc-600">
            `/market`에 등록된 매물을 검수·노출 관리합니다.
          </p>
        </div>
        <Link
          href="/market/new"
          className="rounded-xl bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800"
        >
          + 매물 등록 페이지
        </Link>
      </div>

      {stats ? (
        <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-zinc-200 bg-white p-4">
            <p className="text-xs text-zinc-500">전체 매물</p>
            <p className="mt-1 text-2xl font-semibold text-zinc-900">{stats.total}</p>
          </div>
          <div className="rounded-xl border border-zinc-200 bg-white p-4">
            <p className="text-xs text-zinc-500">노출 중</p>
            <p className="mt-1 text-2xl font-semibold text-emerald-700">{stats.activeCount}</p>
          </div>
          <div className="rounded-xl border border-zinc-200 bg-white p-4">
            <p className="text-xs text-zinc-500">적정가 인증</p>
            <p className="mt-1 text-2xl font-semibold text-emerald-700">{stats.verifiedCount}</p>
          </div>
        </div>
      ) : null}

      <div className="mb-4 flex flex-wrap gap-2 rounded-xl border border-zinc-200 bg-white p-3">
        <input
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder="제목·본문·연락처 검색"
          className="min-w-[200px] flex-1 rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-zinc-500"
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
          className="rounded-lg border border-zinc-300 px-3 py-2 text-sm"
        >
          <option value="all">전체 상태</option>
          <option value="active">노출 중</option>
          <option value="inactive">숨김</option>
        </select>
        <select
          value={verifiedFilter}
          onChange={(e) => setVerifiedFilter(e.target.value as typeof verifiedFilter)}
          className="rounded-lg border border-zinc-300 px-3 py-2 text-sm"
        >
          <option value="all">인증 전체</option>
          <option value="yes">인증만</option>
          <option value="no">미인증</option>
        </select>
        <button
          type="button"
          onClick={() => setQuery(searchInput)}
          className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white"
        >
          검색
        </button>
        <button
          type="button"
          onClick={() => fetchListings()}
          className="rounded-lg border border-zinc-300 px-4 py-2 text-sm text-zinc-700"
        >
          새로고침
        </button>
      </div>

      {message ? (
        <p className="mb-4 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-700">
          {message}
        </p>
      ) : null}

      {loading ? (
        <p className="text-sm text-zinc-500">불러오는 중...</p>
      ) : items.length === 0 ? (
        <p className="rounded-xl border border-zinc-200 bg-white px-4 py-8 text-center text-sm text-zinc-500">
          등록된 마켓 매물이 없습니다.
        </p>
      ) : (
        <div className="space-y-3">
          {items.map((item) => (
            <article
              key={item.id}
              className={`rounded-xl border bg-white p-4 ${
                item.isActive ? "border-zinc-200" : "border-zinc-100 opacity-60"
              }`}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-semibold text-zinc-900">{item.title}</h3>
                    {!item.isActive ? (
                      <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] text-zinc-600">
                        숨김
                      </span>
                    ) : null}
                    {item.isFairVerified ? (
                      <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
                        ✓ 적정가 인증
                      </span>
                    ) : null}
                    {item.verdict ? (
                      <span className="rounded-full border border-zinc-200 bg-zinc-50 px-2 py-0.5 text-[11px] text-zinc-700">
                        {VERDICT_KO[item.verdict] ?? item.verdict}
                      </span>
                    ) : null}
                  </div>

                  <p className="mt-2 line-clamp-2 text-sm text-zinc-600">{item.description}</p>

                  <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-500">
                    <span>판매가 {krw(item.priceKrw)}</span>
                    <span>적정가 {krw(item.fairPriceMid)}</span>
                    <span>상태 {CONDITION_KO[item.condition] ?? item.condition}</span>
                    <span>지역 {item.location ?? "—"}</span>
                    <span>조회 {item.viewCount}</span>
                    <span>{formatDate(item.createdAt)}</span>
                  </div>

                  <div className="mt-2 flex flex-wrap gap-3 text-xs">
                    {item.sourceUrl ? (
                      <a
                        href={item.sourceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-medium text-emerald-700 hover:underline"
                      >
                        {sourceHostLabel(item.sourceUrl)} →
                      </a>
                    ) : null}
                    <span className="text-zinc-500">연락: {item.contact}</span>
                  </div>
                </div>

                <div className="flex shrink-0 flex-col gap-2">
                  <button
                    type="button"
                    disabled={updatingId === item.id}
                    onClick={() => patchListing(item.id, { isActive: !item.isActive })}
                    className="rounded-lg border border-zinc-300 px-3 py-1.5 text-xs text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
                  >
                    {item.isActive ? "숨기기" : "다시 노출"}
                  </button>
                  <button
                    type="button"
                    disabled={updatingId === item.id}
                    onClick={() =>
                      patchListing(item.id, { isFairVerified: !item.isFairVerified })
                    }
                    className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs text-emerald-800 hover:bg-emerald-100 disabled:opacity-50"
                  >
                    {item.isFairVerified ? "인증 해제" : "인증 부여"}
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </main>
  );
}
