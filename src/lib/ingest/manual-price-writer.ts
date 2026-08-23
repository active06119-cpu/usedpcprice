/**
 * 파싱된 손수 입력 부품가를 DB에 저장 (서랍 1).
 * MANUAL 소스로 upsert. 같은 부품 재입력 시 기존 MANUAL 값 교체(중복 방지).
 * 스크립트·API 라우트가 공용으로 쓴다 (prisma 인스턴스를 인자로 받음).
 */
import type { PrismaClient } from "@prisma/client";
import { PartCategory, PartCondition, SnapshotSource } from "@prisma/client";

import { generateAliases } from "./part-alias";
import type { ManualRow } from "./manual-price-parser";

export function extractBrand(name: string): string {
  const n = name.toLowerCase();
  if (/\b(rtx|gtx)\b/.test(n)) return "NVIDIA";
  if (/\brx\b/.test(n)) return "AMD";
  if (/ryzen/.test(n)) return "AMD";
  if (/\b(i[3579]|core|xeon)\b/.test(n)) return "Intel";
  if (/삼성|samsung/.test(n)) return "Samsung";
  return name.split(/\s+/)[0] || "ETC";
}

export async function findOrCreatePart(
  prisma: PrismaClient,
  name: string,
  category: string,
): Promise<string> {
  const existing = await prisma.part.findFirst({
    where: {
      OR: [
        { fullName: { equals: name, mode: "insensitive" } },
        { modelName: { equals: name, mode: "insensitive" } },
        { aliases: { some: { alias: name.toLowerCase().replace(/\s+/g, "") } } },
      ],
    },
    select: { id: true },
  });
  if (existing) return existing.id;

  const created = await prisma.part.create({
    data: {
      category: category as PartCategory,
      brandName: extractBrand(name),
      modelName: name,
      fullName: name,
      isActive: true,
    },
    select: { id: true },
  });

  // 표기 변형 매칭용 별칭 저장
  for (const alias of generateAliases(name)) {
    await prisma.partAlias.upsert({
      where: { partId_alias: { partId: created.id, alias } },
      update: {},
      create: { partId: created.id, alias, source: "auto-normalize" },
    });
  }

  return created.id;
}

export async function saveManualRows(
  prisma: PrismaClient,
  rows: ManualRow[],
): Promise<number> {
  let saved = 0;
  for (const r of rows) {
    const partId = await findOrCreatePart(prisma, r.name, r.category);
    await prisma.priceSnapshot.deleteMany({
      where: { partId, sourceType: SnapshotSource.MANUAL },
    });
    await prisma.priceSnapshot.create({
      data: {
        partId,
        sourceType: SnapshotSource.MANUAL,
        priceKrw: r.price,
        condition: PartCondition.GOOD,
        rawText: JSON.stringify({ source: "manual", name: r.name, category: r.category }),
      },
    });
    saved++;
  }
  return saved;
}
