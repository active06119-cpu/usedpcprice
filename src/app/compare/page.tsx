"use client";

import { useState } from "react";

import { formatKrw } from "@/lib/format";

type SideResult = {
  ok: boolean;
  message?: string;
  fairMid?: number;
  askingPriceKrw?: number | null;
  verdictKo?: string;
  priced?: Array<{ name: string; mid: number }>;
};

async function valueOne(text: string, asking: string): Promise<SideResult> {
  const res = await fetch("/api/valuation/pc", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      text: text.trim(),
      askingPriceKrw: asking ? Number(asking.replace(/[^0-9]/g, "")) : undefined,
    }),
  });
  return (await res.json()) as SideResult;
}

function Card({ title, data }: { title: string; data: SideResult | null }) {
  if (!data) return (
    <div className="rounded-2xl border border-dashed border-stone-300 bg-white px-4 py-10 text-center text-sm text-stone-400">
      {title} 결과
    </div>
  );
  if (!data.ok) {
    return <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">{data.message ?? "실패"}</div>;
  }
  return (
    <div className="rounded-2xl border border-stone-200 bg-white p-4">
      <p className="text-xs text-stone-500">{title}</p>
      <p className="mt-1 text-xl font-bold text-[#1e3a5f]">{formatKrw(data.fairMid)}</p>
      <p className="text-sm text-stone-500">요구 {formatKrw(data.askingPriceKrw)}</p>
      <p className="mt-2 text-sm font-medium text-stone-800">{data.verdictKo}</p>
      <ul className="mt-3 space-y-1 text-xs text-stone-600">
        {data.priced?.slice(0, 6).map((p) => (
          <li key={p.name} className="flex justify-between gap-3">
            <span className="truncate">{p.name}</span>
            <span className="tabular-nums">{formatKrw(p.mid)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function ComparePage() {
  const [a, setA] = useState("");
  const [b, setB] = useState("");
  const [askA, setAskA] = useState("");
  const [askB, setAskB] = useState("");
  const [left, setLeft] = useState<SideResult | null>(null);
  const [right, setRight] = useState<SideResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function run() {
    if (!a.trim() || !b.trim()) return;
    setLoading(true);
    setMessage(null);
    try {
      const [one, two] = await Promise.all([valueOne(a, askA), valueOne(b, askB)]);
      setLeft(one);
      setRight(two);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "비교에 실패했습니다.");
    } finally {
      setLoading(false);
    }
  }

  const winner =
    left?.ok && right?.ok && left.fairMid && right.fairMid
      ? left.fairMid === right.fairMid
        ? "두 글 적정가가 같습니다."
        : (left.askingPriceKrw ?? Infinity) / left.fairMid < (right.askingPriceKrw ?? Infinity) / right.fairMid
          ? "A가 적정가 대비 더 싸 보입니다."
          : "B가 적정가 대비 더 싸 보입니다."
      : null;

  return (
    <main className="mx-auto w-full max-w-5xl py-6 sm:py-10">
      <p className="text-[12px] font-medium text-[#c2410c]">비교</p>
      <h1 className="mt-1 text-xl font-bold text-stone-900 sm:text-2xl">같은 부품, 어느 글이 싸나</h1>
      <p className="mt-1 text-sm text-stone-600">매물 글 두 개를 붙여넣으면 적정가와 요구가를 같이 봅니다.</p>

      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <div className="rounded-2xl border border-stone-200 bg-white p-4">
          <label className="text-sm font-medium text-stone-700">A</label>
          <textarea className="mt-1 h-36 w-full rounded-lg border border-stone-300 bg-stone-50 p-3 text-sm" value={a} onChange={(e) => setA(e.target.value)} />
          <input className="mt-2 w-full rounded-lg border border-stone-300 bg-stone-50 px-3 py-2 text-sm" placeholder="A 요구가" value={askA} onChange={(e) => setAskA(e.target.value)} />
        </div>
        <div className="rounded-2xl border border-stone-200 bg-white p-4">
          <label className="text-sm font-medium text-stone-700">B</label>
          <textarea className="mt-1 h-36 w-full rounded-lg border border-stone-300 bg-stone-50 p-3 text-sm" value={b} onChange={(e) => setB(e.target.value)} />
          <input className="mt-2 w-full rounded-lg border border-stone-300 bg-stone-50 px-3 py-2 text-sm" placeholder="B 요구가" value={askB} onChange={(e) => setAskB(e.target.value)} />
        </div>
      </div>
      <button type="button" onClick={run} disabled={loading || !a.trim() || !b.trim()} className="mt-4 w-full rounded-xl bg-[#1e3a5f] py-3 text-sm font-semibold text-white disabled:opacity-50">
        {loading ? "비교 중" : "비교하기"}
      </button>
      {message ? <p className="mt-3 text-sm text-stone-600">{message}</p> : null}
      {winner ? <p className="mt-4 text-center text-sm font-medium text-stone-800">{winner}</p> : null}
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <Card title="A" data={left} />
        <Card title="B" data={right} />
      </div>
    </main>
  );
}
