// 분석 API 공개 타입. UI/공유 저장이 이 모듈을 사용한다.

export interface AnalyzedPart {
  partId?: string | null;
  partName: string; // 정규화된 부품명
  category: string; // GPU / CPU / RAM 등
  condition: string; // 판매자가 명시한 상태
  conditionKo: string; // 상태 한국어
  approximated: boolean;
  // 시세
  usedMid: number | null; // 중고 권장가 (DB)
  usedLow: number | null; // 중고 하한
  usedHigh: number | null; // 중고 상한
  newPrice: number | null; // 신품 기준가
  priceSource: "db" | "formula" | "ai" | "new" | "validated";
  priceSourceLabel: string;
  sampleSize: number; // DB 샘플 수
  buyoutBasedLow?: boolean; // 하한가가 BUYOUT(업체 매입가) 기준인지
}

export interface AnalyzeResult {
  parts: AnalyzedPart[];
  askingPrice: number | null; // 판매자 요청가
  totalFairLow: number;
  totalFairMid: number;
  totalFairHigh: number;
  verdict: "CHEAP" | "FAIR" | "OVERPRICED" | "WAY_OVERPRICED" | "NO_PRICE";
  verdictKo: string;
  verdictReason: string;
  warnings: string[];
  missingPartsWarning: boolean;
  totalSampleSize: number;
  analysisMode: "used" | "new";
  analysisModeLabel: string;
}
