/**
 * 이미 parts_price 테이블에 쌓인 이상 데이터를 1회성으로 정리한다.
 *
 * 판정 기준은 신규 저장 게이트(src/lib/ingest/used-listing-guard.ts)와 동일:
 *   - 가격 null / 0 이하        → no_price
 *   - 엉터리 부품명             → invalid_name
 *   - 시세 범위 밖 가격         → price_out_of_range
 *
 * 사용법:
 *   npx tsx scripts/clean-invalid-parts-price.ts           # 미리보기 (아무것도 안 지움)
 *   npx tsx scripts/clean-invalid-parts-price.ts --apply   # 실제 삭제
 */
import { PrismaClient } from "@prisma/client";

import { partitionPersistable } from "../src/lib/ingest/used-listing-guard";

const prisma = new PrismaClient();
const APPLY = process.argv.includes("--apply");

async function main() {
  const rows = await prisma.partsPrice.findMany({
    select: { id: true, name: true, category: true, priceKrw: true },
  });

  console.log(`전체 parts_price: ${rows.length}건`);

  const candidates = rows.map((row) => ({
    id: row.id,
    name: row.name,
    category: String(row.category),
    priceKrw: row.priceKrw,
  }));

  const { kept, rejected } = partitionPersistable(candidates);

  const byReason = rejected.reduce<Record<string, number>>((acc, r) => {
    acc[r.reason] = (acc[r.reason] ?? 0) + 1;
    return acc;
  }, {});

  console.log(`유지: ${kept.length}건 / 삭제 대상: ${rejected.length}건`);
  console.log("사유별:", byReason);

  // 삭제 대상 샘플 20건 출력
  rejected.slice(0, 20).forEach((r) => {
    console.log(`  - [${r.reason}] ${r.name} | ${r.priceKrw ?? "null"}`);
  });
  if (rejected.length > 20) console.log(`  ... 외 ${rejected.length - 20}건`);

  if (!APPLY) {
    console.log("\n[미리보기 모드] 실제로 지우려면 --apply 를 붙여 다시 실행하세요.");
    return;
  }

  if (rejected.length === 0) {
    console.log("\n삭제할 것이 없습니다.");
    return;
  }

  // partitionPersistable 는 kept 만 T 를 보존하므로, rejected 매칭은 name+price 대신 id 재계산으로 처리
  const keptIds = new Set(kept.map((row) => row.id));
  const deleteIds = candidates.filter((c) => !keptIds.has(c.id)).map((c) => c.id);

  const result = await prisma.partsPrice.deleteMany({ where: { id: { in: deleteIds } } });
  console.log(`\n삭제 완료: ${result.count}건`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
