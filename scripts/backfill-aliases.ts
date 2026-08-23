/**
 * 기존 모든 부품에 정규화 별칭을 채운다 (표기 변형 매칭용).
 *   npx tsx scripts/backfill-aliases.ts          # 미리보기
 *   npx tsx scripts/backfill-aliases.ts --apply   # 실제 저장
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

import { generateAliases } from "../src/lib/ingest/part-alias";

const prisma = new PrismaClient();
const APPLY = process.argv.includes("--apply");

async function main() {
  const parts = await prisma.part.findMany({
    select: { id: true, fullName: true, modelName: true },
  });
  console.log(`부품 ${parts.length}개에 별칭 생성 중...\n`);

  const rows: { partId: string; alias: string; source: string }[] = [];
  let sample = 0;
  for (const part of parts) {
    const aliases = new Set([
      ...generateAliases(part.fullName),
      ...generateAliases(part.modelName),
    ]);
    if (sample < 8) {
      console.log(`  ${part.modelName.slice(0, 24).padEnd(24)} → ${[...aliases].join(", ")}`);
      sample++;
    }
    for (const alias of aliases) rows.push({ partId: part.id, alias, source: "auto-normalize" });
  }

  if (!APPLY) {
    console.log(`\n[미리보기] 별칭 ${rows.length}건 생성 예정. --apply 로 실제 저장하세요.`);
    await prisma.$disconnect();
    return;
  }

  // 한 번에(청크로) 삽입, 이미 있는 건 스킵 → 빠르고 재실행 안전
  let created = 0;
  const CHUNK = 500;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const res = await prisma.partAlias.createMany({
      data: rows.slice(i, i + CHUNK),
      skipDuplicates: true,
    });
    created += res.count;
  }
  console.log(`\n✅ 별칭 저장 완료: 신규 ${created}건 (전체 ${rows.length}건 중 중복 제외)`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
