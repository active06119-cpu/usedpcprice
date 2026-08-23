/**
 * 오염/추정 시세 데이터를 삭제해 깨끗한 실제 데이터만 남긴다.
 *   삭제: MANUAL(손수-재입력 예정), BUNJANG/DAANGN/JOONGNA(매칭 엉망 매물), AI_ESTIMATED, SEED
 *   유지: BUYOUT(매입가), NAVER_SHOPPING/DANAWA(신품가) — 실제 데이터
 *
 *   npx tsx scripts/clean-polluted-data.ts          # 미리보기
 *   npx tsx scripts/clean-polluted-data.ts --apply   # 실제 삭제
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const APPLY = process.argv.includes("--apply");

const DELETE_SOURCES = ["MANUAL", "BUNJANG", "DAANGN", "JOONGNA", "AI_ESTIMATED", "SEED"];

async function main() {
  const counts: Record<string, number> = {};
  let total = 0;
  for (const s of DELETE_SOURCES) {
    const n = await prisma.priceSnapshot.count({ where: { sourceType: s as any } });
    counts[s] = n;
    total += n;
  }
  console.log("삭제 대상 (오염/추정 시세):");
  for (const [s, n] of Object.entries(counts)) console.log(`  ${s.padEnd(14)} ${n}건`);
  console.log(`  ─────────────\n  합계          ${total}건`);
  console.log("유지: BUYOUT(매입가), NAVER_SHOPPING/DANAWA(신품가)\n");

  if (!APPLY) {
    console.log("[미리보기] 실제로 지우려면 --apply 를 붙이세요.");
    await prisma.$disconnect();
    return;
  }

  const res = await prisma.priceSnapshot.deleteMany({
    where: { sourceType: { in: DELETE_SOURCES as any } },
  });
  console.log(`✅ 삭제 완료: ${res.count}건. 이제 시세는 매입가×마진 + 신품가 상한만으로 계산됩니다.`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
