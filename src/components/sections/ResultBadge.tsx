import { Badge } from "@/components/ui/badge";

type ResultBadgeProps = {
  value: "cheap" | "fair" | "expensive" | "risky";
};

export type Verdict = "GOOD_DEAL" | "FAIR" | "SLIGHTLY_OVERPRICED" | "OVERPRICED" | "RISKY";

const labelMap: Record<ResultBadgeProps["value"], string> = {
  cheap: "저렴",
  fair: "적정",
  expensive: "비쌈",
  risky: "위험",
};

const classMap: Record<ResultBadgeProps["value"], string> = {
  cheap: "border-emerald-200 bg-emerald-50 text-emerald-700",
  fair: "border-blue-200 bg-blue-50 text-blue-700",
  expensive: "border-amber-200 bg-amber-50 text-amber-700",
  risky: "border-red-200 bg-red-50 text-red-700",
};

export function ResultBadge({ value }: ResultBadgeProps) {
  return <Badge className={classMap[value]}>{labelMap[value]}</Badge>;
}

export function verdictToBadgeValue(verdict: Verdict): ResultBadgeProps["value"] {
  if (verdict === "GOOD_DEAL") return "cheap";
  if (verdict === "FAIR") return "fair";
  if (verdict === "SLIGHTLY_OVERPRICED" || verdict === "OVERPRICED") return "expensive";
  return "risky";
}
