// ============================================================
// scripts/import/sources/worldmemory.ts
// 월드메모리(worldmemory.co.kr) 매입 단가표 → price_snapshots
// ============================================================

import * as cheerio from "cheerio";
import { PartCategory, PartCondition, SnapshotSource } from "@prisma/client";

import { matchProductToPart } from "@/features/parsing/part-matcher";
import { prisma } from "@/lib/prisma";

const START_URL = "https://www.worldmemory.co.kr/price/computer.do";
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";
const MAX_PAGES = 120;
const FETCH_DELAY_MS = 120;

const CATEGORY_BY_CTGRY: Record<string, string> = {
  "8": "CPU",
  "14": "GPU",
  "1": "RAM",
  "4273": "SSD",
  "4277": "HDD",
  "12": "MOTHERBOARD",
  "4166": "PSU",
};

export interface WorldmemoryImportResult {
  inserted: number;
  skipped: number;
  unmatched: number;
  pages: number;
  batchId: string;
}

interface ParsedRow {
  categoryLabel: string;
  productName: string;
  priceText: string;
  pageUrl: string;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isSanePriceForCategory(priceKrw: number, category: string): boolean {
  const limits = {
    GPU: [20_000, 5_000_000],
    CPU: [15_000, 2_000_000],
    RAM: [10_000, 500_000],
    SSD: [10_000, 1_500_000],
    MOTHERBOARD: [20_000, 1_500_000],
    PSU: [15_000, 600_000],
  };
  const range = (limits as Record<string, number[]>)[category] ?? [1_000, 10_000_000];
  const [min, max] = [range[0], range[1]];
  return priceKrw >= min && priceKrw <= max;
}

function normalizePageUrl(href: string, baseUrl: string): string | null {
  if (!href.includes("computer.do")) return null;
  try {
    return new URL(href, baseUrl).href;
  } catch {
    return null;
  }
}

function categoryHintFromUrl(url: string): string | undefined {
  const match = url.match(/ctgry_no1=(\d+)/);
  if (!match) return undefined;
  return CATEGORY_BY_CTGRY[match[1]];
}

function normalizeForMatch(name: string): string {
  return name
    .replace(/랩터\s*/gi, "Core ")
    .replace(/\bI(\d)\s*-?\s*/gi, "i$1-")
    .replace(/\s+/g, " ")
    .trim();
}

function extractBrandFromProductName(productName: string): string {
  const name = productName.trim();

  if (/\b(rtx|gtx)\b/i.test(name)) return "NVIDIA";
  if (/\brx\b/i.test(name)) return "AMD";
  if (/\barc\b/i.test(name)) return "Intel";
  if (/\b(i[3579]|xeon|랩터)\b/i.test(name) || /\bcore\s*i[3579]/i.test(name)) return "Intel";
  if (/ryzen/i.test(name)) return "AMD";

  return name.split(/\s+/)[0] || "UNKNOWN";
}

function extractCategoryFromProductName(
  productName: string,
  urlCategoryHint?: string,
): PartCategory {
  const name = productName.trim();

  if (/\b(rtx|rx|gtx|arc)\b/i.test(name)) return PartCategory.GPU;
  if (/\b(i[3579]|ryzen|xeon|랩터)\b/i.test(name) || /\bcore\s*i[3579]/i.test(name)) {
    return PartCategory.CPU;
  }
  if (/ddr[45]/i.test(name)) return PartCategory.RAM;
  if (/ssd/i.test(name)) return PartCategory.SSD;

  if (urlCategoryHint && urlCategoryHint in PartCategory) {
    return PartCategory[urlCategoryHint as keyof typeof PartCategory];
  }

  return PartCategory.OTHER;
}

async function ensurePartWithAlias(
  productName: string,
  urlCategoryHint?: string,
): Promise<{ partId: string; autoCreated: boolean }> {
  const modelName = productName.trim();
  const brandName = extractBrandFromProductName(modelName);
  const category = extractCategoryFromProductName(modelName, urlCategoryHint);

  const existing = await prisma.part.findUnique({
    where: {
      category_brandName_modelName: {
        category,
        brandName,
        modelName,
      },
    },
    select: { id: true },
  });

  const part = await prisma.part.upsert({
    where: {
      category_brandName_modelName: {
        category,
        brandName,
        modelName,
      },
    },
    update: {},
    create: {
      category,
      brandName,
      modelName,
      fullName: modelName,
      isActive: true,
    },
    select: { id: true },
  });

  const alias = modelName.toLowerCase().replace(/\s+/g, "");
  await prisma.partAlias.upsert({
    where: {
      partId_alias: {
        partId: part.id,
        alias,
      },
    },
    update: {},
    create: {
      partId: part.id,
      alias,
      source: "worldmemory",
    },
  });

  return { partId: part.id, autoCreated: !existing };
}

function parsePriceKrw(priceText: string): number | null {
  const text = priceText.replace(/\s+/g, " ").trim();
  if (!text || /문의/i.test(text)) return null;

  const digits = text.replace(/[^0-9]/g, "");
  const price = Number.parseInt(digits, 10);
  if (!Number.isFinite(price) || price <= 0) return null;
  return price;
}

async function fetchHtml(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: { "User-Agent": USER_AGENT },
  });
  if (!res.ok) {
    throw new Error(`월드메모리 페이지 로드 실패 (${res.status}): ${url}`);
  }
  return res.text();
}

