export type PastedPart = {
  name: string;
  category: "CPU" | "GPU" | "RAM" | "SSD" | "HDD";
};

export type PastedListing = {
  rawText: string;
  title: string;
  sourceUrl: string | null;
  askingPriceKrw: number | null;
  parts: PastedPart[];
};

const CATEGORY_LABEL: Record<string, PastedPart["category"]> = {
  cpu: "CPU",
  씨피유: "CPU",
  프로세서: "CPU",
  vga: "GPU",
  gpu: "GPU",
  그래픽: "GPU",
  그래픽카드: "GPU",
  ram: "RAM",
  램: "RAM",
  메모리: "RAM",
  ssd: "SSD",
  nvme: "SSD",
  hdd: "HDD",
  하드: "HDD",
};

function cleanLine(line: string): string {
  return line.replace(/^[\s\-*\u2022]+/, "").replace(/\s+/g, " ").trim();
}

export function extractAskingPriceKrw(text: string): number | null {
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

export function extractListingUrl(text: string): string | null {
  const match = text.match(/https?:\/\/[^\s\)]+/i);
  if (!match) return null;
  return match[0].replace(/[.,;]+$/, "");
}

function normalizeRamName(raw: string): string {
  const lower = raw.toLowerCase();
  const gen = /ddr5/.test(lower) ? "DDR5" : /ddr3/.test(lower) ? "DDR3" : "DDR4";
  const kit = raw.match(/(\d+)\s*(?:gb|g)\s*[x×]\s*(\d+)/i);
  if (kit) {
    const a = Number(kit[1]);
    const b = Number(kit[2]);
    const total = Math.max(a, b) >= 8 && Math.min(a, b) <= 4 ? a * b : Math.max(a * b, a, b);
    if (total >= 8) return `${gen} ${total}GB`;
  }
  const gb = raw.match(/(\d+)\s*(?:gb|g)\b/i);
  if (gb) return `${gen} ${gb[1]}GB`;
  return raw.replace(/\s+/g, " ").trim();
}

function normalizeGpuName(raw: string): string | null {
  const match = raw.match(/\b(rtx|gtx|rx)\s*(\d{3,4})\s*(ti|super)?/i);
  if (!match) return null;
  const family = match[1].toUpperCase();
  const num = match[2];
  const suffix = match[3] ? ` ${match[3].toUpperCase()}` : "";
  return `${family} ${num}${suffix}`.replace(" SUPER", " SUPER");
}

function normalizeCpuName(raw: string): string | null {
  const ryzen = raw.match(/라이젠\s*([3579])?\s*(\d{4})\s*([xkf]{0,2})/i);
  if (ryzen) {
    const series = ryzen[1] ? `${ryzen[1]} ` : "";
    return `Ryzen ${series}${ryzen[2]}${(ryzen[3] ?? "").toUpperCase()}`.replace(/\s+/g, " ").trim();
  }
  const intel = raw.match(/\b(i[3579])-?(\d{4,5}[a-z]*)/i);
  if (intel) return `${intel[1].toLowerCase()}-${intel[2].toUpperCase()}`;
  return null;
}

function normalizeSsdName(raw: string): string | null {
  const tb = raw.match(/(\d+(?:\.\d+)?)\s*tb/i);
  if (tb) return `SSD ${tb[1]}TB`;
  const gb = raw.match(/(\d+)\s*(?:gb|g)\b/i);
  if (gb) return `SSD ${gb[1]}GB`;
  return null;
}

function stripCompareNoise(text: string): string {
  return text.replace(/와 비슷한|같은 짱성능|유사 성능.{0,12}/g, " ");
}

