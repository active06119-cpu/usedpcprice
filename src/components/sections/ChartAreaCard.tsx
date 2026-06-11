"use client";

import { BarChart3, LineChart } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart as RechartsLineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type ChartAreaCardProps = {
  valuationRunId?: string;
};

export function ChartAreaCard({ valuationRunId }: ChartAreaCardProps) {
  const modeLabel = valuationRunId ? "결과(run) 히스토리 모드" : "카테고리 트렌드 모드";
  const [series, setSeries] = useState<Array<{ date: string; price: number }>>([]);
  const [loading, setLoading] = useState(false);

  const avgPrice = useMemo(() => {
    if (series.length === 0) return null;
    const sum = series.reduce((acc, cur) => acc + cur.price, 0);
    return Math.round(sum / series.length);
  }, [series]);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      if (!valuationRunId) return;
      try {
        setLoading(true);
        const resultRes = await fetch(`/api/results/${valuationRunId}`, { cache: "no-store" });
        const resultJson = (await resultRes.json()) as {
          ok: boolean;
          item?: { items: Array<{ partId: string | null }> };
        };
        const partId = resultJson.item?.items.find((x) => Boolean(x.partId))?.partId;
        if (!partId) return;

        const snapRes = await fetch(`/api/parts/${partId}/snapshots?days=60&limit=120`, { cache: "no-store" });
        const snapJson = (await snapRes.json()) as {
          ok: boolean;
          items?: Array<{ capturedAt: string; priceKrw: number }>;
        };
        if (!snapJson.ok || !snapJson.items) return;

        const points = snapJson.items
          .slice()
          .reverse()
          .map((item) => ({
            date: new Date(item.capturedAt).toLocaleDateString("ko-KR", {
              month: "numeric",
              day: "numeric",
            }),
            price: item.priceKrw,
          }));
        if (!cancelled) setSeries(points);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void run();
    return () => {
      cancelled = true;
    };
  }, [valuationRunId]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>차트 영역</CardTitle>
        <CardDescription>
          시세 추이, 가격 범위, 기여도 차트를 배치할 공간입니다. ({modeLabel})
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid gap-3 md:grid-cols-2">
          <div className="h-56 rounded-xl border border-dashed border-zinc-300 bg-zinc-50 p-3 text-sm text-zinc-600">
            <div className="mb-2 flex items-center gap-2 font-medium text-zinc-700">
              <LineChart className="h-4 w-4" />
              가격 추이 차트
            </div>
            {valuationRunId ? (
              loading ? (
                <p className="text-xs text-zinc-500">거래 데이터 로딩 중...</p>
              ) : series.length > 0 ? (
                <div className="space-y-1">
                  <p className="text-xs text-zinc-500">
                    최근 {series.length}개 포인트 · 평균 {avgPrice?.toLocaleString("ko-KR")}원
                  </p>
                  <div className="h-36 rounded border border-zinc-200 bg-white p-2">
                    <ResponsiveContainer width="100%" height="100%">
                      <RechartsLineChart data={series}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                        <YAxis tickFormatter={(v) => `${Math.round(Number(v) / 10000)}만`} tick={{ fontSize: 10 }} />
                        <Tooltip formatter={(v) => `${Number(v).toLocaleString("ko-KR")}원`} />
                        <Line type="monotone" dataKey="price" stroke="#18181b" strokeWidth={2} dot={false} />
                      </RechartsLineChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              ) : (
                <p className="text-xs text-zinc-500">연결 가능한 거래 데이터가 없습니다.</p>
              )
            ) : (
              <p className="text-xs text-zinc-500">카테고리별 최근 시세 추이를 표시할 영역입니다.</p>
            )}
          </div>
          <div className="h-56 rounded-xl border border-dashed border-zinc-300 bg-zinc-50 p-3 text-sm text-zinc-500">
            <div className="mb-2 flex items-center gap-2 font-medium text-zinc-700">
              <BarChart3 className="h-4 w-4" />
              범위/기여도 차트
            </div>
            {series.length > 0 ? (
              <div className="h-40 rounded border border-zinc-200 bg-white p-2">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={series.slice(-8)}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                    <YAxis tickFormatter={(v) => `${Math.round(Number(v) / 10000)}만`} tick={{ fontSize: 10 }} />
                    <Tooltip formatter={(v) => `${Number(v).toLocaleString("ko-KR")}원`} />
                    <Bar dataKey="price" fill="#52525b" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="flex h-40 items-center justify-center rounded border border-zinc-200 bg-white text-xs text-zinc-500">
                데이터가 쌓이면 자동 표시됩니다.
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
