export type ValuationRunLike = {
  askingPriceKrw: number | null;
  totalFairLow: number | null;
  totalFairMid: number | null;
  totalFairHigh: number | null;
};

export type ValuationItemLike = {
  snapshotIds: string[];
  adjustmentsApplied: unknown;
  createdAt?: Date;
};

export type ValuationExplanation = {
  verdict: "GOOD_DEAL" | "FAIR" | "SLIGHTLY_OVERPRICED" | "OVERPRICED" | "RISKY";
  verdictReason: string;
  confidence: "HIGH" | "MEDIUM" | "LOW";
  confidenceReason: string;
  sampleSize: number;
  dataAgeWarning: boolean;
  appliedRules: Array<{
    name: string;
    effect: string;
  }>;
  warnings: string[];
};

type AdjustmentRecord = {
  ruleName?: unknown;
  name?: unknown;
  multiplierApplied?: unknown;
  multiplier?: unknown;
  flatOffsetApplied?: unknown;
  flatOffset?: unknown;
};

type RuleAggregate = {
  pctEffects: number[];
  flatEffects: number[];
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function safeNumber(value: number | null | undefined, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function formatPercent(multiplier: number): string {
  const pct = Math.round((multiplier - 1) * 100);
  return `${pct >= 0 ? "+" : ""}${pct}%`;
}

function formatFlatOffset(offset: number): string {
  return `${offset >= 0 ? "+" : ""}${offset.toLocaleString("ko-KR")}원`;
}

function parseAdjustments(value: unknown): AdjustmentRecord[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item) => typeof item === "object" && item !== null) as AdjustmentRecord[];
}

function resolveRuleName(record: AdjustmentRecord): string | null {
  if (typeof record.ruleName === "string" && record.ruleName.trim()) return record.ruleName.trim();
  if (typeof record.name === "string" && record.name.trim()) return record.name.trim();
  return null;
}

function resolveMultiplier(record: AdjustmentRecord): number | null {
  if (typeof record.multiplierApplied === "number" && Number.isFinite(record.multiplierApplied)) {
    return record.multiplierApplied;
  }
  if (typeof record.multiplier === "number" && Number.isFinite(record.multiplier)) {
    return record.multiplier;
  }
  return null;
}

function resolveFlatOffset(record: AdjustmentRecord): number | null {
  if (typeof record.flatOffsetApplied === "number" && Number.isFinite(record.flatOffsetApplied)) {
    return record.flatOffsetApplied;
  }
  if (typeof record.flatOffset === "number" && Number.isFinite(record.flatOffset)) {
    return record.flatOffset;
  }
  return null;
}

function computeVerdict(
  askingPrice: number | null,
  fairLow: number,
  fairMid: number,
  fairHigh: number,
  sampleSize: number,
): ValuationExplanation["verdict"] {
  if (sampleSize < 3) return "RISKY";
  if (askingPrice === null || askingPrice <= 0) return "RISKY";
  if (askingPrice <= fairLow) return "GOOD_DEAL";
  if (askingPrice <= fairMid * 1.05) return "FAIR";
  if (askingPrice <= fairHigh) return "SLIGHTLY_OVERPRICED";
  return "OVERPRICED";
}

function buildVerdictReason(
  verdict: ValuationExplanation["verdict"],
  askingPrice: number | null,
  fairLow: number,
  fairMid: number,
  fairHigh: number,
): string {
  if (verdict === "RISKY") return "데이터가 부족하거나 요청가 정보가 없어 보수적으로 위험으로 분류했습니다.";
  const asking = (askingPrice ?? 0).toLocaleString("ko-KR");
  const low = fairLow.toLocaleString("ko-KR");
  const mid = fairMid.toLocaleString("ko-KR");
  const high = fairHigh.toLocaleString("ko-KR");

  if (verdict === "GOOD_DEAL") {
    return `요청가 ${asking}원은 공정 하단가 ${low}원 이하로 저렴한 편입니다.`;
  }
  if (verdict === "FAIR") {
    return `요청가 ${asking}원은 공정 중간가 ${mid}원 기준 ±5% 구간으로 적정합니다.`;
  }
  if (verdict === "SLIGHTLY_OVERPRICED") {
    return `요청가 ${asking}원은 공정 상단가 ${high}원 이내지만 다소 높은 편입니다.`;
  }
  return `요청가 ${asking}원은 공정 상단가 ${high}원을 초과하여 과대평가로 판단됩니다.`;
}