export function extractPastedParts(text: string): PastedPart[] {
  const cleaned = stripCompareNoise(text);
  const parts: PastedPart[] = [];
  const seen = new Set<string>();

  const push = (part: PastedPart | null) => {
    if (!part?.name) return;
    const key = `${part.category}:${part.name.toLowerCase()}`;
    if (seen.has(key)) return;
    seen.add(key);
    parts.push(part);
  };

  for (const rawLine of cleaned.split(/\n+/)) {
    const line = cleanLine(rawLine);
    const labeled = line.match(/^([A-Za-z가-힣]+)\s*[:：]\s*(.+)$/);
    if (!labeled) continue;
    const category = CATEGORY_LABEL[labeled[1].toLowerCase()];
    if (!category) continue;
    const value = labeled[2];
    if (category === "GPU") push({ category, name: normalizeGpuName(value) ?? value.split(/[(,，]/)[0].trim() });
    else if (category === "CPU") push({ category, name: normalizeCpuName(value) ?? value.split(/[(,，]/)[0].trim() });
    else if (category === "RAM") push({ category, name: normalizeRamName(value) });
    else if (category === "SSD") push({ category, name: normalizeSsdName(value) ?? value.split(/[(,，]/)[0].trim() });
    else push({ category, name: value.split(/[(,，]/)[0].trim() });
  }

  if (!parts.some((part) => part.category === "GPU")) {
    const gpu = normalizeGpuName(cleaned);
    if (gpu) push({ category: "GPU", name: gpu });
  }
  if (!parts.some((part) => part.category === "CPU")) {
    const cpu = normalizeCpuName(cleaned);
    if (cpu) push({ category: "CPU", name: cpu });
  }
  if (!parts.some((part) => part.category === "RAM")) {
    if (/ddr[345]|\d+\s*gb\s*[x×]\s*\d+|\b16\s*gb|\b32\s*gb/i.test(cleaned)) {
      push({ category: "RAM", name: normalizeRamName(cleaned) });
    }
  }

  return parts.filter((part) => part.name.length >= 3 && part.name.length <= 80);
}

export function splitListingBlocks(rawText: string): string[] {
  const text = rawText.replace(/\r\n/g, "\n").trim();
  if (!text) return [];
  if (/\n\s*-{3,}\s*\n/.test(text)) {
    return text.split(/\n\s*-{3,}\s*\n/).map((block) => block.trim()).filter(Boolean);
  }
  if (/\n\s*={3,}\s*\n/.test(text)) {
    return text.split(/\n\s*={3,}\s*\n/).map((block) => block.trim()).filter(Boolean);
  }
  const urlChunks = text.split(/(?=https?:\/\/(?:www\.)?(?:daangn\.com|karrotmarket\.com|bunjang\.co\.kr))/i);
  if (urlChunks.length > 2) {
    const blocks: string[] = [];
    let pending = urlChunks[0].trim();
    for (let i = 1; i < urlChunks.length; i += 1) {
      const chunk = urlChunks[i].trim();
      const nextTextStart = chunk.search(/\n/);
      const urlLine = nextTextStart === -1 ? chunk : chunk.slice(0, nextTextStart);
      const rest = nextTextStart === -1 ? "" : chunk.slice(nextTextStart).trim();
      pending = pending ? `${pending}\n${urlLine}` : urlLine;
      if (rest) {
        blocks.push(pending);
        pending = rest;
      }
    }
    if (pending) blocks.push(pending);
    if (blocks.length > 1) return blocks.map((block) => block.trim()).filter(Boolean);
  }
  return [text];
}

export function parsePastedListing(block: string): PastedListing {
  const rawText = block.trim();
  const lines = rawText.split(/\n+/).map(cleanLine).filter(Boolean);
  const title = lines.find((line) => !/^https?:/i.test(line) && !/원$/.test(line) && !/디지털기기/.test(line)) ?? lines[0] ?? "";
  return {
    rawText,
    title,
    sourceUrl: extractListingUrl(rawText),
    askingPriceKrw: extractAskingPriceKrw(rawText),
    parts: extractPastedParts(rawText),
  };
}

export function parsePastedListings(rawText: string): PastedListing[] {
  return splitListingBlocks(rawText).map(parsePastedListing).filter((row) => row.rawText.length >= 8);
}
