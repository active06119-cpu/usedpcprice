import type { AnalyzeResult, AnalyzedPart } from "@/app/api/analyze/route";
import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";

type PageProps = {
  params: Promise<{ id: string }>;
};

const VERDICT_STYLE: Record<string, string> = {
  CHEAP: "bg-blue-50 border-blue-200 text-blue-800",
  FAIR: "bg-green-50 border-green-200 text-green-800",
  OVERPRICED: "bg-yellow-50 border-yellow-200 text-yellow-800",
  WAY_OVERPRICED: "bg-red-50 border-red-200 text-red-800",
  NO_PRICE: "bg-gray-50 border-gray-200 text-gray-600",
};

const VERDICT_KO: Record<string, string> = {
  CHEAP: "저렴해요",
  FAIR: "적정가",
  OVERPRICED: "약간비쌈",
  WAY_OVERPRICED: "많이 비쌈",
  NO_PRICE: "가격 정보 없음",
};

const krw = (n: number | null) => (typeof n === "number" ? `₩${n.toLocaleString("ko-KR")}` : "—");

export default async function SharedResultPage({ params }: PageProps) {
  const { id } = await params;

  const saved = await prisma.valuationResult.findUnique({
    where: { id },
    select: { payload: true, createdAt: true },
  });

  if (!saved) notFound();

  const result = (saved.payload as unknown) as AnalyzeResult & { sourceText?: string | null };
  const sourceText = result.sourceText ?? "";

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <section className="rounded-2xl border border-zinc-200 bg-white p-6">
        <h1 className="text-3xl font-semibold tracking-tight text-zinc-900">공유된 분석 결과</h1>
        <p className="mt-2 text-sm text-zinc-600">
          저장 시각: {new Date(saved.createdAt).toLocaleString("ko-KR")}
        </p>
      </section>

      {sourceText ? (
        <section className="mt-6 rounded-2xl border border-zinc-200 bg-white p-5">
          <div className="mb-2 text-sm font-medium text-zinc-700">입력 원문</div>
          <pre className="max-h-72 overflow-auto whitespace-pre-wrap rounded-xl bg-zinc-50 p-4 text-xs text-zinc-700">
            {sourceText}
          </pre>
        </section>
      ) : null}

      <section className="mt-8 space-y-5">
        <div className="rounded-2xl border border-zinc-200 bg-white p-4">
          {result.askingPrice ? (
            <div
              className={`inline-flex items-center rounded-full border px-3 py-1 text-sm font-medium ${VERDICT_STYLE[result.verdict]}`}
            >
              {VERDICT_KO[result.verdict]}
            </div>
          ) : (
            <p className="text-sm text-zinc-700">
              적정 판매가: <span className="font-semibold text-zinc-900">{krw(result.totalFairMid)}</span>
            </p>
          )}
        </div>

        <div className="rounded-2xl border border-zinc-200 bg-white p-4">
          <div className="text-sm font-medium text-zinc-700">가격 범위</div>
          <div className="mt-3 grid grid-cols-3 gap-3 text-sm">
            <div className="rounded-lg bg-zinc-50 p-3">
              <div className="text-xs text-zinc-500">하한가</div>
              <div className="mt-1 font-semibold text-zinc-900">{krw(result.totalFairLow)}</div>
            </div>
            <div className="rounded-lg bg-green-50 p-3">
              <div className="text-xs text-green-700">적정가</div>
              <div className="mt-1 font-semibold text-green-800">{krw(result.totalFairMid)}</div>
            </div>
            <div className="rounded-lg bg-zinc-50 p-3">
              <div className="text-xs text-zinc-500">상한가</div>
              <div className="mt-1 font-semibold text-zinc-900">{krw(result.totalFairHigh)}</div>
            </div>
          </div>
        </div>

        <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white">
          <div className="border-b border-zinc-200 bg-zinc-50 px-4 py-3 text-sm font-medium text-zinc-700">
            부품별 내역
          </div>
          <table className="w-full text-sm">
            <thead className="bg-zinc-50 text-zinc-600">
              <tr>
                <th className="px-4 py-2 text-left font-medium">부품명</th>
                <th className="px-4 py-2 text-right font-medium">중고적정가</th>
                <th className="px-4 py-2 text-right font-medium">신품가</th>
                <th className="px-4 py-2 text-right font-medium">감가율</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {result.parts.map((part: AnalyzedPart, idx: number) => (
                <tr key={`${part.partName}-${idx}`}>
                  <td className="px-4 py-2 text-zinc-800">
                    <div>{part.partName}</div>
                    {part.category === "SSD" && (
                      <div className="mt-0.5 text-[11px] text-zinc-400">브랜드에 따라 ±50% 차이 가능</div>
                    )}
                  </td>
                  <td className="px-4 py-2 text-right font-medium text-zinc-900">{krw(part.usedMid)}</td>
                  <td className="px-4 py-2 text-right text-zinc-700">{krw(part.newPrice)}</td>
                  <td className="px-4 py-2">
                    {part.newPrice && part.usedMid ? (
                      <div className="flex items-center justify-end gap-2">
                        <span className="font-mono text-xs text-zinc-700">
                          {`${"█".repeat(
                            Math.max(1, Math.min(10, Math.round((part.usedMid / part.newPrice) * 10))),
                          )}${"░".repeat(
                            10 - Math.max(1, Math.min(10, Math.round((part.usedMid / part.newPrice) * 10))),
                          )}`}
                        </span>
                        <span className="text-xs text-zinc-600">
                          -{Math.max(0, Math.round((1 - part.usedMid / part.newPrice) * 100))}%
                        </span>
                      </div>
                    ) : (
                      <div className="text-right text-zinc-700">—</div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="border-t border-zinc-200 bg-zinc-50 px-4 py-3 text-sm">
            합산 적정가 합계: <span className="font-semibold text-zinc-900">{krw(result.totalFairMid)}</span>
          </div>
        </div>
      </section>
    </main>
  );
}
