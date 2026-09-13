"use client";

import { useRef, useState } from "react";

import { JobProgress } from "@/components/common/JobProgress";
import { useJobProgress } from "@/hooks/useJobProgress";
import { digitsOnly, formatKrw } from "@/lib/format";

type Priced = { name: string; category: string; mid: number; basis: string; sampleSize?: number };
type Unpriced = {
  name: string;
  category: string;
  estimateLow?: number | null;
  estimateMid?: number | null;
  estimateHigh?: number | null;
};
type Result = {
  ok: boolean;
  cached?: boolean;
  askingPriceKrw?: number | null;
  fairMid?: number;
  fairLow?: number;
  fairHigh?: number;
  miscAllowance?: number;
  priced?: Priced[];
  unpriced?: Unpriced[];
  verdict?: string | null;
  verdictKo?: string;
  message?: string;
};

const verdictStyle: Record<string, string> = {
  CHEAP: "bg-blue-50 text-blue-800 border-blue-200",
  FAIR: "bg-emerald-50 text-emerald-800 border-emerald-200",
  OVERPRICED: "bg-amber-50 text-amber-800 border-amber-200",
  WAY_OVERPRICED: "bg-red-50 text-red-800 border-red-200",
};

function sampleLabel(p: Priced) {
  if (p.basis === "고정가") return "고정가";
  const count = p.sampleSize ?? 0;
  if (count <= 0) return "실매물 0건 · 참고용";
  if (count < 5) return `실매물 ${count}건 · 참고용`;
  return `실매물 ${count}건`;
}

