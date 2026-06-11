// ============================================================
// scripts/import/batch-runner.ts
// Twice-daily cron script: npm run import:batch
// Add to package.json scripts:
//   "import:batch": "ts-node scripts/import/batch-runner.ts"
// Cron: 0 9,21 * * * (9am and 9pm KST)
// ============================================================

import "dotenv/config";

import { PrismaClient, BatchStatus, SnapshotSource } from "@prisma/client";
import type { RawSnapshot } from "./import/types";

import { runBunjangImport } from "./import/bunjang";
import { runDanawaImport } from "./import/danawa";
import { runDaangnImport } from "./import/daangn";
import { runNaverShoppingImport } from "./import/naver-shopping";

const prisma = new PrismaClient();
const ENABLE_DAANGN_IMPORT = process.env.ENABLE_DAANGN_IMPORT === "true";

// ============================================================
// BATCH RUNNER ARCHITECTURE
//
// This script is intentionally thin — it only manages ImportBatch
// lifecycle. Actual scrapers/importers are plugged in via the
// importers map below. Each importer is responsible for:
//   1. Fetching raw data from its source
//   2. Returning an array of RawSnapshot objects
//   3. The runner handles DB insertion and error capture
//
// In v1 MVP, importers may be stubs returning empty arrays until
// real scrapers are built. That's fine — seed data covers v1.
// ============================================================

type SourceRunner = (batchId: string) => Promise<number>;
type BatchResult = {
  source: SnapshotSource;
  status: "success" | "failed" | "skipped";
  inserted: number;
  filtered: number;
  attempts: number;
  durationMs: number;
  error?: string;
};
type QualitySnapshot = RawSnapshot & {
  partName?: string;
};

const sourceRunners: Partial<Record<SnapshotSource, SourceRunner>> = {
  [SnapshotSource.DANAWA]: runDanawaImport,
  [SnapshotSource.BUNJANG]: runBunjangImport,
  [SnapshotSource.DAANGN]: runDaangnImport,
  [SnapshotSource.NAVER_SHOPPING]: runNaverShoppingImport,
};

const CATEGORY_PRICE_RANGE: Record<string, [number, number]> = {
  GPU: [20_000, 5_000_000],
  CPU: [10_000, 2_500_000],
  RAM: [5_000, 800_000],
  SSD: [5_000, 1_500_000],
  HDD: [5_000, 700_000],
  MOTHERBOARD: [10_000, 2_000_000],
  PSU: [5_000, 1_000_000],
  CASE: [5_000, 700_000],
  COOLER: [5_000, 500_000],
  MONITOR: [10_000, 5_000_000],
  OTHER: [1_000, 20_000_000],
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = values.slice().sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) return Math.round((sorted[mid - 1] + sorted[mid]) / 2);
  return sorted[mid];
}

function formatDuration(ms: number): string {
  const sec = Math.floor(ms / 1000);
  const min = Math.floor(sec / 60);
  const remainSec = sec % 60;
  return `${min}분 ${remainSec}초`;
}

