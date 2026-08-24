"use client";

import { useState } from "react";

type Result = {
  ok: boolean;
  found?: boolean;
  name?: string;
  category?: string;
  usedLow?: number;
  usedMid?: number;
  usedHigh?: number;
  basis?: string;
  query?: string;
  message?: string;
};

const krw = (n: number | null | undefined) =>
  typeof n === "number" ? `₩${n.toLocaleString("ko-KR")}` : "—";

export default function PartPricePage() {
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);

  async function search() {
    if (!name.trim()) return;
    setLoading(true);
    setMessage(null);
    setResult(null);
    try {
      const res = await fetch("/api/valuation/part", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
      });
      const data = (await res.json()) as Result;
      if (!res.ok || !data.ok) {
        setMessage(data.message ?? "조회 실패");
        return;
      }
      setResult(data);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto min-h-screen max-w-2xl px-4 py-10">
      <div className="text-center">
        <h1 className="text-3xl font-bold tracking-tight text-zinc-900">부품 시세 계산기</h1>
        <p className="mt-2 text-zinc-600">부품 이름만 넣으면 중고 시세를 알려드려요.</p>
      </div>

      <div className="mt-8 flex items-center gap-2 rounded-2xl border border-zinc-200 bg-white p-3 shadow-sm">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && search()}
          placeholder="예: RTX 4070, i5-13600K, 4060ti"
          className="flex-1 rounded-xl border border-zinc-300 px-3 py-2.5 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
        />
        <button
          type="button"
          onClick={search}
          disabled={loading || !name.trim()}
          className="rounded-xl bg-emerald-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
        >
          {loading ? "조회 중..." : "시세 조회"}
        </button>
      </div>

      {message ? (
        <p className="mt-4 rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-700">{message}</p>
      ) : null}

      {result?.ok && result.found ? (
        <div className="mt-6 rounded-2xl border border-zinc-200 bg-white p-6 text-center shadow-sm">
          <div className="text-sm text-zinc-500">{result.name} <span className="text-zinc-400">({result.category})</span></div>
          <div className="mt-2 text-3xl font-bold text-emerald-700">{krw(result.usedMid)}</div>
          <div className="mt-1 text-sm text-zinc-500">{krw(result.usedLow)} ~ {krw(result.usedHigh)}</div>
          <div className="mt-3 inline-flex rounded-full bg-zinc-100 px-3 py-1 text-xs text-zinc-500">{result.basis}</div>
        </div>
      ) : result?.ok && result.found === false ? (
        <p className="mt-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-center text-sm text-amber-800">
          &quot;{result.query}&quot; 시세 정보가 아직 없어요. 다른 표기로 검색하거나 나중에 다시 시도해보세요.
        </p>
      ) : null}

      <p className="mt-6 text-center text-xs text-zinc-400">추정 시세이며 실제 거래가와 다를 수 있습니다.</p>
    </main>
  );
}
