import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const OEM_BRANDS = ["MSI", "ASUS", "GIGABYTE", "ZOTAC", "Palit", "XFX"] as const;

async function main() {
  const parts = await prisma.part.findMany({
    where: {
      OR: OEM_BRANDS.map((brand) => ({
        fullName: { contains: brand, mode: "insensitive" as const },
      })),
    },
    select: {
      id: true,
      fullName: true,
      category: true,
      brandName: true,
      modelName: true,
    },
    orderBy: { fullName: "asc" },
  });

  if (parts.length === 0) {
    console.log("삭제 대상 Part 없음");
    return;
  }

  console.log(`삭제 대상 Part ${parts.length}개:`);
  for (const part of parts) {
    console.log(`- [${part.category}] ${part.fullName} (${part.id})`);
  }

  const partIds = parts.map((part) => part.id);

  const result = await prisma.$transaction(async (tx) => {
    const snapshots = await tx.priceSnapshot.deleteMany({
      where: { partId: { in: partIds } },
    });
    const valuationItems = await tx.valuationItem.deleteMany({
      where: { partId: { in: partIds } },
    });
    const listingMatches = await tx.listingPartMatch.updateMany({
      where: { partId: { in: partIds } },
      data: { partId: null },
    });
    const deletedParts = await tx.part.deleteMany({
      where: { id: { in: partIds } },
    });

    return { snapshots, valuationItems, listingMatches, deletedParts };
  });

  console.log("\n삭제 완료:");
  console.log(`- price_snapshots: ${result.snapshots.count}건`);
  console.log(`- valuation_items: ${result.valuationItems.count}건`);
  console.log(`- listing_part_matches (partId 해제): ${result.listingMatches.count}건`);
  console.log(`- parts: ${result.deletedParts.count}건`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
