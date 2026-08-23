"use client";

import { useState } from "react";

type Priced = { name: string; category: string; mid: number; basis: string };
type Unpriced = { name: string; category: string };
type Result = {
  ok: boolean;
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

const krw = (n: number | null | undefined) =>
  typeof n === "number" ? `₩${n.toLocaleString("ko-KR")}` : "—";

const verdictStyle: Record<string, string> = {
  CHEAP: "bg-blue-50 text-blue-700 border-blue-200",
  FAIR: "bg-emerald-50 text-emerald-700 border-emerald-200",
  OVERPRICED: "bg-amber-50 text-amber-700 border-amber-200",
  WAY_OVERPRICED: "bg-red-50 text-red-700 border-red-200",
};

export default function PcValuationPage() {
  const adminToken = process.env.NEXT_PUBLIC_ADMIN_API_TOKEN ?? "";
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

  async function judge() {
    setLoading(true);
    setMessage(null);
    setResult(null);
    try {
      const res = await fetch("/api/admin/pc-valuation", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-admin-token": adminToken },
        body: JSON.stringify({
          text: text.trim() || undefined,
          image: image ?? undefined,
          askingPriceKrw: asking ? Number(asking.replace(/[^0-9]/g, "")) : undefined,
        }),
      });
      const data = (await res.json()) as Result;
      if (!res.ok || !data.ok) {
        setMessage(data.message ?? "판정 실패");
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
    <main className="mx-auto max-w-3xl px-4 py-8" onPaste={onPaste}>
      <h1 className="text-xl font-semibold text-zinc-900">조립PC 호구 판정</h1>
      <p className="mt-1 text-sm text-zinc-600">
        조립PC 매물의 사양을 붙여넣거나 상세페이지를 캡처(Ctrl+V)하면, 부품별 시세를 합해 적정가를 판정합니다.
      </p>

      <textarea
        className="mt-4 h-28 w-full rounded-lg border border-zinc-300 p-3 text-sm outline-none focus:border-zinc-500"
        placeholder={"사양 붙여넣기 예:\nRTX 4060 Ti / 라이젠5 7500F / 16GB / SSD 1TB / 700W / 케이스"}
        value={text}
        onChange={(e) => setText(e.target.value)}
      />

      <label className="mt-2 flex h-28 cursor-pointer items-center justify-center rounded-lg border-2 border-dashed border-zinc-300 text-xs text-zinc-500 hover:border-zinc-400">
        {image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={image} alt="캡처" className="max-h-24 rounded" />
        ) : (
          <span>또는 상세페이지 캡처를 붙여넣기(Ctrl+V)/클릭</span>
        )}
        <input type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && readFile(e.target.files[0])} />
      </label>

      <div className="mt-3 flex items-center gap-2">
        <input
          value={asking}
          onChange={(e) => setAsking(e.target.value)}
          inputMode="numeric"
          placeholder="판매자 요구가 (원)"
          className="w-48 rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-zinc-500"
        />
        <button
          type="button"
          onClick={judge}
          disabled={loading || (!text.trim() && !image)}
          className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {loading ? "판정 중..." : "호구 판정"}
        </button>
      </div>

      {message ? (
        <p className="mt-3 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-800">{message}</p>
      ) : null}

      {result?.ok ? (
        <div className="mt-5 rounded-xl border border-zinc-200 bg-white p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-xs text-zinc-500">적정가 (부품합 + 잔부품 {krw(result.miscAllowance)})</div>
              <div className="text-2xl font-semibold text-zinc-900">{krw(result.fairMid)}</div>
              <div className="text-xs text-zinc-500">{krw(result.fairLow)} ~ {krw(result.fairHigh)}</div>
            </div>
            <div className="text-right">
              <div className="text-xs text-zinc-500">판매자 요구가</div>
              <div className="text-lg font-medium text-zinc-800">{krw(result.askingPriceKrw)}</div>
              {result.verdict ? (
                <span className={`mt-1 inline-flex rounded-full border px-3 py-1 text-sm font-medium ${verdictStyle[result.verdict] ?? ""}`}>
                  {result.verdictKo}
                </span>
              ) : null}
            </div>
          </div>

          <table className="mt-4 w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-200 text-left text-xs text-zinc-500">
                <th className="py-1 pr-3">부품</th>
                <th className="py-1 pr-3">시세</th>
                <th className="py-1">근거</th>
              </tr>
            </thead>
            <tbody>
              {result.priced?.map((p, i) => (
                <tr key={i} className="border-b border-zinc-100">
                  <td className="py-1.5 pr-3">{p.name} <span className="text-xs text-zinc-400">({p.category})</span></td>
                  <td className="py-1.5 pr-3 font-medium whitespace-nowrap">{krw(p.mid)}</td>
                  <td className="py-1.5 text-xs text-zinc-500">{p.basis}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {result.unpriced && result.unpriced.length > 0 ? (
            <p className="mt-3 text-xs text-amber-700">
              시세 없음(잔부품 정액에 포함): {result.unpriced.map((u) => `${u.name}(${u.category})`).join(", ")}
            </p>
          ) : null}
        </div>
      ) : null}
    </main>
  );
}
