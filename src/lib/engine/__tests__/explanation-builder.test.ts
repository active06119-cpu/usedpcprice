import { buildValuationExplanation } from "@/lib/engine/explanation-builder";

describe("buildValuationExplanation", () => {
  it("요청가가 fairLow 이하면 GOOD_DEAL", () => {
    const now = new Date();
    const result = buildValuationExplanation({
      askingPriceKrw: 90_000,
      totalFairLow: 100_000,
      totalFairMid: 120_000,
      totalFairHigh: 140_000,
      items: [
        { snapshotIds: ["1", "2", "3"], adjustmentsApplied: [], createdAt: now },
      ],
    });
    expect(result.verdict).toBe("GOOD_DEAL");
  });

  it("sampleSize < 3이면 RISKY", () => {
    const result = buildValuationExplanation({
      askingPriceKrw: 80_000,
      totalFairLow: 70_000,
      totalFairMid: 90_000,
      totalFairHigh: 110_000,
      items: [{ snapshotIds: ["a"], adjustmentsApplied: [], createdAt: new Date() }],
    });
    expect(result.sampleSize).toBe(1);
    expect(result.verdict).toBe("RISKY");
  });

  it("dataAgeWarning: 14일 초과 스냅샷", () => {
    const old = new Date(Date.now() - 15 * 24 * 60 * 60 * 1000);
    const result = buildValuationExplanation({
      askingPriceKrw: 100_000,
      totalFairLow: 90_000,
      totalFairMid: 100_000,
      totalFairHigh: 120_000,
      items: [{ snapshotIds: ["1", "2", "3", "4", "5"], adjustmentsApplied: [], createdAt: old }],
    });
    expect(result.dataAgeWarning).toBe(true);
  });

  it("confidence LOW 조건 확인", () => {
    const old = new Date(Date.now() - 20 * 24 * 60 * 60 * 1000);
    const result = buildValuationExplanation({
      askingPriceKrw: 150_000,
      totalFairLow: 120_000,
      totalFairMid: 140_000,
      totalFairHigh: 170_000,
      items: [{ snapshotIds: ["1", "2", "3", "4"], adjustmentsApplied: [], createdAt: old }],
    });
    expect(result.sampleSize).toBe(4);
    expect(result.confidence).toBe("LOW");
  });
});
