"use client";

import { useState } from "react";

import { Sparkline } from "@/components/charts/Sparkline";
import { JobProgress } from "@/components/common/JobProgress";
import { useJobProgress } from "@/hooks/useJobProgress";
import { digitsOnly, formatKrw } from "@/lib/format";

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

type History = { ok: boolean; points?: Array<{ day: string; mid: number; count: number }> };

export default function PartPricePage() {
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [history, setHistory] = useState<History | null>(null);
  const [reportPrice, setReportPrice] = useState("");
  const [reportNote, setReportNote] = useState<string | null>(null);
  const { pct, label } = useJobProgress(loading);

  async function search() {
    if (!name.trim()) return;
    setLoading(true);
    setMessage(null);
    setResult(null);
    setHistory(null);
    setReportNote(null);
    try {
      const [priceRes, histRes] = await Promise.all([
        fetch("/api/valuation/part", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: name.trim() }),
        }),
        fetch(`/api/parts/history?name=${encodeURIComponent(name.trim())}`),
      ]);
      const data = (await priceRes.json()) as Result;
      const hist = (await histRes.json()) as History;
      if (!priceRes.ok || !data.ok) {
        setMessage(data.message ?? "조회 실패");
        return;
      }
      setResult(data);
      setHistory(hist);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  }

  async function report(reason: "too_high" | "too_low") {
    const partName = result?.name ?? name.trim();
    const price = Number(digitsOnly(reportPrice)) || result?.usedMid;
    if (!partName || !price) return;
    setReportNote(null);
    const res = await fetch("/api/report-price", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ partName, reportedPrice: price, reason }),
    });
    const data = (await res.json()) as { ok: boolean; message?: string };
    setReportNote(data.ok ? "신고를 받았습니다." : data.message ?? "신고에 실패했습니다.");
  }

  return (
    <main className="mx-auto w-full max-w-2xl py-6 sm:py-10">
      <p className="text-[12px] font-medium text-[#c2410c]">단품</p>
      <h1 className="mt-1 text-xl font-bold tracking-tight text-stone-900 sm:text-2xl">부품 시세</h1>
      <p className="mt-1 text-sm text-stone-600">부품 이름을 넣으면 중고 시세와 추이를 봅니다.</p>

      <div className="mt-5 flex flex-col gap-2 rounded-xl border border-stone-200 bg-white p-3 shadow-[0_8px_24px_rgba(28,25,23,0.05)] sm:mt-6 sm:flex-row sm:items-center">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !loading && search()}
          placeholder="예: RTX 4070, i5-13600K"
          disabled={loading}
          className="w-full rounded-lg border border-stone-300 bg-stone-50 px-3 py-2.5 text-base outline-none focus:border-[#1e3a5f] focus:bg-white sm:flex-1 sm:text-sm"
        />
        <button type="button" onClick={search} disabled={loading || !name.trim()} className="w-full rounded-lg bg-[#1e3a5f] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#16304f] disabled:opacity-50 sm:w-auto">
          {loading ? "조회 중" : "시세 조회"}
        </button>
      </div>

      {loading ? <div className="mt-4"><JobProgress pct={pct} label={label || "시세 찾는 중"} /></div> : null}
      {message ? <p className="mt-4 rounded-xl border border-stone-200 bg-white px-4 py-3 text-sm text-stone-700">{message}</p> : null}

      {result?.ok && result.found ? (
        <div className="mt-5 space-y-4">
          <div className="rounded-xl border border-stone-200 bg-white p-5 shadow-[0_8px_24px_rgba(28,25,23,0.05)]">
            <div className="text-sm text-stone-500">{result.name} <span className="text-stone-400">({result.category})</span></div>
            <div className="mt-2 text-2xl font-bold text-[#1e3a5f] sm:text-3xl">{formatKrw(result.usedMid)}</div>
            <div className="mt-1 text-sm text-stone-500">{formatKrw(result.usedLow)} ~ {formatKrw(result.usedHigh)}</div>
            <div className="mt-3 inline-flex rounded-md bg-stone-100 px-3 py-1 text-xs text-stone-500">{result.basis}</div>
            <div className="mt-5 border-t border-stone-100 pt-4">
              <p className="text-xs font-medium text-stone-500">90일 실매물 중앙가</p>
              <Sparkline points={history?.points ?? []} />
            </div>
          </div>

          <div className="rounded-xl border border-stone-200 bg-white p-5">
            <p className="text-sm font-medium text-stone-800">이 시세가 이상하면</p>
            <p className="mt-1 text-xs text-stone-500">보이는 가격을 적고, 높은지 낮은지 골라주세요.</p>
            <input
              value={reportPrice}
              onChange={(e) => setReportPrice(e.target.value)}
              inputMode="numeric"
              placeholder={`참고 ${formatKrw(result.usedMid)}`}
              className="mt-3 w-full rounded-lg border border-stone-300 bg-stone-50 px-3 py-2.5 text-sm"
            />
            <div className="mt-2 grid grid-cols-2 gap-2">
              <button type="button" onClick={() => report("too_high")} className="rounded-lg border border-stone-200 py-2 text-sm text-stone-700 hover:bg-stone-50">너무 비싼</button>
              <button type="button" onClick={() => report("too_low")} className="rounded-lg border border-stone-200 py-2 text-sm text-stone-700 hover:bg-stone-50">너무 싸</button>
            </div>
            {reportNote ? <p className="mt-2 text-xs text-stone-500">{reportNote}</p> : null}
          </div>
        </div>
      ) : result?.ok && result.found === false ? (
        <p className="mt-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          "{result.query}" 시세 정보가 아직 없습니다.
        </p>
      ) : null}

      <p className="mt-6 text-center text-xs text-stone-400">추정 시세이며 실제 거래가와 다를 수 있습니다.</p>
    </main>
  );
}
