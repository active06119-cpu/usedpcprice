/**
 * 손수 정리한 부품 중고가(엑셀/CSV) → DB (서랍 1: 부품 가격표).
 *
 * 관리자 페이지(/admin/manual-prices)에서 붙여넣기로 해도 되고, 파일로 대량 넣을 땐 이 스크립트.
 * 엑셀에서 data/manual-prices.csv 를 "CSV UTF-8"로 저장한 뒤 실행:
 *   npx tsx scripts/import-manual-prices.ts            # 미리보기 (검증만, DB 안 건드림)
 *   npx tsx scripts/import-manual-prices.ts --apply    # 실제 저장
 *
 * 형식(3열):  name,category,price  (탭/콤마 둘 다 인식)
 * 파싱·검증·저장 로직은 관리자 페이지와 100% 동일한 모듈 사용.
 */
import "dotenv/config";
import { readFileSync } from "fs";
import { PrismaClient } from "@prisma/client";

import { parseManualPriceText } from "../src/lib/ingest/manual-price-parser";
import { saveManualRows } from "../src/lib/ingest/manual-price-writer";

const prisma = new PrismaClient();
const APPLY = process.argv.includes("--apply");
const FILE = process.argv.find((a) => a.endsWith(".csv")) ?? "data/manual-prices.csv";

async function main() {
  let text: string;
  try {
    text = readFileSync(FILE, "utf8");
  } catch {
    console.error(`❌ 파일을 못 찾음: ${FILE}`);
    process.exit(1);
  }

  const { rows, bad } = parseManualPriceText(text);
  console.log(`파일: ${FILE}`);
  console.log(`유효 ${rows.length}건 / 걸러짐 ${bad.length}건\n`);

  if (bad.length > 0) {
    console.log("⚠️ 걸러진 줄:");
    bad.slice(0, 20).forEach((b) => console.log(`  ${b.line}행: ${b.reason}  → ${b.raw.slice(0, 50)}`));
    if (bad.length > 20) console.log(`  ... 외 ${bad.length - 20}건`);
    console.log("");
  }

  if (!APPLY) {
    console.log("[미리보기] 실제로 넣으려면 --apply 를 붙여 다시 실행하세요.");
    rows.slice(0, 10).forEach((r) => console.log(`  ${r.name} (${r.category}) = ${r.price.toLocaleString()}원`));
    if (rows.length > 10) console.log(`  ... 외 ${rows.length - 10}건`);
    await prisma.$disconnect();
    return;
  }

  const saved = await saveManualRows(prisma, rows);
  console.log(`✅ 저장 완료: ${saved}건 (MANUAL 소스로 반영됨)`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
