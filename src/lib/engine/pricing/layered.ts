/**
 * 층(layer) 구조 중고 시세 산출.
 *
 *   1층 [기준선]  매입가 × (1+마진)   ← 항상 존재, 절대 안 무너짐
 *   2층 [보정]    실제 매물           ← 조건 충족 시에만 기준선을 부드럽게 당김
 *
 * 실매물이 기준선을 오염시키지 못하게 하는 안전장치 4개:
 *   ① (수집 단계에서) 단일 부품만 — 묶음 매물 제외
 *   ② 기준선 ±REFINE_BAND_PCT 밖 매물은 이상치로 버림
 *   ③ 최소 REFINE_MIN_SAMPLES 건 이상 모여야 보정 시작
 *   ④ 대체가 아니라 가중 보정 → 매물 몇 개로 숫자가 튀지 않음
 */
import { buyoutToUsedMid } from "./markup";

/** 기준선에서 이만큼(±) 벗어난 매물은 이상치로 버린다 */
export const REFINE_BAND_PCT = 0.4;
/** 이 개수 이상 모여야 실매물 보정을 시작한다 */
export const REFINE_MIN_SAMPLES = 3;
/** 보정 시 실매물에 주는 가중치 (기준선은 1 - 이 값) */
export const LISTING_WEIGHT = 0.6;
/** 중앙값에서 low/high 밴드를 만들 때의 폭 (±) */
export const BAND_SPREAD = 0.12;
/** 신품가 대비 중고가 상한 비율 (중고가 ≤ 신품가 × 이 값). 과대평가 방지. */
export const NEW_PRICE_CEILING_PCT = 0.9;

export type PriceBasis = "manual" | "buyout" | "buyout+listings" | "listings";

export interface LayeredUsedBand {
  usedLow: number;
  usedMid: number;
  usedHigh: number;
  basis: PriceBasis;
  buyoutKrw: number | null;
  /** 실제로 보정에 반영된 매물 개수 */
  listingSampleSize: number;
  /** 클램프로 값이 눌렸는지 ("ceiling"=신품상한, "floor"=매입바닥) */
  capped?: "ceiling" | "floor" | null;
}

export interface LayeredInput {
  /** 최신 매입가 (없으면 null) */
  buyoutKrw: number | null;
  category: string;
  /** 실제 중고 매물 가격들 (단일 부품, 이미 수집 게이트 통과분) */
  listingPrices: number[];
  /** 손수 입력한 값 (있으면 최우선 — 사람이 authority) */
  manualKrw?: number | null;
  /** 신품 최저가 (있으면 중고 상한 = 신품가 × NEW_PRICE_CEILING_PCT) */
  newPriceKrw?: number | null;
}

export function median(nums: number[]): number {
  if (nums.length === 0) return 0;
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? Math.round((sorted[mid - 1] + sorted[mid]) / 2)
    : sorted[mid];
}

function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor(sorted.length * q)));
  return sorted[idx];
}

/** 중앙값 → low/high 밴드 */
function bandFromMid(mid: number): { usedLow: number; usedHigh: number } {
  return {
    usedLow: Math.round(mid * (1 - BAND_SPREAD)),
    usedHigh: Math.round(mid * (1 + BAND_SPREAD)),
  };
}

/** 기준선 근처(±REFINE_BAND_PCT) 매물만 남긴다 (안전장치 ②) */
export function keepNearBaseline(baselineMid: number, listingPrices: number[]): number[] {
  const low = baselineMid * (1 - REFINE_BAND_PCT);
  const high = baselineMid * (1 + REFINE_BAND_PCT);
  return listingPrices.filter((p) => Number.isFinite(p) && p >= low && p <= high);
}

/**
 * 최종 시세를 "매입가(바닥) ~ 신품가×0.9(천장)" 사이로 가둔다.
 * 우리 추정이 틀려도 실제 두 값 사이를 벗어나지 못하게 하는 안전장치.
 */
