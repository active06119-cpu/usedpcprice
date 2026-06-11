import { PartCategory, PrismaClient } from "@prisma/client";

import { isValidUsedPrice } from "../src/lib/engine/pricing/guards";

const prisma = new PrismaClient();

async function main() {
  const rows = await prisma.priceSnapshot.findMany({
    where: {
      part: {
        category: { in: [PartCategory.RAM, PartCategory.SSD] },
      },
    },
    select: {
      id: true,
      priceKrw: true,
      sourceType: true,
      part: {
        select: {
          fullName: true,
          modelName: true,
          category: true,
        },
      },
    },
  });

  const invalidIds: string[] = [];

  for (const row of rows) {
    const partName = row.part.fullName || row.part.modelName;
    if (!isValidUsedPrice(row.priceKrw, partName, row.part.category)) {
      invalidIds.push(row.id);
    }
  }

  if (invalidIds.length === 0) {
    console.log("삭제할 RAM/SSD 스냅샷 없음");
    return;
  }

  const result = await prisma.priceSnapshot.deleteMany({
    where: { id: { in: invalidIds } },
  });

  console.log(`RAM/SSD 이상치 스냅샷 ${result.count}개 삭제`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
