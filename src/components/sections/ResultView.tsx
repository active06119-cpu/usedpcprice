"use client";

import { useEffect, useState } from "react";

import { ChartAreaCard } from "@/components/sections/ChartAreaCard";
import { ComponentContributionCard } from "@/components/sections/ComponentContributionCard";
import { ExplanationPanel } from "@/components/sections/ExplanationPanel";
import { PriceSummaryCard } from "@/components/sections/PriceSummaryCard";
import { ResultBadge, verdictToBadgeValue } from "@/components/sections/ResultBadge";
import { StepFlow } from "@/components/sections/StepFlow";
import { WarningsPanel } from "@/components/sections/WarningsPanel";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { buildDemoResult, type ResultViewModel } from "@/lib/result-loader";

type ResultViewProps = {
  runId?: string;
  initialModel?: ResultViewModel;
};

type ApiResultResponse = {
  ok: boolean;
  item?: {
    id: string;
    runType: string;
    askingPriceKrw: number | null;
    totalFairLow: number | null;
    totalFairMid: number | null;
    totalFairHigh: number | null;
    verdict: string | null;
    createdAt: string;
    items: Array<{
      partName: string;
      fairMidKrw: number | null;
    }>;
  };
  message?: string;
};

function toViewModelFromApi(res: ApiResultResponse): ResultViewModel | null {
  if (!res.ok || !res.item) return null;
  const min = res.item.totalFairLow ?? 0;
  const mid = res.item.totalFairMid ?? 0;
  const max = res.item.totalFairHigh ?? 0;
  const asking = res.item.askingPriceKrw ?? mid;
  const quickSale = Math.max(Math.floor(mid * 0.92), min);

  const mappedItems = res.item.items
    .map((item) => ({
      name: item.partName,
      amountKrw: item.fairMidKrw ?? 0,
    }))
    .filter((item) => item.amountKrw > 0);
  const total = mappedItems.reduce((sum, item) => sum + item.amountKrw, 0);
  const contributions =
    total > 0
      ? mappedItems.map((item) => ({ ...item, ratio: item.amountKrw / total }))
      : [{ name: "구성 정보 부족", amountKrw: 0, ratio: 1 }];

  return {
    valuationRunId: res.item.id,
    askingPriceKrw: asking,
    min,
    mid,
    max,
    quickSale,
    verdict: (res.item.verdict as ResultViewModel["verdict"] | null) ?? "RISKY",
    explanation: [
      `ValuationRun(${res.item.id}) API 응답 기준으로 결과를 로드했습니다.`,
      `유형: ${res.item.runType}, 생성 시각: ${new Date(res.item.createdAt).toLocaleString("ko-KR")}`,
      "집계된 fairLow/fairMid/fairHigh 범위를 가격 요약에 반영했습니다.",
      "ValuationItem 기준으로 부품 기여도를 계산했습니다.",
    ],
    warnings:
      res.item.items.length === 0
        ? ["ValuationItem이 없어 상세 근거가 제한됩니다."]
        : ["일부 값이 null인 항목은 보수적으로 0 처리했습니다."],
    contributions,
  };
}

export function ResultView({ runId, initialModel }: ResultViewProps) {
  const [model, setModel] = useState<ResultViewModel>(initialModel ?? buildDemoResult());
  const [loading, setLoading] = useState(Boolean(runId && !initialModel));
  const [error, setError] = useState<string | null>(null);

  async function fetchResult(targetRunId: string, signal?: AbortSignal) {
    async function run() {
      try {
        setLoading(true);
        setError(null);
        const res = await fetch(`/api/results/${targetRunId}`, { cache: "no-store", signal });
        const data = (await res.json()) as ApiResultResponse;
        const parsed = toViewModelFromApi(data);
        if (!parsed) {
          setError(data.message ?? "결과를 불러오지 못했습니다.");
          return;
        }
        setModel(parsed);
      } catch (e) {
        if ((e as Error).name === "AbortError") return;
        setError(e instanceof Error ? e.message : "결과 로딩 중 오류가 발생했습니다.");
      } finally {
        setLoading(false);
      }
    }
    await run();
  }

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    async function run() {
      if (!runId || cancelled) return;
      await fetchResult(runId, controller.signal);
    }
    void run();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [runId]);

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>결과 로딩 중</CardTitle>
          <CardDescription>valuation run 데이터를 가져오는 중입니다.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>결과 로딩 실패</CardTitle>
          <CardDescription>{error}</CardDescription>
        </CardHeader>
        {runId ? (
          <CardContent>
            <button
              type="button"
              onClick={() => void fetchResult(runId)}
              className="rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-700 hover:bg-zinc-50"
            >
              다시 시도
            </button>
          </CardContent>
        ) : null}
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>리스팅 평가</CardTitle>
          <CardDescription>요청 판매가 {model.askingPriceKrw.toLocaleString("ko-KR")}원 기준</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-3">
          <ResultBadge value={verdictToBadgeValue(model.verdict)} />
        </CardContent>
      </Card>

      <PriceSummaryCard
        estimatedMinPrice={model.min}
        estimatedRecommendedPrice={model.mid}
        estimatedMaxPrice={model.max}
        quickSalePrice={model.quickSale}
        askingPriceKrw={model.askingPriceKrw}
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <ExplanationPanel bullets={model.explanation} />
        <WarningsPanel warnings={model.warnings} />
      </div>

      <ComponentContributionCard items={model.contributions} />

      <StepFlow title="결과 확인 단계" currentStep={3} />

      <ChartAreaCard valuationRunId={model.valuationRunId} />
    </>
  );
}
