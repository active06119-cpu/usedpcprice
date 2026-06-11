import type { AdjustmentRule, PartCondition, ValuationType } from "@prisma/client";

import { applyAdjustments } from "@/lib/engine/adjustment-engine";

function rule(overrides: Partial<AdjustmentRule>): AdjustmentRule {
  return {
    id: "r-1",
    name: "rule",
    category: null,
    ruleType: "CUSTOM",
    conditionKey: null,
    conditionValue: null,
    multiplier: null,
    flatOffsetKrw: null,
    priority: 50,
    isActive: true,
    description: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

const baseContext = {
  condition: "GOOD" as PartCondition,
  runType: "SINGLE_PART" as ValuationType,
};

describe("applyAdjustments", () => {
  it("조건 POOR 적용 시 60% 할인 확인", () => {
    const rules = [
      rule({
        id: "poor-60",
        name: "condition poor",
        conditionKey: "condition",
        conditionValue: "POOR",
        multiplier: 0.4,
        priority: 1,
      }),
    ];
    const result = applyAdjustments(100_000, rules, {
      ...baseContext,
      condition: "POOR",
    });
    expect(result.adjustedPrice).toBe(40_000);
    expect(result.applied).toHaveLength(1);
  });

  it("출시 6년 이상 부품 45% 추가 할인", () => {
    const nowYear = new Date().getFullYear();
    const rules = [
      rule({
        id: "age-6y",
        name: "age discount",
        conditionKey: "releaseAge",
        conditionValue: ">= 6",
        multiplier: 0.55,
      }),
    ];
    const result = applyAdjustments(200_000, rules, {
      ...baseContext,
      releaseYear: nowYear - 6,
    });
    expect(result.adjustedPrice).toBe(110_000);
  });

  it("풀시스템(FULL_PC) 번들 5% 할인", () => {
    const rules = [
      rule({
        id: "bundle-5",
        name: "bundle",
        conditionKey: "runType",
        conditionValue: "FULL_PC",
        multiplier: 0.95,
      }),
    ];
    const result = applyAdjustments(300_000, rules, {
      ...baseContext,
      runType: "FULL_PC",
    });
    expect(result.adjustedPrice).toBe(285_000);
  });

  it("규칙 없을 때 basePrice 그대로 반환", () => {
    const result = applyAdjustments(123_456, [], baseContext);
    expect(result.adjustedPrice).toBe(123_456);
    expect(result.applied).toEqual([]);
  });

  it("음수 가격 방지 (최소 0원)", () => {
    const rules = [
      rule({
        id: "flat-minus",
        name: "minus",
        flatOffsetKrw: -500_000,
      }),
    ];
    const result = applyAdjustments(100_000, rules, baseContext);
    expect(result.adjustedPrice).toBe(0);
    expect(result.applied[0].priceAfter).toBe(0);
  });
});
