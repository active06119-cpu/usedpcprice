"use client";

import { Progress } from "@/components/ui/progress";

type JobProgressProps = {
  pct: number;
  label: string;
};

export function JobProgress({ pct, label }: JobProgressProps) {
  const shown = Math.max(0, Math.min(100, Math.round(pct)));
  return (
    <div className="rounded-xl border border-stone-200 bg-white p-4 shadow-[0_8px_24px_rgba(28,25,23,0.05)]">
      <div className="flex items-end justify-between gap-3">
        <p className="text-sm font-medium text-stone-800">{label}</p>
        <p className="text-sm font-semibold tabular-nums text-[#1e3a5f]">{shown}%</p>
      </div>
      <div className="mt-2">
        <Progress value={shown} />
      </div>
      <p className="mt-2 text-[11px] text-stone-400">완본체는 5~20초 걸릴 수 있습니다.</p>
    </div>
  );
}
