import { PartCategory, PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const MIN_PRICE_BY_CATEGORY: Record<PartCategory, number> = {
  GPU: 20_000,
  CPU: 10_000,
  RAM: 5_000,
  SSD: 5_000,
  HDD: 5_000,
  MOTHERBOARD: 10_000,
  PSU: 5_000,
  CASE: 5_000,
  COOLER: 5_000,
  MONITOR: 10_000,
  OTHER: 1_000,
};

const VALID_RAM_GB = new Set([2, 4, 8, 12, 16, 24, 32, 48, 64, 96, 128, 192, 256]);
const VALID_SSD_GB = new Set([
  60, 64, 120, 128, 240, 250, 256, 480, 500, 512, 960, 1000, 1024, 1920, 2000, 2048, 3840,
  4000, 4096, 7680, 8000, 8192,
]);
const VALID_HDD_GB = new Set([160, 250, 320, 500, 640, 750, 1000, 1500, 2000, 3000, 4000, 6000, 8000]);
const VALID_SSD_TB = new Set([1, 2, 4, 8]);
const VALID_HDD_TB = new Set([1, 2, 3, 4, 6, 8, 10, 12, 14, 16, 18, 20]);

function normalizeName(name: string): string {
  return name.trim().toUpperCase();
}

function parseCapacity(name: string): { gb?: number; tb?: number } {
  const normalized = normalizeName(name);
  const gbMatch = normalized.match(/(\d{1,5})\s*GB/);
  const tbMatch = normalized.match(/(\d{1,2})\s*TB/);
  return {
    gb: gbMatch ? Number(gbMatch[1]) : undefined,
    tb: tbMatch ? Number(tbMatch[1]) : undefined,
  };
}

function hasWeirdName(name: string): boolean {
  const normalized = normalizeName(name);
  if (normalized.length < 3) return true;
  if (/^(N\/A|NA|NULL|NONE|UNKNOWN|UNDEFINED|TEST|DUMMY)$/i.test(normalized)) return true;
  if (/(테스트|샘플|더미|임시)/.test(normalized)) return true;
  if (!/[A-Z0-9]/.test(normalized)) return true;
  return false;
}

function hasWeirdCapacity(category: PartCategory, name: string): boolean {
  const { gb, tb } = parseCapacity(name);

  if (category === "RAM") {
    if (tb !== undefined) return true;
    if (gb !== undefined && !VALID_RAM_GB.has(gb)) return true;
  }

  if (category === "SSD") {
    if (gb !== undefined && !VALID_SSD_GB.has(gb)) return true;
    if (tb !== undefined && !VALID_SSD_TB.has(tb)) return true;
  }

  if (category === "HDD") {
    if (gb !== undefined && !VALID_HDD_GB.has(gb)) return true;
    if (tb !== undefined && !VALID_HDD_TB.has(tb)) return true;
  }

  return false;
}

async function main() {
  const rows = await prisma.priceSnapshot.findMany({
    select: {
      id: true,
      priceKrw: true,
      sourceType: true,
      capturedAt: true,
      part: {
        select: {
          fullName: true,
          category: true,
        },
      },
    },
  });

  const reasonById = new Map<string, string[]>();

  for (const row of rows) {
    const reasons: string[] = [];
    const category = row.part.category;
    const name = row.part.fullName ?? "";

    const min = MIN_PRICE_BY_CATEGORY[category];
    if (row.priceKrw < min) {
      reasons.push(`low_price(<${min})`);
    }

    if (hasWeirdName(name)) {
      reasons.push("weird_name");
    }

    if (hasWeirdCapacity(category, name)) {
      reasons.push("weird_capacity");
    }

    if (reasons.length > 0) {
      reasonById.set(row.id, reasons);
    }
  }

  if (reasonById.size === 0) {
    console.log("삭제 대상 없음");
    return;
  }

  const targets = rows.filter((row) => reasonById.has(row.id));
  const reasonCount = new Map<string, number>();
  for (const reasons of reasonById.values()) {
    for (const reason of reasons) {
      reasonCount.set(reason, (reasonCount.get(reason) ?? 0) + 1);
    }
  }

  console.log(`삭제 대상 총 ${targets.length}개`);
  console.log("사유 요약:");
  for (const [reason, count] of reasonCount.entries()) {
    console.log(`- ${reason}: ${count}개`);
  }

  for (const row of targets.slice(0, 80)) {
    const reasons = reasonById.get(row.id)?.join(",") ?? "";
    console.log(
      `[${row.part.category}] ${row.part.fullName} | ₩${row.priceKrw.toLocaleString("ko-KR")} | ${row.sourceType} | ${reasons}`,
    );
  }
  if (targets.length > 80) {
    console.log(`...외 ${targets.length - 80}개`);
  }

  const result = await prisma.priceSnapshot.deleteMany({
    where: {
      id: {
        in: [...reasonById.keys()],
      },
    },
  });

  console.log(`삭제 완료: ${result.count}개`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