function parseTableRows(html: string, pageUrl: string): ParsedRow[] {
  const $ = cheerio.load(html);
  const rows: ParsedRow[] = [];

  $("table tr").each((_, tr) => {
    const cells = $(tr)
      .find("td")
      .map((__, td) => $(td).text().replace(/\s+/g, " ").trim())
      .get();

    if (cells.length < 3) return;

    rows.push({
      categoryLabel: cells[0],
      productName: cells[1],
      priceText: cells[2],
      pageUrl,
    });
  });

  return rows;
}

async function discoverCategoryUrls(startUrl: string): Promise<string[]> {
  const queue = [startUrl];
  const seen = new Set<string>();
  const urls: string[] = [];

  while (queue.length > 0 && urls.length < MAX_PAGES) {
    const url = queue.shift()!;
    if (seen.has(url)) continue;
    seen.add(url);
    urls.push(url);

    const html = await fetchHtml(url);
    const $ = cheerio.load(html);

    $("a[href*='computer.do']").each((_, el) => {
      const href = $(el).attr("href") ?? "";
      const abs = normalizePageUrl(href, url);
      if (!abs || !abs.includes("worldmemory.co.kr")) return;
      if (!/ctgry_no/.test(abs)) return;
      if (!seen.has(abs)) queue.push(abs);
    });

    await sleep(FETCH_DELAY_MS);
  }

  return urls;
}

export async function runWorldmemoryBuyoutImport(): Promise<WorldmemoryImportResult> {
  const batch = await prisma.importBatch.create({
    data: {
      source: SnapshotSource.BUYOUT,
      status: "RUNNING",
      startedAt: new Date(),
    },
  });

  let inserted = 0;
  let skipped = 0;
  let unmatched = 0;

  try {
    const pageUrls = await discoverCategoryUrls(START_URL);
    const allRows: ParsedRow[] = [];

    for (const pageUrl of pageUrls) {
      const html = await fetchHtml(pageUrl);
      allRows.push(...parseTableRows(html, pageUrl));
      await sleep(FETCH_DELAY_MS);
    }

    for (const row of allRows) {
      const priceKrw = parsePriceKrw(row.priceText);
      if (priceKrw === null) {
        skipped += 1;
        continue;
      }
      if (priceKrw < 10_000) {
        skipped += 1;
        continue;
      }

      const categoryHint = categoryHintFromUrl(row.pageUrl);
      const matchName = normalizeForMatch(row.productName);
      const match = await matchProductToPart(matchName, categoryHint);

      let partId = match.partId;
      let matchMethod = match.method;
      let matchConfidence = match.confidence;

      if (!partId) {
        const ensured = await ensurePartWithAlias(row.productName, categoryHint);
        partId = ensured.partId;
        matchMethod = "auto-created";
        matchConfidence = 0.5;
        if (ensured.autoCreated) unmatched += 1;
      }

      const category = categoryHint ?? "UNKNOWN";
      if (!isSanePriceForCategory(priceKrw, category)) {
        skipped += 1;
        continue;
      }

      await prisma.priceSnapshot.create({
        data: {
          partId,
          batchId: batch.id,
          sourceType: SnapshotSource.BUYOUT,
          sourceUrl: row.pageUrl,
          priceKrw,
          condition: PartCondition.GOOD,
          rawText: JSON.stringify({
            source: "worldmemory",
            categoryLabel: row.categoryLabel,
            productName: row.productName,
            priceText: row.priceText,
            matchMethod,
            matchConfidence,
          }),
        },
      });
      inserted += 1;
    }

    await prisma.importBatch.update({
      where: { id: batch.id },
      data: {
        status: "COMPLETED",
        completedAt: new Date(),
        recordCount: inserted,
      },
    });

    return {
      inserted,
      skipped,
      unmatched,
      pages: pageUrls.length,
      batchId: batch.id,
    };
  } catch (error) {
    await prisma.importBatch.update({
      where: { id: batch.id },
      data: {
        status: "FAILED",
        completedAt: new Date(),
        errorLog: error instanceof Error ? error.message : String(error),
      },
    });
    throw error;
  }
}
