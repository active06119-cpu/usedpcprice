"use client";

import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

type TrendPoint = {
  capturedAt: string;
  priceKrw: number;
};

type Props = {
  trend: TrendPoint[];
};

const krw = (n: number) => `₩${n.toLocaleString("ko-KR")}`;

export function PriceTrendChart({ trend }: Props) {
  const sanitized = trend
    .map((point) => {
      const ts = new Date(point.capturedAt).getTime();
      const price = Number(point.priceKrw);
      if (!Number.isFinite(ts) || !Number.isFinite(price) || price <= 0) return null;
      return {
        date: new Date(ts).toLocaleDateString("ko-KR", { month: "numeric", day: "numeric" }),
        priceKrw: price,
        ts,
      };
    })
    .filter((v): v is { date: string; priceKrw: number; ts: number } => Boolean(v))
    .sort((a, b) => a.ts - b.ts)
    .slice(-60);

  if (sanitized.length < 2) {
    return <p className="mt-3 text-sm text-zinc-500">추이 데이터가 부족해 차트를 표시할 수 없습니다.</p>;
  }

  return (
    <div className="mt-4 h-52 rounded-xl border border-zinc-100 bg-zinc-50 p-2">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={sanitized} margin={{ top: 8, right: 12, left: 8, bottom: 4 }}>
          <XAxis dataKey="date" tick={{ fontSize: 11 }} minTickGap={18} />
          <YAxis
            tick={{ fontSize: 11 }}
            width={64}
            tickFormatter={(v) => `${Math.round(Number(v) / 1000)}k`}
            domain={["dataMin - 5000", "dataMax + 5000"]}
          />
          <Tooltip
            formatter={(value) => krw(Number(value))}
            labelFormatter={(label) => `${label}`}
            contentStyle={{ borderRadius: 10, borderColor: "#e4e4e7" }}
          />
          <Line
            type="linear"
            dataKey="priceKrw"
            stroke="#2563eb"
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
