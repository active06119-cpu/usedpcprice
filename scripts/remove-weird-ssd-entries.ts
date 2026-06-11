import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const targets = await prisma.priceSnapshot.findMany({
    where: {
      OR: [
        {
          part: {
            fullName: {
              contains: "SSD 589GB",
              mode: "insensitive",
            },
          },
        },
        {
          part: {
            category: "SSD",
          },
          priceKrw: {
            lte: 1000,
          },
        },
      ],
    },
    select: {
      id: true,
      priceKrw: true,
      sourceType: true,
      part: {
        select: {
          fullName: true,
          category: true,
        },
      },
    },
  });

  if (targets.length === 0) {
    console.log("삭제 대상 없음");
    return;
  }

  console.log(`삭제 대상 ${targets.length}개`);
  for (const row of targets) {
    console.log(`- ${row.part.fullName} | ₩${row.priceKrw.toLocaleString("ko-KR")} | ${row.sourceType}`);
  }

  const ids = targets.map((row) => row.id);
  const result = await prisma.priceSnapshot.deleteMany({
    where: {
      id: {
        in: ids,
      },
    },
  });

  console.log(`삭제 완료: ${result.count}개`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
