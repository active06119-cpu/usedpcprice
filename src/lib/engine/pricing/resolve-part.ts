/**
 * 부품 1개의 최종 중고 시세를 DB에서 뽑는다 (층 엔진 + 클램프 통과).
 * 호구 판정기가 부품마다 호출한다.
 */
import type { PrismaClient } from "@prisma/client";

import { generateAliases } from "../../ingest/part-alias";
import { resolveLayeredUsedBand, type LayeredUsedBand } from "./layered";

const USED_LOOKBACK_DAYS = 90;

/**
 * 이름/카테고리로 기존 부품 id 찾기 (없으면 null — 판정에선 새로 만들지 않음).
 * loose=false 면 부분일치(마지막 수단) 안 씀 → "700W 파워" 같은 제네릭이 아무거나 안 잡힘.
 */
export async function findPartId(
  prisma: PrismaClient,
  name: string,
  category: string,
  opts: { loose?: boolean } = {},
): Promise<string | null> {
  const { loose = true } = opts;
  // 입력 이름을 정규화 별칭 여러 개로 변환 → 표기 변형 흡수
  const inputAliases = generateAliases(name);
  const stripped = name
    .replace(/\b\d+\s*(gb|tb|g)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();

  // 1) 정확 일치 or 정규화 별칭 일치 (표기 달라도 잡힘)
  let p = await prisma.part.findFirst({
    where: {
      OR: [
        { fullName: { equals: name, mode: "insensitive" } },
        { modelName: { equals: name, mode: "insensitive" } },
        { aliases: { some: { alias: { in: inputAliases } } } },
      ],
    },
    select: { id: true },
  });
  if (p) return p.id;
  if (!loose) return null;

  // 2) 부분 일치 (마지막 수단, 같은 카테고리 안에서만 → 오매칭 최소화)
  p = await prisma.part.findFirst({
    where: {
      category: category as any,
      OR: [
        { fullName: { contains: stripped, mode: "insensitive" } },
        { modelName: { contains: stripped, mode: "insensitive" } },
      ],
    },
    select: { id: true },
  });
  return p?.id ?? null;
}

/** 부품 id로 최종 시세 밴드 (매입가·손수값·신품가·실매물 종합 + 클램프) */
export async function resolvePartUsedBand(
  prisma: PrismaClient,
  partId: string,
  category: string,
): Promise<LayeredUsedBand | null> {
  const [buyout, manual, newSnap, listings] = await Promise.all([
    prisma.priceSnapshot.findFirst({
      where: { partId, sourceType: "BUYOUT" as any },
      orderBy: { capturedAt: "desc" },
      select: { priceKrw: true },
    }),
    prisma.priceSnapshot.findFirst({
      where: { partId, sourceType: "MANUAL" as any },
      orderBy: { capturedAt: "desc" },
      select: { priceKrw: true },
    }),
    prisma.priceSnapshot.findFirst({
      where: { partId, sourceType: { in: ["NAVER_SHOPPING", "DANAWA"] as any } },
      orderBy: { capturedAt: "desc" },
      select: { priceKrw: true },
    }),
    prisma.priceSnapshot.findMany({
      where: {
        partId,
        sourceType: { in: ["BUNJANG", "DAANGN", "JOONGNA"] as any },
        capturedAt: { gte: new Date(Date.now() - USED_LOOKBACK_DAYS * 86_400_000) },
      },
      select: { priceKrw: true },
    }),
  ]);

  return resolveLayeredUsedBand({
    buyoutKrw: buyout?.priceKrw ?? null,
    manualKrw: manual?.priceKrw ?? null,
    newPriceKrw: newSnap?.priceKrw ?? null,
    category,
    listingPrices: listings.map((l) => l.priceKrw),
  });
}