export default function CalculatorPage() {
  const [text, setText] = useState("");
  const [image, setImage] = useState<string | null>(null);
  const [asking, setAsking] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const { pct, label } = useJobProgress(loading);

  function readFile(file: File) {
    const reader = new FileReader();
    reader.onload = () => setImage(typeof reader.result === "string" ? reader.result : null);
    reader.readAsDataURL(file);
  }

  function onPaste(e: React.ClipboardEvent) {
    const item = Array.from(e.clipboardData.items).find((i) => i.type.startsWith("image/"));
    const file = item?.getAsFile();
    if (file) readFile(file);
  }

  async function check() {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setMessage(null);
    setResult(null);
    try {
      const res = await fetch("/api/valuation/pc", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          text: text.trim() || undefined,
          image: image ?? undefined,
          askingPriceKrw: asking ? Number(digitsOnly(asking)) : undefined,
        }),
      });
      const data = (await res.json()) as Result;
      if (!res.ok || !data.ok) {
        setMessage(data.message ?? "확인에 실패했습니다.");
        return;
      }
      setResult(data);
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return;
      setMessage(e instanceof Error ? e.message : "오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  }

  const hasCase = result?.priced?.some((p) => p.category === "CASE") ?? false;
  const canSubmit = !loading && Boolean(text.trim() || image);

  return (
    <main className="mx-auto w-full max-w-2xl py-6 sm:py-10">
      <p className="text-[12px] font-medium text-[#c2410c]">완본체</p>
      <h1 className="mt-1 text-xl font-bold tracking-tight text-stone-900 sm:text-2xl">중고컴퓨터 시세</h1>
      <p className="mt-1 text-sm text-stone-600">사양을 넣으면 부품 시세를 합쳐 적정가를 봅니다.</p>

      <div className="mt-5 overflow-hidden rounded-xl border border-stone-200 bg-white shadow-[0_8px_24px_rgba(28,25,23,0.05)] sm:mt-6">
        <div className="p-3 sm:p-5">
          <label className="text-sm font-medium text-stone-700">PC 사양</label>
          <textarea
            className="mt-1 h-28 w-full rounded-lg border border-stone-300 bg-stone-50 p-3 text-base outline-none focus:border-[#1e3a5f] focus:bg-white sm:text-sm"
            placeholder="매물 사양을 붙여넣으세요."
            value={text}
            onChange={(e) => setText(e.target.value)}
            onPaste={onPaste}
            disabled={loading}
          />
          <label className="mt-3 flex h-20 cursor-pointer items-center justify-center rounded-lg border border-dashed border-stone-300 bg-stone-50 text-xs text-stone-500 sm:h-24">
            {image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={image} alt="캡처" className="max-h-16 rounded sm:max-h-20" />
            ) : (
              <span>캡처 붙여넣기 또는 선택</span>
            )}
            <input type="file" accept="image/*" className="hidden" disabled={loading} onChange={(e) => e.target.files?.[0] && readFile(e.target.files[0])} />
          </label>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
            <input
              value={asking}
              onChange={(e) => setAsking(e.target.value)}
              inputMode="numeric"
              placeholder="판매자 요구가 (원)"
              disabled={loading}
              className="w-full rounded-lg border border-stone-300 bg-stone-50 px-3 py-2.5 text-base outline-none focus:border-[#1e3a5f] focus:bg-white sm:flex-1 sm:text-sm"
            />
            <button type="button" onClick={check} disabled={!canSubmit} className="w-full rounded-lg bg-[#1e3a5f] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#16304f] disabled:opacity-50 sm:w-auto">
              {loading ? "계산 중" : "시세 확인"}
            </button>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="mt-4">
          <JobProgress pct={pct} label={label} />
        </div>
      ) : null}

      {message ? <p className="mt-4 rounded-xl border border-stone-200 bg-white px-4 py-3 text-sm text-stone-700">{message}</p> : null}

      {result?.ok ? (
        <div className="mt-5 overflow-hidden rounded-xl border border-stone-200 bg-white shadow-[0_8px_24px_rgba(28,25,23,0.05)] sm:mt-6">
          <div className="border-b border-stone-100 p-4 sm:p-5">
            {result.verdict ? (
              <span className={`inline-flex rounded-md border px-3 py-1 text-sm font-bold ${verdictStyle[result.verdict] ?? ""}`}>
                {result.verdictKo}
              </span>
            ) : null}
            {result.cached ? (
              <p className="mt-2 text-[11px] text-stone-400">같은 글의 저장 결과를 다시 쓰셨습니다.</p>
            ) : null}
            <div className="mt-3 grid grid-cols-2 gap-3">
              <div>
                <div className="text-xs text-stone-500">적정가</div>
                <div className="text-xl font-bold text-[#1e3a5f] sm:text-2xl">{formatKrw(result.fairMid)}</div>
              </div>
              <div>
                <div className="text-xs text-stone-500">요구가</div>
                <div className="text-xl font-bold text-[#c2410c] sm:text-2xl">{formatKrw(result.askingPriceKrw)}</div>
              </div>
            </div>
            <div className="mt-2 text-xs text-stone-400">범위 {formatKrw(result.fairLow)} ~ {formatKrw(result.fairHigh)}</div>
          </div>

          <div className="overflow-x-auto px-4 sm:px-5">
            <table className="w-full min-w-[280px] text-sm">
              <tbody>
                {result.priced?.map((p, i) => (
                  <tr key={`${p.name}-${i}`} className="border-b border-stone-100">
                    <td className="py-2.5 pr-3">
                      <div className="break-keep text-stone-800">{p.name}</div>
                      <div className="text-[11px] text-stone-400">{sampleLabel(p)}{p.basis && p.basis !== "고정가" ? ` · ${p.basis}` : ""}</div>
                    </td>
                    <td className="py-2.5 text-right font-medium whitespace-nowrap text-stone-900">{formatKrw(p.mid)}</td>
                  </tr>
                ))}
                <tr className="text-stone-500">
                  <td className="py-2.5 pr-3">{hasCase ? "쿨러·기타 잔부품" : "케이스·쿨러 등"}</td>
                  <td className="py-2.5 text-right whitespace-nowrap">{formatKrw(result.miscAllowance)}</td>
                </tr>
              </tbody>
            </table>
          </div>

          {result.unpriced && result.unpriced.length > 0 ? (
            <div className="m-4 rounded-lg border border-amber-200 bg-amber-50 p-3 sm:m-5 sm:mt-4">
              <p className="text-xs font-medium text-amber-800">시세가 없어 합산에서 빼 부품</p>
              <ul className="mt-2 space-y-1 text-xs text-amber-900">
                {result.unpriced.map((u) => (
                  <li key={u.name} className="flex justify-between gap-3">
                    <span className="min-w-0 break-keep">{u.name}</span>
                    <span className="shrink-0 tabular-nums">
                      {u.estimateMid ? `참고 ${formatKrw(u.estimateLow)} ~ ${formatKrw(u.estimateHigh)}` : "참고가 없음"}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : <div className="h-4" />}

          <p className="px-4 pb-4 text-center text-xs text-stone-400 sm:px-5">추정 시세이며 실제 거래가와 다를 수 있습니다.</p>
        </div>
      ) : null}
    </main>
  );
}
