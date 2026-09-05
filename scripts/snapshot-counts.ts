import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const [parts, snapshots, latestBatch] = await Promise.all([
    prisma.part.count(),
    prisma.priceSnapshot.count(),
    prisma.importBatch.findFirst({
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        source: true,
        status: true,
        recordCount: true,
        createdAt: true,
        completedAt: true,
        errorLog: true,
      },
    }),
  ]);

  const payload = {
    ok: true,
    parts,
    snapshots,
    latestBatch,
    checkedAt: new Date().toISOString(),
  };
  console.log(JSON.stringify(payload, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
