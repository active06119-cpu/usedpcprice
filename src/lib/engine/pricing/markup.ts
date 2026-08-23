/**
 * 매입가 → 중고 시세 변환 마진(markup).
 *
 * 시세 = 매입가 × (1 + 마진).  매입 업체는 시세보다 싸게 사들이므로,
 * 개인 간 중고 거래가는 매입가 위에 아래 마진만큼 얹은 값으로 추정한다.
 *
 * 값은 카테고리별 리스크/회전율 기준. 언제든 이 숫자만 바꾸면 전체 시세가 갱신된다.
 */
// 실제 DB 매입가 vs 중고 시세 비교 결과, 매입가는 시세보다 훨씬 낮아
// 초기 10~25%는 너무 낮았음. 실측에 맞춰 상향(상대 순서는 유지: 회전 빠른 GPU가 최저).
// 이 숫자는 언제든 조정 가능 — 값 하나 바꾸면 해당 카테고리 전체 시세가 갱신됨.
export const CATEGORY_MARKUP: Record<string, number> = {
  GPU: 0.35, // 회전 빠름 — 상대적으로 낮게
  CPU: 0.38, // 수요 안정적이나 세대차 민감
  RAM: 0.4, // 단가 낮아 절대마진 필요
  SSD: 0.4, // 수명/사용량 확인 필요
  MOTHERBOARD: 0.45, // 불량 리스크·호환성 변수 큼
  PSU: 0.5, // 안전 리스크 커서 보수적으로
  CASE: 0.5, // 가치 낮고 검수 효율 낮음
  COOLER: 0.5, // 주변기기류, 보수적으로
};

/** 표에 없는 카테고리(주변기기 등)의 기본 마진 */
export const DEFAULT_MARKUP = 0.5;

export function markupFor(category: string): number {
  return CATEGORY_MARKUP[(category ?? "").toUpperCase()] ?? DEFAULT_MARKUP;
}

/** 매입가에 마진을 얹은 중고 시세(중앙값) */
export function buyoutToUsedMid(buyoutKrw: number, category: string): number {
  return Math.round(buyoutKrw * (1 + markupFor(category)));
}
