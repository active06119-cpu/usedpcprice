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

async function main() {
  let totalDeleted = 0;

  for (const [category, minPrice] of Object.entries(MIN_PRICE_BY_CATEGORY)) {
    const count = await prisma.priceSnapshot.count({
      where: {
        part: {
          category: category as PartCategory,
        },
        priceKrw: {
          lt: minPrice,
        },
      },
    });

    if (count === 0) continue;

    const result = await prisma.priceSnapshot.deleteMany({
      where: {
        part: {
          category: category as PartCategory,
        },
        priceKrw: {
          lt: minPrice,
        },
      },
    });

    totalDeleted += result.count;
    console.log(`[${category}] ${result.count}개 삭제 (기준: < ${minPrice.toLocaleString("ko-KR")}원)`);
  }

  console.log(`총 삭제: ${totalDeleted}개`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
