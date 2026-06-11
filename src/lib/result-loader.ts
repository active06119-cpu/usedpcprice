import type { Verdict } from "@/components/sections/ResultBadge";
import { prisma } from "@/lib/prisma";

export type ResultViewModel = {
  valuationRunId: string;
  askingPriceKrw: number;
  min: number;
  mid: number;
  max: number;
  quickSale: number;
  verdict: Verdict;
  explanation: string[];
  warnings: string[];
  contributions: Array<{ name: string; amountKrw: number; ratio: number }>;
};

export function buildDemoResult(): ResultViewModel {
  return {
    valuationRunId: "demo-run-id",
    askingPriceKrw: 920000,
    min: 790000,
    mid: 860000,
    max: 940000,
    quickSale: 740000,
    verdict: "FAIR",
    explanation: [
      "최근 시세 거래 데이터 기반 기준가를 계산했습니다.",
      "완본체 거래 특성에 따라 번들 할인 계수를 반영했습니다.",
      "상태/연식/보증 정보를 기반으로 가격을 조정했습니다.",
      "모델명 모호성과 누락 필드에는 보수적 패널티를 적용했습니다.",
    ],
    warnings: [
      "RAM DDR 세대 정보가 없어 보수적으로 계산했습니다.",
      "저장장치 타입(SSD/HDD)이 불명확해 신뢰도가 낮아질 수 있습니다.",
    ],
    contributions: [
      { name: "GPU (RTX 3070)", amountKrw: 370000, ratio: 0.43 },
      { name: "CPU (Ryzen 5 5600)", amountKrw: 130000, ratio: 0.15 },
      { name: "RAM (32GB)", amountKrw: 70000, ratio: 0.08 },
      { name: "Storage (1TB)", amountKrw: 90000, ratio: 0.1 },
      { name: "기타 구성", amountKrw: 200000, ratio: 0.24 },
    ],
  };
}

export async function loadResultById(id: string): Promise<ResultViewModel | null> {
  const run = await prisma.valuationRun.findUnique({
    where: { id },
    include: {
      items: {
        include: { part: true },
      },
    },
  });

  if (!run) return null;

  const min = run.totalFairLow ?? 0;
  const mid = run.totalFairMid ?? 0;
  const max = run.totalFairHigh ?? 0;
  const asking = run.askingPriceKrw ?? mid;
  const quickSale = Math.max(Math.floor(mid * 0.92), min);
  const verdict = (run.verdict as Verdict | null) ?? "RISKY";

  const mappedItems = run.items
    .map((item) => {
      const label = item.part?.fullName ?? item.rawPartLabel ?? "미확인 부품";
      const amount = item.fairMidKrw ?? 0;
      return { name: label, amountKrw: amount };
    })
    .filter((item) => item.amountKrw > 0);

  const total = mappedItems.reduce((sum, item) => sum + item.amountKrw, 0);
  const contributions =
    total > 0
      ? mappedItems.map((item) => ({
          ...item,
          ratio: item.amountKrw / total,
        }))
      : [{ name: "구성 정보 부족", amountKrw: 0, ratio: 1 }];

  return {
    valuationRunId: run.id,
    askingPriceKrw: asking,
    min,
    mid,
    max,
    quickSale,
    verdict,
    explanation: [
      `ValuationRun(${run.id}) 기준으로 결과를 로드했습니다.`,
      `유형: ${run.runType}, 생성 시각: ${run.createdAt.toLocaleString("ko-KR")}`,
      "집계된 fairLow/fairMid/fairHigh 범위를 가격 요약에 반영했습니다.",
      "ValuationItem 기준으로 부품 기여도를 계산했습니다.",
    ],
    warnings:
      run.items.length === 0
        ? ["ValuationItem이 없어 상세 근거가 제한됩니다."]
        : ["일부 값이 null인 항목은 보수적으로 0 처리했습니다."],
    contributions,
  };
}

export async function loadResultViewModelFromApi(id: string): Promise<ResultViewModel | null> {
  const base = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (!base) return null;

  const res = await fetch(`${base}/api/results/${id}`, {
    method: "GET",
    cache: "no-store",
  });
  if (!res.ok) return null;

  type ApiItem = {
    partName: string;
    fairMidKrw: number | null;
  };
  type ApiResult = {
    ok: boolean;
    item?: {
      id: string;
      askingPriceKrw: number | null;
      totalFairLow: number | null;
      totalFairMid: number | null;
      totalFairHigh: number | null;
      verdict: string | null;
      runType: string;
      createdAt: string;
      items: ApiItem[];
    };
  };
  const json = (await res.json()) as ApiResult;
  if (!json.ok || !json.item) return null;

  const min = json.item.totalFairLow ?? 0;
  const mid = json.item.totalFairMid ?? 0;
  const max = json.item.totalFairHigh ?? 0;
  const asking = json.item.askingPriceKrw ?? mid;
  const quickSale = Math.max(Math.floor(mid * 0.92), min);
  const verdict = (json.item.verdict as Verdict | null) ?? "RISKY";

  const mappedItems = json.item.items
    .map((item) => ({
      name: item.partName,
      amountKrw: item.fairMidKrw ?? 0,
    }))
    .filter((item) => item.amountKrw > 0);

  const total = mappedItems.reduce((sum, item) => sum + item.amountKrw, 0);
  const contributions =
    total > 0
      ? mappedItems.map((item) => ({
          ...item,
          ratio: item.amountKrw / total,
        }))
      : [{ name: "구성 정보 부족", amountKrw: 0, ratio: 1 }];

  return {
    valuationRunId: json.item.id,
    askingPriceKrw: asking,
    min,
    mid,
    max,
    quickSale,
    verdict,
    explanation: [
      `ValuationRun(${json.item.id}) API 응답 기준으로 결과를 로드했습니다.`,
      `유형: ${json.item.runType}, 생성 시각: ${new Date(json.item.createdAt).toLocaleString("ko-KR")}`,
      "집계된 fairLow/fairMid/fairHigh 범위를 가격 요약에 반영했습니다.",
      "ValuationItem 기준으로 부품 기여도를 계산했습니다.",
    ],
    warnings:
      json.item.items.length === 0
        ? ["ValuationItem이 없어 상세 근거가 제한됩니다."]
        : ["일부 값이 null인 항목은 보수적으로 0 처리했습니다."],
    contributions,
  };
}
