import { buyoutToUsedMid, markupFor } from "../markup";
import { resolveLayeredUsedBand, keepNearBaseline } from "../layered";

describe("markup", () => {
  it("카테고리별 마진을 적용한다", () => {
    expect(markupFor("GPU")).toBe(0.35);
    expect(markupFor("PSU")).toBe(0.5);
    expect(markupFor("알수없음")).toBe(0.5); // 기본값
  });

  it("매입가에 마진을 얹는다", () => {
    expect(buyoutToUsedMid(500_000, "GPU")).toBe(675_000); // ×1.35
    expect(buyoutToUsedMid(200_000, "CPU")).toBe(276_000); // ×1.38
  });
});

describe("resolveLayeredUsedBand — 층 구조", () => {
  it("매입가만 있으면 기준선(매입가×마진)으로 시세를 낸다", () => {
    const band = resolveLayeredUsedBand({ buyoutKrw: 500_000, category: "GPU", listingPrices: [] });
    expect(band?.basis).toBe("buyout");
    expect(band?.usedMid).toBe(675_000); // 500k × 1.35
    expect(band?.usedLow).toBeLessThan(band!.usedMid);
    expect(band?.usedHigh).toBeGreaterThan(band!.usedMid);
  });

  it("실매물이 3건 이상 모이면 기준선을 보정한다", () => {
    const band = resolveLayeredUsedBand({
      buyoutKrw: 500_000, // 기준선 675,000
      category: "GPU",
      listingPrices: [600_000, 610_000, 620_000],
    });
    expect(band?.basis).toBe("buyout+listings");
    expect(band?.listingSampleSize).toBe(3);
    // 기준선(675k)과 매물중앙(610k) 사이로 당겨짐
    expect(band!.usedMid).toBeGreaterThan(610_000);
    expect(band!.usedMid).toBeLessThan(675_000);
  });

  it("안전장치②: 기준선에서 크게 벗어난 이상치 매물은 무시한다", () => {
    const band = resolveLayeredUsedBand({
      buyoutKrw: 500_000, // 기준선 675,000, ±40% = 405k~945k
      category: "GPU",
      listingPrices: [50_000, 60_000, 9_000_000], // 전부 범위 밖(오타·묶음가)
    });
    // 이상치 다 버려짐 → 기준선 유지, 오염 안 됨
    expect(band?.basis).toBe("buyout");
    expect(band?.usedMid).toBe(675_000);
  });

  it("안전장치③: 매물이 3건 미만이면 보정 안 하고 기준선 유지", () => {
    const band = resolveLayeredUsedBand({
      buyoutKrw: 500_000,
      category: "GPU",
      listingPrices: [600_000, 610_000], // 2건뿐
    });
    expect(band?.basis).toBe("buyout");
    expect(band?.usedMid).toBe(675_000);
  });

  it("keepNearBaseline: ±40%(333k~777k) 범위만 남긴다", () => {
    const kept = keepNearBaseline(555_000, [350_000, 555_000, 750_000, 100_000, 2_000_000]);
    expect(kept).toEqual([350_000, 555_000, 750_000]); // 100k·2M만 범위 밖
  });

  it("손수 입력값(manual)이 있으면 매입가·매물 무시하고 최우선", () => {
    const band = resolveLayeredUsedBand({
      buyoutKrw: 500_000,
      category: "GPU",
      listingPrices: [600_000, 610_000, 620_000],
      manualKrw: 700_000,
    });
    expect(band?.basis).toBe("manual");
    expect(band?.usedMid).toBe(700_000);
  });

  it("매입가 없고 매물도 부족하면 시세를 안 낸다(null)", () => {
    expect(
      resolveLayeredUsedBand({ buyoutKrw: null, category: "GPU", listingPrices: [600_000] }),
    ).toBeNull();
  });

  it("신품가 상한: 중고가가 신품가×0.9를 넘으면 눌러준다", () => {
    // 손수 700k 넣어도 신품 600k면 상한 540k
    const band = resolveLayeredUsedBand({
      buyoutKrw: null,
      category: "GPU",
      listingPrices: [],
      manualKrw: 700_000,
      newPriceKrw: 600_000,
    });
    expect(band?.usedMid).toBe(540_000); // 600k × 0.9
    expect(band?.capped).toBe("ceiling");
  });

  it("매입가 하한: 중고가가 매입가보다 낮으면 올려준다", () => {
    const band = resolveLayeredUsedBand({
      buyoutKrw: 200_000,
      category: "GPU",
      listingPrices: [],
      manualKrw: 100_000, // 매입가보다 낮음 → 말이 안 됨
      newPriceKrw: null,
    });
    expect(band?.usedMid).toBe(200_000);
    expect(band?.capped).toBe("floor");
  });

  it("신품가 없으면 상한 없이 그대로", () => {
    const band = resolveLayeredUsedBand({
      buyoutKrw: 500_000,
      category: "GPU",
      listingPrices: [],
      newPriceKrw: null,
    });
    expect(band?.usedMid).toBe(675_000); // 매입 500k × 1.35, 상한 없음
    expect(band?.capped).toBeNull();
  });

  it("매입가 없어도 실매물이 충분하면 매물만으로 낸다", () => {
    const band = resolveLayeredUsedBand({
      buyoutKrw: null,
      category: "GPU",
      listingPrices: [600_000, 610_000, 620_000, 630_000],
    });
    expect(band?.basis).toBe("listings");
  });
});
