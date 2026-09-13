"use client";

import { useEffect, useMemo, useState } from "react";

const STAGES = [
  { until: 18, label: "글 읽는 중" },
  { until: 42, label: "부품 나누는 중" },
  { until: 70, label: "시세 찾는 중" },
  { until: 92, label: "적정가 계산 중" },
] as const;

function labelFor(pct: number): string {
  return STAGES.find((s) => pct <= s.until)?.label ?? "정리 중";
}

export function useJobProgress(active: boolean) {
  const [pct, setPct] = useState(0);

  useEffect(() => {
    if (!active) {
      setPct(0);
      return;
    }
    setPct(6);
    const started = Date.now();
    const timer = window.setInterval(() => {
      const elapsed = Date.now() - started;
      const next = Math.min(92, Math.round(92 * (1 - Math.exp(-elapsed / 6500))));
      setPct(Math.max(6, next));
    }, 180);
    return () => window.clearInterval(timer);
  }, [active]);

  const label = useMemo(() => (active ? labelFor(pct) : ""), [active, pct]);
  return { pct, label };
}
