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
    <main className="mx-auto w-full max-w-2xl py-6 sm:py-10">
      <h1 className="text-xl font-bold tracking-tight text-zinc-900 sm:text-2xl">부품 시세</h1>
      <p className="mt-1 text-sm text-zinc-600">부품 이름을 넣으면 중고 시세를 봅니다.</p>

      <div className="mt-5 flex flex-col gap-2 border border-zinc-200 bg-white p-3 sm:mt-6 sm:flex-row sm:items-center sm:p-3">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && search()}
          placeholder="예: RTX 4070, i5-13600K"
          className="w-full border border-zinc-300 px-3 py-2.5 text-base outline-none focus:border-zinc-500 sm:flex-1 sm:text-sm"
        />
        <button
          type="button"
          onClick={search}
          disabled={loading || !name.trim()}
          className="w-full bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white disabled:opacity-50 sm:w-auto"
        >
          {loading ? "조회 중..." : "시세 조회"}
        </button>
      </div>

      {message ? (
        <p className="mt-4 border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-700">{message}</p>
      ) : null}

      {result?.ok && result.found ? (
        <div className="mt-5 border border-zinc-200 bg-white p-5 sm:mt-6">
          <div className="text-sm text-zinc-500">{result.name} <span className="text-zinc-400">({result.category})</span></div>
          <div className="mt-2 text-2xl font-bold text-zinc-900 sm:text-3xl">{krw(result.usedMid)}</div>
          <div className="mt-1 text-sm text-zinc-500">{krw(result.usedLow)} ~ {krw(result.usedHigh)}</div>
          <div className="mt-3 inline-flex bg-zinc-100 px-3 py-1 text-xs text-zinc-500">{result.basis}</div>
        </div>
      ) : result?.ok && result.found === false ? (
        <p className="mt-5 border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 sm:mt-6">
          "{result.query}" 시세 정보가 아직 없습니다.
        </p>
      ) : null}

      <p className="mt-6 text-center text-xs text-zinc-400">추정 시세이며 실제 거래가와 다를 수 있습니다.</p>
    </main>
  );
}
