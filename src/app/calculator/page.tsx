"use client";

import { useState } from "react";

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
  askingPriceKrw?: number | null;
  fairMid?: number;
  fairLow?: number;
  fairHigh?: number;
  miscAllowance?: number;
  priced?: Priced[];
  unpriced?: Unpriced[];
  misc?: Array<{ name: string; category: string }>;
  verdict?: string | null;
  verdictKo?: string;
  message?: string;
};

const krw = (n: number | null | undefined) =>
  typeof n === "number" ? `₩${n.toLocaleString("ko-KR")}` : "—";

const verdictStyle: Record<string, string> = {
  CHEAP: "bg-blue-50 text-blue-700 border-blue-200",
  FAIR: "bg-emerald-50 text-emerald-700 border-emerald-200",
  OVERPRICED: "bg-amber-50 text-amber-700 border-amber-200",
  WAY_OVERPRICED: "bg-red-50 text-red-700 border-red-200",
};

function sampleLabel(n: number | undefined) {
  const count = n ?? 0;
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
    setLoading(true);
    setMessage(null);
    setResult(null);
    try {
      const res = await fetch("/api/valuation/pc", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: text.trim() || undefined,
          image: image ?? undefined,
          askingPriceKrw: asking ? Number(asking.replace(/[^0-9]/g, "")) : undefined,
        }),
      });
      const data = (await res.json()) as Result;
      if (!res.ok || !data.ok) {
        setMessage(data.message ?? "확인에 실패했습니다.");
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
        <h1 className="text-3xl font-bold tracking-tight text-zinc-900">중고 컴퓨터 시세 계산기</h1>
        <p className="mt-2 text-zinc-600">사양을 넣으면 부품 시세를 합쳐 적정가를 알려줍니다.</p>
      </div>

      <div className="mt-8 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
        <label className="text-sm font-medium text-zinc-700">PC 사양</label>
        <textarea
          className="mt-1 h-28 w-full rounded-xl border border-zinc-300 p-3 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
          placeholder={"매물 사양을 붙여넣으세요."}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onPaste={onPaste}
        />
        <label className="mt-3 flex h-24 cursor-pointer items-center justify-center rounded-xl border-2 border-dashed border-zinc-300 text-xs text-zinc-500 hover:border-emerald-400">
          {image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={image} alt="캡처" className="max-h-20 rounded" />
          ) : (
            <span>또는 매물 상세페이지 캡처를 붙여넣기(Ctrl+V)</span>
          )}
          <input type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && readFile(e.target.files[0])} />
        </label>
        <div className="mt-3 flex items-center gap-2">
          <input
            value={asking}
            onChange={(e) => setAsking(e.target.value)}
            inputMode="numeric"
            placeholder="판매자 요구가 (원)"
            className="flex-1 rounded-xl border border-zinc-300 px-3 py-2.5 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
          />
          <button type="button" onClick={check} disabled={loading || (!text.trim() && !image)} className="rounded-xl bg-emerald-600 px-6 py-2.5 text-sm font-semibold text-white disabled:opacity-50">
            {loading ? "확인 중..." : "시세 확인"}
          </button>
        </div>
      </div>

      {message ? <p className="mt-4 rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-700">{message}</p> : null}

      {result?.ok ? (
        <div className="mt-6 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col items-center gap-2 border-b border-zinc-100 pb-4 text-center">
            {result.verdict ? (
              <span className={`inline-flex rounded-full border px-4 py-1.5 text-base font-bold ${verdictStyle[result.verdict] ?? ""}`}>
                {result.verdictKo}
              </span>
            ) : null}
            <div className="mt-1 flex items-end gap-6">
              <div>
                <div className="text-xs text-zinc-500">적정가</div>
                <div className="text-2xl font-bold text-zinc-900">{krw(result.fairMid)}</div>
              </div>
              <div className="text-zinc-300">vs</div>
              <div>
                <div className="text-xs text-zinc-500">요구가</div>
                <div className="text-2xl font-bold text-zinc-500">{krw(result.askingPriceKrw)}</div>
              </div>
            </div>
            <div className="text-xs text-zinc-400">적정가 범위 {krw(result.fairLow)} ~ {krw(result.fairHigh)}</div>
          </div>

          <table className="mt-4 w-full text-sm">
            <tbody>
              {result.priced?.map((p, i) => (
                <tr key={`${p.name}-${i}`} className="border-b border-zinc-50">
                  <td className="py-2">
                    <div>{p.name}</div>
                    <div className="text-[11px] text-zinc-400">{sampleLabel(p.sampleSize)}{p.basis ? ` · ${p.basis}` : ""}</div>
                  </td>
                  <td className="py-2 text-right font-medium">{krw(p.mid)}</td>
                </tr>
              ))}
              <tr className="border-b border-zinc-50 text-zinc-500">
                <td className="py-1.5">케이스·쿨러 등 잔부품 (정액)</td>
                <td className="py-1.5 text-right">{krw(result.miscAllowance)}</td>
              </tr>
            </tbody>
          </table>

          {result.unpriced && result.unpriced.length > 0 ? (
            <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3">
              <p className="text-xs font-medium text-amber-800">시세 샘플이 없어 합산에서 빼 부품</p>
              <ul className="mt-2 space-y-1 text-xs text-amber-900">
                {result.unpriced.map((u) => (
                  <li key={u.name} className="flex justify-between gap-3">
                    <span>{u.name}</span>
                    <span className="tabular-nums">
                      {u.estimateMid
                        ? `참고 ${krw(u.estimateLow)} ~ ${krw(u.estimateHigh)}`
                        : "참고가 없음"}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-[11px] text-amber-700">이 참고 밴드는 적정가 합에 넣지 않았습니다.</p>
            </div>
          ) : null}

          <p className="mt-4 text-center text-xs text-zinc-400">추정 시세이며 실제 거래가와 다를 수 있습니다.</p>
        </div>
      ) : null}
    </main>
  );
}
