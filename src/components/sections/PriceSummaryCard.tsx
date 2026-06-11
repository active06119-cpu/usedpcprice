import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type PriceSummaryCardProps = {
  estimatedMinPrice: number;
  estimatedRecommendedPrice: number;
  estimatedMaxPrice: number;
  quickSalePrice: number;
  askingPriceKrw?: number;
};

function formatKrw(value: number) {
  return `${value.toLocaleString("ko-KR")}원`;
}

export function PriceSummaryCard({
  estimatedMinPrice,
  estimatedRecommendedPrice,
  estimatedMaxPrice,
  quickSalePrice,
  askingPriceKrw,
}: PriceSummaryCardProps) {
  const clampedRange = Math.max(estimatedMaxPrice - estimatedMinPrice, 1);
  const markerPercent = askingPriceKrw
    ? Math.max(0, Math.min(100, ((askingPriceKrw - estimatedMinPrice) / clampedRange) * 100))
    : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>가격 요약</CardTitle>
        <CardDescription>추정 범위와 빠른 판매가를 함께 제공합니다.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl bg-zinc-50 p-4">
            <p className="text-xs text-zinc-500">하단 추정가</p>
            <p className="mt-1 text-lg font-semibold text-zinc-900">{formatKrw(estimatedMinPrice)}</p>
          </div>
          <div className="rounded-xl bg-zinc-50 p-4">
            <p className="text-xs text-zinc-500">권장가</p>
            <p className="mt-1 text-lg font-semibold text-zinc-900">
              {formatKrw(estimatedRecommendedPrice)}
            </p>
          </div>
          <div className="rounded-xl bg-zinc-50 p-4">
            <p className="text-xs text-zinc-500">상단 추정가</p>
            <p className="mt-1 text-lg font-semibold text-zinc-900">{formatKrw(estimatedMaxPrice)}</p>
          </div>
          <div className="rounded-xl bg-zinc-50 p-4">
            <p className="text-xs text-zinc-500">빠른 판매가</p>
            <p className="mt-1 text-lg font-semibold text-zinc-900">{formatKrw(quickSalePrice)}</p>
          </div>
        </div>

        <div className="mt-5">
          <p className="mb-2 text-xs text-zinc-500">시세 범위 바 (하단 ~ 상단)</p>
          <div className="relative h-2 w-full rounded-full bg-zinc-200">
            <div className="h-2 rounded-full bg-zinc-900/80" />
            {markerPercent !== null ? (
              <span
                className="absolute top-1/2 h-4 w-4 -translate-y-1/2 -translate-x-1/2 rounded-full border-2 border-white bg-amber-500 shadow"
                style={{ left: `${markerPercent}%` }}
                aria-label={`요청가 마커: ${formatKrw(askingPriceKrw!)}`}
                title={`요청가 ${formatKrw(askingPriceKrw!)}`}
              />
            ) : null}
          </div>
          {askingPriceKrw !== undefined ? (
            <p className="mt-2 text-xs text-zinc-600">요청가: {formatKrw(askingPriceKrw)}</p>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
