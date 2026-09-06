/**
 * 손수 입력 부품 중고가 파서.
 * 1) 탭/콤마 3열: `부품명 \t 카테고리 \t 가격`
 * 2) 한 줄: `제목 11만원 https://...`
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

function extractPriceKrw(text: string): number | null {
  const man = text.match(/(\d[\d,]*)\s*만\s*원/);
  if (man) {
    const n = Number(man[1].replace(/,/g, ""));
    if (Number.isFinite(n) && n > 0) return n * 10_000;
  }
  const won = text.match(/(\d{1,3}(?:,\d{3})+|\d{4,})\s*원/);
  if (won) {
    const n = Number(won[1].replace(/,/g, ""));
    if (Number.isFinite(n) && n > 0) return n;
  }
  return null;
}

function inferCategory(title: string): string | null {
  const t = title.toLowerCase();
  if (/(rtx|gtx|\brx\s*\d|라데온|그래픽|지포스)/.test(t)) return "GPU";
  if (/(ddr[345]|램|메모리)/.test(t)) return "RAM";
  if (/(ssd|nvme)/.test(t)) return "SSD";
  if (/(라이젠|ryzen|\bi[3579]\s*-?\d|\bcpu\b|씨피유)/.test(t)) return "CPU";
  if (/(hdd|하드)/.test(t)) return "HDD";
  return null;
}

function normalizePartName(title: string, category: string): string {
  const cleaned = title
    .replace(/https?:\/\/\S+/gi, " ")
    .replace(/(\d[\d,]*)\s*만\s*원/g, " ")
    .replace(/(\d{1,3}(?:,\d{3})+|\d{4,})\s*원/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (category === "GPU") {
    const gpu = cleaned.match(/\b(rtx|gtx|rx)\s*(\d{3,4})\s*(ti|super)?/i);
    if (gpu) {
      const suffix = gpu[3] ? ` ${gpu[3].toUpperCase().replace("TI", "Ti")}` : "";
      return `${gpu[1].toUpperCase()} ${gpu[2]}${suffix}`;
    }
  }
  if (category === "CPU") {
    const ryzen = cleaned.match(/라이젠\s*([3579])?\s*(\d{4})\s*(x3d|[xkf]{0,3})/i);
    if (ryzen) {
      const series = ryzen[1] ? `${ryzen[1]} ` : "";
      return `Ryzen ${series}${ryzen[2]}${(ryzen[3] ?? "").toUpperCase()}`.replace(/\s+/g, " ").trim();
    }
    const intel = cleaned.match(/\b(i[3579])\s*-?\s*(\d{4,5}[a-z]*)/i);
    if (intel) return `${intel[1].toLowerCase()}-${intel[2].toUpperCase()}`;
  }
  if (category === "RAM") {
    const gen = /ddr5/i.test(cleaned) ? "DDR5" : /ddr3/i.test(cleaned) ? "DDR3" : "DDR4";
    const kit = cleaned.match(/(\d+)\s*(?:gb|g)\s*[x×*]\s*(\d+)/i);
    if (kit) return `${gen} ${Number(kit[1]) * Number(kit[2])}GB`;
    const gb = cleaned.match(/(\d+)\s*(?:gb|g)\b/i);
    if (gb) return `${gen} ${gb[1]}GB`;
  }
  if (category === "SSD") {
    const tb = cleaned.match(/(\d+(?:\.\d+)?)\s*tb/i);
    if (tb) return `SSD ${tb[1]}TB`;
    const gb = cleaned.match(/(\d+)\s*(?:gb|g)\b/i);
    if (gb) return `SSD ${gb[1]}GB`;
  }
  return cleaned.slice(0, 80);
}

function parseFreeformLine(trimmed: string): { name: string; category: string; price: number } | { reason: string } {
  const withoutUrl = trimmed.replace(/https?:\/\/\S+/gi, " ").replace(/\s+/g, " ").trim();
  const price = extractPriceKrw(withoutUrl);
  if (price === null) return { reason: "가격 없음" };
  const title = withoutUrl
    .replace(/(\d[\d,]*)\s*만\s*원/g, " ")
    .replace(/(\d{1,3}(?:,\d{3})+|\d{4,})\s*원/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const category = inferCategory(title);
  if (!category) return { reason: "카테고리 추정 실패" };
  const name = normalizePartName(title, category);
  if (!isValidPartName(name)) return { reason: "부품명 이상" };
  return { name, category, price };
}

function parseTabularLine(trimmed: string): { name: string; category: string; price: number } | { reason: string } {
  const cells = (trimmed.includes("\t") ? trimmed.split("\t") : trimmed.split(","))
    .map((c) => c.trim());
  if (cells.length < 3) return { reason: "열이 3개 미만 (부품명/카테고리/가격)" };

  const priceStr = cells[cells.length - 1].replace(/[^0-9]/g, "");
  const category = normalizeCategory(cells[cells.length - 2]);
  const name = cells.slice(0, cells.length - 2).join(" ").replace(/\s+/g, " ").trim();
  const price = Number(priceStr);
  if (!isValidPartName(name)) return { reason: "부품명 이상" };
  if (!category) return { reason: `카테고리 '${cells[cells.length - 2]}' 인식 불가` };
  if (!Number.isFinite(price) || price <= 0) return { reason: "가격 이상" };
  return { name, category, price };
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
    if (trimmed === "---") return;

    const looksFreeform = !trimmed.includes("\t") && /(\d[\d,]*)\s*만\s*원|(\d{1,3}(?:,\d{3})+|\d{4,})\s*원/.test(trimmed);
    const parsed = looksFreeform ? parseFreeformLine(trimmed) : parseTabularLine(trimmed);
    if ("reason" in parsed) {
      bad.push({ line, raw: trimmed, reason: parsed.reason });
      return;
    }
    if (!shouldPersistUsedPrice(parsed.price, parsed.name, parsed.category)) {
      bad.push({
        line,
        raw: trimmed,
        reason: `${parsed.category} 시세 범위 밖(${parsed.price.toLocaleString()})`,
      });
      return;
    }
    rows.push({ ...parsed, line });
  });

  return { rows, bad };
}