function applyBracket(
  raw: LayeredUsedBand,
  buyoutKrw: number | null,
  newPriceKrw: number | null | undefined,
): LayeredUsedBand {
  const ceiling =
    newPriceKrw != null && newPriceKrw > 0 ? Math.round(newPriceKrw * NEW_PRICE_CEILING_PCT) : null;
  const floorRaw = buyoutKrw != null && buyoutKrw > 0 ? buyoutKrw : null;
  // 바닥이 천장보다 높으면(데이터 이상) 천장 우선 → 바닥 무시
  const floor = floorRaw != null && ceiling != null && floorRaw > ceiling ? null : floorRaw;

  const clamp = (v: number): number => {
    let x = v;
    if (ceiling != null) x = Math.min(x, ceiling);
    if (floor != null) x = Math.max(x, floor);
    return x;
  };

  let capped: "ceiling" | "floor" | null = null;
  if (ceiling != null && raw.usedMid > ceiling) capped = "ceiling";
  else if (floor != null && raw.usedMid < floor) capped = "floor";

  return {
    ...raw,
    usedLow: clamp(raw.usedLow),
    usedMid: clamp(raw.usedMid),
    usedHigh: clamp(raw.usedHigh),
    capped,
  };
}

/**
 * 층 구조 시세 산출 (+ 신품가/매입가 클램프).
 * - 매입가 있으면: 기준선 + (조건 충족 시) 실매물 보정
 * - 매입가 없으면: 실매물 ≥ REFINE_MIN_SAMPLES 일 때만 매물만으로 산출, 아니면 null
 * - 마지막에 매입가~신품가×0.9 사이로 클램프
 */
export function resolveLayeredUsedBand(input: LayeredInput): LayeredUsedBand | null {
  const raw = resolveRawBand(input);
  if (!raw) return null;
  return applyBracket(raw, input.buyoutKrw, input.newPriceKrw);
}

function resolveRawBand(input: LayeredInput): LayeredUsedBand | null {
  const { buyoutKrw, category, listingPrices, manualKrw } = input;
  const valid = listingPrices.filter((p) => Number.isFinite(p) && p > 0);

  // 0층: 손수 입력값이 있으면 무조건 최우선 (사람이 authority)
  if (manualKrw != null && manualKrw > 0) {
    return {
      usedMid: manualKrw,
      ...bandFromMid(manualKrw),
      basis: "manual",
      buyoutKrw,
      listingSampleSize: 0,
    };
  }

  // 1층: 매입가 기준선
  if (buyoutKrw != null && buyoutKrw > 0) {
    const baselineMid = buyoutToUsedMid(buyoutKrw, category);
    const near = keepNearBaseline(baselineMid, valid); // 안전장치 ②

    // 2층: 실매물 보정 (안전장치 ③④)
    if (near.length >= REFINE_MIN_SAMPLES) {
      const refinedMid = Math.round(
        baselineMid * (1 - LISTING_WEIGHT) + median(near) * LISTING_WEIGHT,
      );
      return {
        usedMid: refinedMid,
        ...bandFromMid(refinedMid),
        basis: "buyout+listings",
        buyoutKrw,
        listingSampleSize: near.length,
      };
    }

    return {
      usedMid: baselineMid,
      ...bandFromMid(baselineMid),
      basis: "buyout",
      buyoutKrw,
      listingSampleSize: 0,
    };
  }

  // 매입가 없음: 실매물만으로 (충분할 때만)
  if (valid.length >= REFINE_MIN_SAMPLES) {
    const sorted = [...valid].sort((a, b) => a - b);
    const mid = quantile(sorted, 0.5);
    return {
      usedLow: quantile(sorted, 0.1),
      usedMid: mid,
      usedHigh: quantile(sorted, 0.9),
      basis: "listings",
      buyoutKrw: null,
      listingSampleSize: valid.length,
    };
  }

  return null;
}

/** 화면 표시용 근거 문구 */
export function basisLabel(band: LayeredUsedBand): string {
  const base = (() => {
    switch (band.basis) {
      case "manual":
        return "직접 입력값";
      case "buyout":
        return "매입가 기반";
      case "buyout+listings":
        return `매입가 기반 · 실거래 ${band.listingSampleSize}건 반영`;
      case "listings":
        return `실거래 ${band.listingSampleSize}건 기반`;
    }
  })();
  if (band.capped === "ceiling") return `${base} · 신품가 상한 적용`;
  if (band.capped === "floor") return `${base} · 매입가 하한 적용`;
  return base;
}
