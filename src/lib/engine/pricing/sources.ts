/**
 * SnapshotSource 역할
 *
 * BUYOUT         → 하한가 참고만, 절대 시세 계산에 포함 금지
 * NAVER_SHOPPING → 신품가만
 * BUNJANG/DAANGN/JOONGNA/MANUAL → 중고 시세
 * SEED           → 초기값, 실제 데이터 쌓이면 bands.ts에서 가중치 자동 감소
 */

export const BUYOUT_SOURCE = "BUYOUT" as const;
export const SEED_SOURCE = "SEED" as const;

export const USED_MARKET_SOURCES = ["BUNJANG", "DAANGN", "JOONGNA", "MANUAL"] as const;

export const NEW_MARKET_SOURCES = ["NAVER_SHOPPING"] as const;

/** 중고 밴드(p10/mid/high) 계산에 절대 포함하지 않는 소스 */
export const EXCLUDED_FROM_USED_BAND = [BUYOUT_SOURCE, ...NEW_MARKET_SOURCES] as const;

export function isUsedMarketSource(sourceType: string): boolean {
  return (USED_MARKET_SOURCES as readonly string[]).includes(sourceType);
}

export function isNewMarketSource(sourceType: string): boolean {
  return (NEW_MARKET_SOURCES as readonly string[]).includes(sourceType);
}

/** Prisma where: 중고 시세 조회 (BUYOUT·신품 소스 제외, SEED는 가중치 처리용 포함) */
export function usedMarketSourceFilter(_category?: string) {
  return {
    in: [...USED_MARKET_SOURCES, SEED_SOURCE] as any,
    notIn: [BUYOUT_SOURCE, ...NEW_MARKET_SOURCES] as any,
  };
}

/** Prisma where: 신품가 조회 (NAVER_SHOPPING만) */
export function newMarketSourceFilter() {
  return {
    in: [...NEW_MARKET_SOURCES] as any,
  };
}
