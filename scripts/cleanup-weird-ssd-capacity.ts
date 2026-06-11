import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const VALID_GB = new Set([
  60, 64, 120, 128, 240, 250, 256, 480, 500, 512, 960, 1000, 1024, 1920, 2000, 2048, 3840,
  4000, 4096, 7680, 8000, 8192,
]);

const VALID_TB = new Set([1, 2, 4, 8]);

function isWeirdSsdCapacityName(name: string): boolean {
  const normalized = name.toUpperCase();

  // "589GB" 같은 GB 표기 검사
  const gbMatch = normalized.match(/(\d{2,5})\s*GB/);
  if (gbMatch) {
    const gb = Number(gbMatch[1]);
    if (!VALID_GB.has(gb)) return true;
  }

  // "3TB" 같은 TB 표기 검사
  const tbMatch = normalized.match(/(\d{1,2})\s*TB/);
  if (tbMatch) {
    const tb = Number(tbMatch[1]);
    if (!VALID_TB.has(tb)) return true;
  }

  // SSD인데 GB/TB가 전혀 없는 이상한 이름은 일단 제외하지 않음(오탐 방지)
  return false;
}

async function main() {
  const snapshots = await prisma.priceSnapshot.findMany({
    where: {
      part: { category: "SSD" },
    },
    select: {
      id: true,
      priceKrw: true,
      sourceType: true,
      part: {
        select: {
          fullName: true,
        },
      },
    },
  });

  const targets = snapshots.filter((row) => isWeirdSsdCapacityName(row.part.fullName));

  if (targets.length === 0) {
    console.log("삭제 대상 없음");
    return;
  }

  console.log(`삭제 대상 ${targets.length}개`);
  for (const row of targets.slice(0, 50)) {
    console.log(`- ${row.part.fullName} | ₩${row.priceKrw.toLocaleString("ko-KR")} | ${row.sourceType}`);
  }
  if (targets.length > 50) {
    console.log(`...외 ${targets.length - 50}개`);
  }

  const result = await prisma.priceSnapshot.deleteMany({
    where: {
      id: {
        in: targets.map((row) => row.id),
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
