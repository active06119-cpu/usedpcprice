export const VERDICT_KO: Record<string, string> = {
  CHEAP: "시세보다 저렴",
  FAIR: "적정가",
  OVERPRICED: "약간 비쌈",
  WAY_OVERPRICED: "많이 비쌈",
  NO_PRICE: "가격 정보 없음",
};

export const VERDICT_STYLE: Record<string, string> = {
  CHEAP: "bg-blue-50 text-blue-800 border-blue-200",
  FAIR: "bg-emerald-50 text-emerald-800 border-emerald-200",
  OVERPRICED: "bg-amber-50 text-amber-800 border-amber-200",
  WAY_OVERPRICED: "bg-red-50 text-red-800 border-red-200",
};

export function verdictFromAsking(asking: number, fairMid: number): { code: string; ko: string } {
  const ratio = asking / fairMid;
  if (ratio <= 0.85) return { code: "CHEAP", ko: VERDICT_KO.CHEAP };
  if (ratio <= 1.05) return { code: "FAIR", ko: VERDICT_KO.FAIR };
  if (ratio <= 1.25) return { code: "OVERPRICED", ko: VERDICT_KO.OVERPRICED };
  return { code: "WAY_OVERPRICED", ko: VERDICT_KO.WAY_OVERPRICED };
}