function buildConfidence(
  sampleSize: number,
  latestAgeDays: number,
): Pick<ValuationExplanation, "confidence" | "confidenceReason"> {
  if (sampleSize >= 10 && latestAgeDays <= 7) {
    return {
      confidence: "HIGH",
      confidenceReason: `샘플 ${sampleSize}개이고 최신 데이터가 ${latestAgeDays}일 이내라 신뢰도가 높습니다.`,
    };
  }
  if (sampleSize >= 5 && latestAgeDays <= 14) {
    return {
      confidence: "MEDIUM",
      confidenceReason: `샘플 ${sampleSize}개이며 최신 데이터가 ${latestAgeDays}일 이내로 중간 신뢰도입니다.`,
    };
  }
  return {
    confidence: "LOW",
    confidenceReason: `샘플 ${sampleSize}개 또는 데이터 최신성이 부족해 신뢰도가 낮습니다.`,
  };
}

function mergeAppliedRules(items: ValuationItemLike[]): ValuationExplanation["appliedRules"] {
  const aggregates = new Map<string, RuleAggregate>();

  for (const item of items) {
    const records = parseAdjustments(item.adjustmentsApplied);
    for (const record of records) {
      const name = resolveRuleName(record);
      if (!name) continue;

      const entry = aggregates.get(name) ?? { pctEffects: [], flatEffects: [] };
      const multiplier = resolveMultiplier(record);
      if (multiplier !== null) {
        entry.pctEffects.push(multiplier);
      }
      const flatOffset = resolveFlatOffset(record);
      if (flatOffset !== null) {
        entry.flatEffects.push(flatOffset);
      }
      aggregates.set(name, entry);
    }
  }

  return Array.from(aggregates.entries()).map(([name, value]) => {
    const effects: string[] = [];
    if (value.pctEffects.length > 0) {
      const avgMultiplier = value.pctEffects.reduce((sum, v) => sum + v, 0) / value.pctEffects.length;
      effects.push(formatPercent(avgMultiplier));
    }
    if (value.flatEffects.length > 0) {
      const avgFlat = Math.round(value.flatEffects.reduce((sum, v) => sum + v, 0) / value.flatEffects.length);
      effects.push(formatFlatOffset(avgFlat));
    }

    return {
      name,
      effect: effects.length > 0 ? effects.join(" + ") : "조정값 기록 없음",
    };
  });
}

function latestItemAgeDays(items: ValuationItemLike[]): number {
  const createdAtList = items
    .map((item) => item.createdAt)
    .filter((d): d is Date => d instanceof Date && Number.isFinite(d.getTime()));
  if (createdAtList.length === 0) return 999;
  const latest = createdAtList.reduce((best, cur) => (cur.getTime() > best.getTime() ? cur : best));
  return Math.max(0, Math.floor((Date.now() - latest.getTime()) / MS_PER_DAY));
}

export function buildValuationExplanation(
  run: ValuationRunLike & { items: ValuationItemLike[] },
): ValuationExplanation {
  const items = run.items ?? [];
  const sampleSize = items.reduce((sum, item) => sum + (Array.isArray(item.snapshotIds) ? item.snapshotIds.length : 0), 0);

  const fairLow = Math.max(0, safeNumber(run.totalFairLow, 0));
  const fairMid = Math.max(0, safeNumber(run.totalFairMid, 0));
  const fairHigh = Math.max(0, safeNumber(run.totalFairHigh, 0));
  const askingPrice = run.askingPriceKrw ?? null;

  const latestAgeDays = latestItemAgeDays(items);
  const dataAgeWarning = latestAgeDays > 14;
  const verdict = computeVerdict(askingPrice, fairLow, fairMid, fairHigh, sampleSize);
  const verdictReason = buildVerdictReason(verdict, askingPrice, fairLow, fairMid, fairHigh);
  const { confidence, confidenceReason } = buildConfidence(sampleSize, latestAgeDays);
  const appliedRules = mergeAppliedRules(items);

  const warnings: string[] = [];
  if (sampleSize < 3) {
    warnings.push("샘플 3개 미만으로 데이터가 부족합니다.");
  }
  if (sampleSize < 5) {
    warnings.push("샘플 5개 미만으로 통계 안정성이 낮습니다.");
  }
  if (dataAgeWarning) {
    warnings.push("최신 거래 데이터가 14일을 초과해 시세 반영이 늦을 수 있습니다.");
  }
  if (askingPrice === null || askingPrice <= 0) {
    warnings.push("요청가 정보가 없어 비교 정확도가 낮습니다.");
  }
  if (appliedRules.length === 0) {
    warnings.push("적용된 조정 규칙 정보가 없어 설명력이 제한됩니다.");
  }

  return {
    verdict,
    verdictReason,
    confidence,
    confidenceReason,
    sampleSize,
    dataAgeWarning,
    appliedRules,
    warnings,
  };
}
