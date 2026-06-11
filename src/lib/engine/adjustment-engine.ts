import type { AdjustmentRule, PartCondition, ValuationType } from "@prisma/client";

export type AppliedAdjustment = {
  ruleId: string;
  ruleName: string;
  multiplierApplied: number | null;
  flatOffsetApplied: number | null;
  priceBefore: number;
  priceAfter: number;
};

type AdjustmentContext = {
  condition: PartCondition;
  releaseYear?: number;
  runType: ValuationType;
};

function evalReleaseAgeCondition(releaseAge: number | null, conditionValue: string): boolean {
  if (releaseAge === null) return false;

  const expr = conditionValue.trim();
  const m = expr.match(/^(>=|<=|>|<|=)?\s*(\d+)$/);
  if (!m) return false;

  const op = m[1] ?? "=";
  const target = Number(m[2]);

  if (op === ">=") return releaseAge >= target;
  if (op === "<=") return releaseAge <= target;
  if (op === ">") return releaseAge > target;
  if (op === "<") return releaseAge < target;
  return releaseAge === target;
}

function isRuleMatched(rule: AdjustmentRule, context: AdjustmentContext): boolean {
  if (!rule.conditionKey || !rule.conditionValue) return true;

  const key = rule.conditionKey.trim();
  const value = rule.conditionValue.trim();
  const releaseAge = context.releaseYear ? new Date().getFullYear() - context.releaseYear : null;

  if (key === "condition") return context.condition === value;
  if (key === "runType") return context.runType === value;
  if (key === "releaseAge") return evalReleaseAgeCondition(releaseAge, value);
  if (key === "releaseYear") {
    if (!context.releaseYear) return false;
    return String(context.releaseYear) === value;
  }

  return false;
}

export function applyAdjustments(
  basePrice: number,
  rules: AdjustmentRule[],
  context: AdjustmentContext,
): { adjustedPrice: number; applied: AppliedAdjustment[] } {
  const sorted = rules.slice().sort((a, b) => a.priority - b.priority);
  const applied: AppliedAdjustment[] = [];
  let currentPrice = Math.max(0, basePrice);

  for (const rule of sorted) {
    if (!rule.isActive) continue;
    if (!isRuleMatched(rule, context)) continue;

    const priceBefore = currentPrice;
    const multiplierApplied = typeof rule.multiplier === "number" ? rule.multiplier : null;
    const flatOffsetApplied = typeof rule.flatOffsetKrw === "number" ? rule.flatOffsetKrw : null;

    if (multiplierApplied !== null) {
      currentPrice = Math.round(currentPrice * multiplierApplied);
    }
    if (flatOffsetApplied !== null) {
      currentPrice += flatOffsetApplied;
    }

    currentPrice = Math.max(0, currentPrice);

    applied.push({
      ruleId: rule.id,
      ruleName: rule.name,
      multiplierApplied,
      flatOffsetApplied,
      priceBefore,
      priceAfter: currentPrice,
    });
  }

  return {
    adjustedPrice: currentPrice,
    applied,
  };
}
