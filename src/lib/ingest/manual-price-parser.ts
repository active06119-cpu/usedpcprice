/**
 * 손수 입력 부품 중고가 파서.
 */
import { shouldPersistUsedPrice } from "../engine/pricing/guards";
import { extractSourceUrl } from "./listing-url";
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

export type ManualRow = { name: string; category: string; price: number; line: number; url?: string | null };
export type ManualBadRow = { line: number; raw: string; reason: string };

const SSD_MODEL =
  /\b(980|990|970|9100|870|860|850|830)\s*(pro|evo|plus)?\b|\b(sn\s*5\d{2}|sn\s*7\d{2}|sn\s*8\d{2}x?)\b|\b(p31|p41|p44|pm9a1|pm981|pm991|t500|t700|t705|t710|mx500|cras)\b/i;

const CHIPSET =
  /\b(a320|b360|b365|b450|b550|x570|a620|b650e|b650|x670e|x670|b840|b850|x870e|x870|h310|h410|h510|h610|h770|h810|b460|b560|b660|b760|b860|z390|z490|z590|z690|z790|z890)\b/i;

const PRICE_ONLY = /^(\d[\d,]*)\s*만\s*원$|^(\d{1,3}(?:,\d{3})+|\d{4,})\s*원$/;
const URL_FRAGMENT = /^[A-Za-z0-9%_\-./?=&#]+$/;

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
  if (/(ssd|nvme)/.test(t) || SSD_MODEL.test(t)) return "SSD";
  if (/(라이젠|ryzen|\bi[3579]\s*-?\d|\bcpu\b|씨피유)/.test(t)) return "CPU";
  if (/(hdd|하드)/.test(t)) return "HDD";
  if (/(메인보드|motherboard|mainboard|\bmobo\b|보드)/.test(t) || CHIPSET.test(t)) return "MOTHERBOARD";
  if (/(파워서플라이|파워|\bpsu\b|\b\d{3,4}\s*w\b)/.test(t)) return "PSU";
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
  if (category === "MOTHERBOARD") {
    const chip = cleaned.match(CHIPSET);
    if (chip) return chip[1].toUpperCase();
  }
  if (category === "PSU") {
    const watt = cleaned.match(/(\d{3,4})\s*w/i);
    if (watt) {
      const n = Number(watt[1]);
      const bucket = n >= 1000 ? 1000 : n >= 850 ? 850 : n >= 750 ? 750 : n >= 650 ? 650 : n >= 550 ? 550 : 500;
      return `PSU ${bucket}W`;
    }
  }
  return cleaned.slice(0, 80);
}

function parseFreeformLine(trimmed: string): { name: string; category: string; price: number; url: string | null } | { reason: string } {
  const url = extractSourceUrl(trimmed);
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
  return { name, category, price, url };
}

function parseTabularLine(trimmed: string): { name: string; category: string; price: number; url: string | null } | { reason: string } {
  const url = extractSourceUrl(trimmed);
  const cells = (trimmed.includes("\t") ? trimmed.split("\t") : trimmed.split(","))
    .map((c) => c.trim())
    .filter((c) => !/^https?:\/\//i.test(c));
  if (cells.length < 3) return { reason: "열이 3개 미만 (부품명/카테고리/가격)" };

  const priceStr = cells[cells.length - 1].replace(/[^0-9]/g, "");
  const category = normalizeCategory(cells[cells.length - 2]);
  const name = cells.slice(0, cells.length - 2).join(" ").replace(/\s+/g, " ").trim();
  const price = Number(priceStr);
  if (!isValidPartName(name)) return { reason: "부품명 이상" };
  if (!category) return { reason: `카테고리 '${cells[cells.length - 2]}' 인식 불가` };
  if (!Number.isFinite(price) || price <= 0) return { reason: "가격 이상" };
  return { name, category, price, url };
}

function coalescePasteLines(lines: string[]): string[] {
  const out: string[] = [];
  let buf = "";
  const flush = () => {
    if (buf) out.push(buf);
    buf = "";
  };

  for (const raw of lines) {
    const trimmed = raw.replace(/^[\-\*•]\s*/, "").trim();
    if (!trimmed || trimmed === "---") continue;

    if (buf.includes("http") && URL_FRAGMENT.test(trimmed) && !/^https?:/i.test(trimmed) && !PRICE_ONLY.test(trimmed)) {
      buf += trimmed;
      continue;
    }
    if (/^https?:\/\//i.test(trimmed)) {
      buf = buf ? `${buf} ${trimmed}` : trimmed;
      if (extractPriceKrw(buf)) flush();
      continue;
    }
    if (PRICE_ONLY.test(trimmed) && buf) {
      buf = `${buf} ${trimmed}`;
      continue;
    }
    if (extractPriceKrw(trimmed) && !inferCategory(trimmed) && buf) {
      buf = `${buf} ${trimmed}`;
      continue;
    }
    flush();
    buf = trimmed;
  }
  flush();
  return out;
}

export function parseManualPriceText(text: string): {
  rows: ManualRow[];
  bad: ManualBadRow[];
} {
  const rawLines = text.replace(/^\uFEFF/, "").split(/\r?\n/);
  const lines = coalescePasteLines(rawLines);
  const rows: ManualRow[] = [];
  const bad: ManualBadRow[] = [];

  lines.forEach((trimmed, idx) => {
    const line = idx + 1;
    if (/name/i.test(trimmed) && /price/i.test(trimmed)) return;

    const looksFreeform =
      !trimmed.includes("\t") && /(\d[\d,]*)\s*만\s*원|(\d{1,3}(?:,\d{3})+|\d{4,})\s*원/.test(trimmed);
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
