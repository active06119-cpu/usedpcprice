import Link from "next/link";
import { notFound } from "next/navigation";

import { VERDICT_KO } from "@/lib/engine/verdict";
import { formatKrw } from "@/lib/format";
import { prisma } from "@/lib/prisma";

const verdictStyle: Record<string, string> = {
  CHEAP: "bg-blue-50 text-blue-800 border-blue-200",
  FAIR: "bg-emerald-50 text-emerald-800 border-emerald-200",
  OVERPRICED: "bg-amber-50 text-amber-800 border-amber-200",
  WAY_OVERPRICED: "bg-red-50 text-red-800 border-red-200",
};

type Payload = {
  askingPriceKrw?: number | null;
  askingPrice?: number | null;
  fairMid?: number;
  fairLow?: number;
  fairHigh?: number;
  totalFairMid?: number;
  totalFairLow?: number;
  totalFairHigh?: number;
  verdict?: string | null;
  verdictKo?: string;
  priced?: Array<{ name: string; mid: number; basis?: string; sampleSize?: number }>;
  parts?: Array<{ partName: string; usedMid?: number | null }>;
};

export default async function SharePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const saved = await prisma.valuationResult.findUnique({
    where: { id },
    select: { payload: true, createdAt: true },
  });
  if (!saved) notFound();

  const result = saved.payload as Payload;
  const mid = result.fairMid ?? result.totalFairMid ?? null;
  const low = result.fairLow ?? result.totalFairLow ?? null;
  const high = result.fairHigh ?? result.totalFairHigh ?? null;
  const asking = result.askingPriceKrw ?? result.askingPrice ?? null;
  const label = (result.verdict && VERDICT_KO[result.verdict]) || result.verdictKo || "";
  const rows =
    result.priced?.map((p) => ({ name: p.name, mid: p.mid, note: p.basis })) ??
    result.parts?.map((p) => ({ name: p.partName, mid: p.usedMid ?? 0, note: "" })) ??
    [];

  return (
    <main className="mx-auto w-full max-w-2xl py-8 sm:py-12">
      <p className="text-sm font-medium text-[#c2410c]">공유된 시세</p>
      <h1 className="mt-2 text-3xl font-bold tracking-tight text-stone-900">중고컴퓨터 시세</h1>
      <p className="mt-2 text-sm text-stone-500">{saved.createdAt.toLocaleString("ko-KR")}</p>

      <section className="mt-6 overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-[0_12px_32px_rgba(28,25,23,0.06)]">
        <div className="border-b border-stone-100 p-5">
          {result.verdict ? (
            <span className={`inline-flex rounded-md border px-3 py-1 text-sm font-bold ${verdictStyle[result.verdict] ?? "bg-stone-100 text-stone-700 border-stone-200"}`}>
              {label}
            </span>
          ) : null}
          <div className="mt-4 grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-stone-500">적정가</p>
              <p className="mt-1 text-2xl font-bold text-[#1e3a5f]">{formatKrw(mid)}</p>
            </div>
            <div>
              <p className="text-xs text-stone-500">요구가</p>
              <p className="mt-1 text-2xl font-bold text-[#c2410c]">{formatKrw(asking)}</p>
            </div>
          </div>
          <p className="mt-2 text-xs text-stone-400">범위 {formatKrw(low)} ~ {formatKrw(high)}</p>
        </div>
        <table className="w-full text-sm">
          <tbody>
            {rows.map((row, i) => (
              <tr key={`${row.name}-${i}`} className="border-t border-stone-100">
                <td className="px-5 py-3 text-stone-800">
                  {row.name}
                  {row.note ? <span className="mt-0.5 block text-[11px] text-stone-400">{row.note}</span> : null}
                </td>
                <td className="px-5 py-3 text-right font-medium tabular-nums text-stone-900">{formatKrw(row.mid)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <div className="mt-6 flex gap-3">
        <Link href="/" className="flex-1 rounded-xl bg-[#1e3a5f] px-4 py-3 text-center text-sm font-semibold text-white">
          내 글도 계산하기
        </Link>
        <Link href="/compare" className="flex-1 rounded-xl border border-stone-200 bg-white px-4 py-3 text-center text-sm text-stone-800">
          다른 글과 비교
        </Link>
      </div>
      <p className="mt-4 text-center text-xs text-stone-400">추정 시세이며 실제 거래가와 다를 수 있습니다.</p>
    </main>
  );
}
