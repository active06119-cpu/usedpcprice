import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  const result = await prisma.priceSnapshot.deleteMany({
    where: { sourceType: 'NAVER_SHOPPING' as any },
  })
  console.log(`삭제됨: ${result.count}개`)
}

main().finally(() => prisma.$disconnect())