export async function runWithRetry<T>(
  fn: () => Promise<T>,
  maxAttempts = 3,
  delayMs = 2000,
): Promise<{ value: T; attempts: number }> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const value = await fn();
      return { value, attempts: attempt };
    } catch (error) {
      lastError = error;
      if (attempt >= maxAttempts) break;
      const backoff = delayMs * 2 ** (attempt - 1);
      console.warn(`  ⚠️ retry ${attempt}/${maxAttempts - 1} after ${backoff}ms`);
      await sleep(backoff);
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

export function filterLowQualitySnapshots(
  items: RawSnapshot[],
  category: string,
): {
  passed: RawSnapshot[];
  rejected: { item: RawSnapshot; reason: string }[];
} {
  const [minPrice, maxPrice] = CATEGORY_PRICE_RANGE[category] ?? CATEGORY_PRICE_RANGE.OTHER;
  const priceMedian = median(items.map((item) => item.priceKrw));
  const sourceUrlSeen = new Set<string>();
  const passed: RawSnapshot[] = [];
  const rejected: Array<{ item: RawSnapshot; reason: string }> = [];

  for (const item of items as QualitySnapshot[]) {
    const itemLabel = item.partName ?? item.partId;
    const priceText = `₩${item.priceKrw.toLocaleString("ko-KR")}`;

    const normalizedUrl = (item.sourceUrl ?? "").trim();
    if (item.priceKrw < minPrice || item.priceKrw > maxPrice) {
      const reason = `가격 범위 초과 (${priceText})`;
      rejected.push({ item, reason });
      console.log(`[FILTERED] ${itemLabel} — 이유: ${reason}`);
      continue;
    }

    if (normalizedUrl) {
      if (sourceUrlSeen.has(normalizedUrl)) {
        const reason = "오늘 중복 가격";
        rejected.push({ item, reason });
        console.log(`[FILTERED] ${itemLabel} — 이유: ${reason}`);
        continue;
      }
      sourceUrlSeen.add(normalizedUrl);
    }

    if (priceMedian > 0 && item.priceKrw > priceMedian * 3) {
      const reason = `중앙값 대비 3배 이상 이상치 (${priceText})`;
      rejected.push({ item, reason });
      console.log(`[FILTERED] ${itemLabel} — 이유: ${reason}`);
      continue;
    }

    passed.push(item);
  }

  return { passed, rejected };
}

async function applyQualityFilterForBatch(batchId: string): Promise<number> {
  const snapshots = await prisma.priceSnapshot.findMany({
    where: { batchId },
    include: {
      part: {
        select: { category: true, fullName: true },
      },
    },
  });
  if (snapshots.length === 0) return 0;

  const grouped = new Map<string, Array<{ id: string; raw: QualitySnapshot }>>();
  for (const s of snapshots) {
    const category = s.part.category;
    const raw: QualitySnapshot = {
      partId: s.partId,
      sourceUrl: s.sourceUrl,
      priceKrw: s.priceKrw,
      condition: s.condition,
      rawText: s.rawText,
      partName: s.part.fullName,
    };
    const list = grouped.get(category) ?? [];
    list.push({ id: s.id, raw });
    grouped.set(category, list);
  }

  const rejectedIds: string[] = [];

  for (const [category, entries] of grouped) {
    const idByObject = new Map<QualitySnapshot, string>();
    const items = entries.map((entry) => {
      idByObject.set(entry.raw, entry.id);
      return entry.raw;
    });
    const { rejected } = filterLowQualitySnapshots(items, category);
    for (const reject of rejected) {
      const id = idByObject.get(reject.item);
      if (id) rejectedIds.push(id);
    }
  }

  if (rejectedIds.length > 0) {
    await prisma.priceSnapshot.deleteMany({
      where: { id: { in: rejectedIds } },
    });
  }

  return rejectedIds.length;
}

function printBatchReport(results: BatchResult[]): void {
  for (const result of results) {
    if (result.status === "success") {
      console.log(
        `✅ ${result.source}: ${result.inserted}개 삽입, ${result.filtered}개 필터링`,
      );
      continue;
    }

    if (result.status === "skipped") {
      console.log(`✅ ${result.source}: 0개 (importer 미등록)`);
      continue;
    }

    console.log(
      `❌ ${result.source}: 실패 (${result.attempts}회 재시도) — "${result.error ?? "unknown"}"`,
    );
  }

  const totalMs = results.reduce((sum, result) => sum + result.durationMs, 0);
  console.log(`총 소요시간: ${formatDuration(totalMs)}`);
}

async function runSource(source: SnapshotSource): Promise<BatchResult> {
  const batch = await prisma.importBatch.create({
    data: {
      source,
      status: BatchStatus.PENDING,
    },
  });

  const start = Date.now();
  const runner = sourceRunners[source];

  if (!runner) {
    await prisma.importBatch.update({
      where: { id: batch.id },
      data: {
        status: BatchStatus.COMPLETED,
        completedAt: new Date(),
        recordCount: 0,
        errorLog: "No importer registered for this source",
      },
    });
    return {
      source,
      status: "skipped",
      inserted: 0,
      filtered: 0,
      attempts: 0,
      durationMs: Date.now() - start,
    };
  }

  await prisma.importBatch.update({
    where: { id: batch.id },
    data: { status: BatchStatus.RUNNING, startedAt: new Date() },
  });

  try {
    const { value: insertedBeforeFilter, attempts } = await runWithRetry(
      () => runner(batch.id),
      3,
      2000,
    );
    const filteredCount = await applyQualityFilterForBatch(batch.id);
    const insertedAfterFilter = Math.max(0, insertedBeforeFilter - filteredCount);

    await prisma.importBatch.update({
      where: { id: batch.id },
      data: {
        status: BatchStatus.COMPLETED,
        completedAt: new Date(),
        recordCount: insertedAfterFilter,
      },
    });

    return {
      source,
      status: "success",
      inserted: insertedAfterFilter,
      filtered: filteredCount,
      attempts,
      durationMs: Date.now() - start,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    await prisma.importBatch.update({
      where: { id: batch.id },
      data: {
        status: BatchStatus.FAILED,
        completedAt: new Date(),
        errorLog: message,
      },
    });
    return {
      source,
      status: "failed",
      inserted: 0,
      filtered: 0,
      attempts: 3,
      durationMs: Date.now() - start,
      error: message,
    };
  }
}

async function main() {
  console.log(`🔄 Import batch started at ${new Date().toISOString()}`);
  if (!ENABLE_DAANGN_IMPORT) {
    console.log(
      "  ℹ️ [DAANGN] disabled by default (set ENABLE_DAANGN_IMPORT=true to enable)",
    );
  }

  const sources: SnapshotSource[] = [
    SnapshotSource.NAVER_SHOPPING, // 네이버 쇼핑 (신품 API, 빠름)
    SnapshotSource.BUNJANG, // 번개장터 (XHR API)
    SnapshotSource.DANAWA, // 다나와 (Playwright)
  ];
  if (ENABLE_DAANGN_IMPORT) {
    // 당근은 현재 접근/노출 정책 변경 가능성이 있어 기본 비활성화.
    sources.splice(2, 0, SnapshotSource.DAANGN);
  }

  const results: BatchResult[] = [];
  for (const source of sources) {
    const result = await runSource(source);
    results.push(result);
  }
  printBatchReport(results);
  console.log("✅ All batches complete");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
