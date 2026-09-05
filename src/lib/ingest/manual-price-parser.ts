/**
 * 손수 입력한 부품 중고가 텍스트 파서 (서랍 1: 부품 가격표).
 *
 * 엑셀에서 복사→붙여넣기하면 열이 "탭"으로 구분되고, CSV는 "콤마"로 구분된다.
 * 둘 다 지원한다. 한 줄 = 부품 하나: `부품명 <탭/콤마> 카테고리 <탭/콤마> 가격`
 *
 * 서버(API 라우트)·스크립트 양쪽에서 쓰는 순수 파서 (prisma 의존 없음).
 */
import { shouldPersistUsedPrice } from "../engine/pricing/guards";
import { isValidPartName } from "./used-listing-guard";

export const MANUAL_CATEGORIES = [
  "GPU", "CPU", "RAM", "SSD", "HDD", "MOTHERBOARD", "PSU", "CASE", "COOLER", "MONITOR", "OTHER",
] as const;

const CATEGORY_SET = new Set<string>(MANUAL_CATEGORIES);

const CATEGORY_ALIASES: Record<string, string> = {
  그래픽카드: "GPU", 그래픽: "GPU", VGA: "GPU", 지포스: "GPU",
  프로세서: "CPU", 씨피유: "CPU",
  램: "RAM", 메모리: "RAM",
  에스에스디: "SSD",
  하드: "HDD", 하드디스크: "HDD",
  메인보드: "MOTHERBOARD", 보드: "MOTHERBOARD", MB: "MOTHERBOARD", MAINBOARD: "MOTHERBOARD",
  파워: "PSU", 파워서플라이: "PSU",
  케이스: "CASE",
  쿨러: "COOLER", 수냉: "COOLER",
  모니터: "MONITOR",
  기타: "OTHER",
};

export type ManualRow = { name: string; category: string; price: number; line: number };
export type ManualBadRow = { line: number; raw: string; reason: string };

function normalizeCategory(raw: string): string | null {
  const up = raw.toUpperCase();
  if (CATEGORY_SET.has(up)) return up;
  if (CATEGORY_ALIASES[raw]) return CATEGORY_ALIASES[raw];
  if (CATEGORY_ALIASES[up]) return CATEGORY_ALIASES[up];
  return null;
}

export function parseManualPriceText(text: string): {
  rows: ManualRow[];
  bad: ManualBadRow[];
} {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/);
  const rows: ManualRow[] = [];
  const bad: ManualBadRow[] = [];

  lines.forEach((raw, idx) => {
    const line = idx + 1;
    const trimmed = raw.trim();
    if (!trimmed) return;
    if (/name/i.test(trimmed) && /price/i.test(trimmed)) return;

    const cells = (trimmed.includes("\t") ? trimmed.split("\t") : trimmed.split(","))
      .map((c) => c.trim());
    if (cells.length < 3) {
      bad.push({ line, raw: trimmed, reason: "열이 3개 미만 (부품명/카테고리/가격)" });
      return;
    }

    const priceStr = cells[cells.length - 1].replace(/[^0-9]/g, "");
    const category = normalizeCategory(cells[cells.length - 2]);
    const name = cells.slice(0, cells.length - 2).join(" ").replace(/\s+/g, " ").trim();
    const price = Number(priceStr);

    if (!isValidPartName(name)) {
      bad.push({ line, raw: trimmed, reason: "부품명 이상" });
      return;
    }
    if (!category) {
      bad.push({ line, raw: trimmed, reason: `카테고리 '${cells[cells.length - 2]}' 인식 불가` });
      return;
    }
    if (!Number.isFinite(price) || price <= 0) {
      bad.push({ line, raw: trimmed, reason: "가격 이상" });
      return;
    }
    if (!shouldPersistUsedPrice(price, name, category)) {
      bad.push({ line, raw: trimmed, reason: `${category} 시세 범위 밖(${price.toLocaleString()})` });
      return;
    }

    rows.push({ name, category, price, line });
  });

  return { rows, bad };
}
