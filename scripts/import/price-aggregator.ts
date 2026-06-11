// ============================================================
// scripts/normalize/price-aggregator.ts
// 신품가 vs 중고가 비교 집계
//
// 이 함수들이 실제로 앱 레이어에서 호출하는 핵심 쿼리임.
// ValuationRun을 만들기 전에 앱 레이어가 이 데이터를 기반으로
// fair price range를 계산함.
// ============================================================

import { PrismaClient, SnapshotSource, PartCondition, PartCategory } from '@prisma/client'

const prisma = new PrismaClient()

// 신품/중고 소스 분류
const NEW_SOURCES = [
  SnapshotSource.DANAWA,
  SnapshotSource.MANUAL,
]

const USED_SOURCES = [
  SnapshotSource.BUNJANG,
  SnapshotSource.JOONGNA,
  SnapshotSource.NAVER_CAFE,
]

function isSnapshotSourceIn(
  value: SnapshotSource,
  sources: readonly SnapshotSource[],
): boolean {
  return sources.includes(value);
}

export interface PriceProfile {
  partId: string
  partName: string

  // 신품 가격
  newPrice: {
    min: number | null         // 최저가 (다나와 기준)
    avg: number | null         // 평균 신품가
    sampleSize: number
    asOf: Date | null
  }

  // 중고 가격 (조건별)
  usedPrice: {
    byCondition: Record<string, {
      p10: number | null    // 하한 (저렴한 10%)
      p50: number | null    // 중앙값
      p90: number | null    // 상한 (비싼 10%)
      avg: number | null
      count: number
    }>
    overall: {
      p10: number | null
      p50: number | null
      p90: number | null
      avg: number | null
      count: number
    }
    asOf: Date | null
  }

  // 감가율 (신품 대비 중고 비율)
  depreciationRatio: {
    likeNew: number | null    // 개봉만 한 상태의 신품 대비 %
    good: number | null       // 사용감 적음의 신품 대비 %
    fair: number | null       // 사용감 있음의 신품 대비 %
  }
}

// 백분위 계산 헬퍼
function percentile(sorted: number[], p: number): number | null {
  if (sorted.length === 0) return null
  const idx = Math.floor(sorted.length * p)
  return sorted[Math.min(idx, sorted.length - 1)]
}

function average(arr: number[]): number | null {
  if (arr.length === 0) return null
  return Math.round(arr.reduce((a, b) => a + b, 0) / arr.length)
}

// 이상치 제거 (IQR 방식)
// 중고나라 낚시 가격(1원, 999만원)을 자동으로 걸러냄
function removeOutliers(prices: number[]): number[] {
  if (prices.length < 4) return prices
  const sorted = [...prices].sort((a, b) => a - b)
  const q1 = sorted[Math.floor(sorted.length * 0.25)]
  const q3 = sorted[Math.floor(sorted.length * 0.75)]
  const iqr = q3 - q1
  const lower = q1 - 1.5 * iqr
  const upper = q3 + 1.5 * iqr
  return sorted.filter(p => p >= lower && p <= upper)
}

// 특정 파트의 전체 가격 프로파일 생성
export async function getPriceProfile(partId: string, dayWindow = 60): Promise<PriceProfile | null> {
  const part = await prisma.part.findUnique({
    where: { id: partId },
    select: { id: true, fullName: true },
  })
  if (!part) return null

  const since = new Date()
  since.setDate(since.getDate() - dayWindow)

  const snapshots = await prisma.priceSnapshot.findMany({
    where: {
      partId,
      capturedAt: { gte: since },
    },
    select: {
      priceKrw: true,
      condition: true,
      sourceType: true,
      capturedAt: true,
    },
    orderBy: { capturedAt: 'desc' },
  })

  // 신품/중고 분리
  const newSnaps = snapshots.filter((s) => isSnapshotSourceIn(s.sourceType, NEW_SOURCES))
  const usedSnaps = snapshots.filter((s) => isSnapshotSourceIn(s.sourceType, USED_SOURCES))

  // 신품 가격 집계
  const newPrices = removeOutliers(newSnaps.map(s => s.priceKrw).sort((a, b) => a - b))
  const newMin = newPrices.length > 0 ? Math.min(...newPrices) : null

  // 중고 가격 — 조건별 집계
  const conditions = [PartCondition.LIKE_NEW, PartCondition.GOOD, PartCondition.FAIR, PartCondition.POOR]
  const byCondition: PriceProfile['usedPrice']['byCondition'] = {}

  for (const cond of conditions) {
    const prices = removeOutliers(
      usedSnaps
        .filter(s => s.condition === cond)
        .map(s => s.priceKrw)
        .sort((a, b) => a - b)
    )

    byCondition[cond] = {
      p10:   percentile(prices, 0.1),
      p50:   percentile(prices, 0.5),
      p90:   percentile(prices, 0.9),
      avg:   average(prices),
      count: prices.length,
    }
  }

  // 전체 중고 집계 (조건 불문)
  const allUsedPrices = removeOutliers(usedSnaps.map(s => s.priceKrw).sort((a, b) => a - b))

  // 감가율 계산
  const newAvg = average(newPrices)
  const likeNewAvg = byCondition[PartCondition.LIKE_NEW].avg
  const goodAvg = byCondition[PartCondition.GOOD].avg
  const fairAvg = byCondition[PartCondition.FAIR].avg

  const ratio = (used: number | null, newP: number | null) =>
    used && newP ? Math.round((used / newP) * 100) / 100 : null

  return {
    partId,
    partName: part.fullName,

    newPrice: {
      min:    newMin,
      avg:    newAvg,
      sampleSize: newPrices.length,
      asOf:   newSnaps[0]?.capturedAt ?? null,
    },

    usedPrice: {
      byCondition,
      overall: {
        p10:   percentile(allUsedPrices, 0.1),
        p50:   percentile(allUsedPrices, 0.5),
        p90:   percentile(allUsedPrices, 0.9),
        avg:   average(allUsedPrices),
        count: allUsedPrices.length,
      },
      asOf: usedSnaps[0]?.capturedAt ?? null,
    },

    depreciationRatio: {
      likeNew: ratio(likeNewAvg, newAvg),
      good:    ratio(goodAvg,    newAvg),
      fair:    ratio(fairAvg,    newAvg),
    },
  }
}

// 여러 파트 한번에 집계 (카테고리 페이지용)
export async function getPriceProfilesForCategory(
  category: PartCategory,
  dayWindow = 60,
): Promise<PriceProfile[]> {
  const parts = await prisma.part.findMany({
    where: { category, isActive: true },
    select: { id: true },
    orderBy: { fullName: 'asc' },
  })

  const profiles = await Promise.all(
    parts.map(p => getPriceProfile(p.id, dayWindow))
  )

  return profiles.filter((p): p is PriceProfile => p !== null)
}

// 콘솔 출력용 (개발/디버그)
export function printPriceProfile(profile: PriceProfile) {
  const krw = (n: number | null) =>
    n == null ? 'N/A' : `₩${n.toLocaleString('ko-KR')}`
  const pct = (n: number | null) =>
    n == null ? 'N/A' : `${Math.round(n * 100)}%`

  console.log(`\n📦 ${profile.partName}`)
  console.log(`─────────────────────────────────`)
  console.log(`  신품 최저가:  ${krw(profile.newPrice.min)} (n=${profile.newPrice.sampleSize})`)
  console.log(`  신품 평균가:  ${krw(profile.newPrice.avg)}`)
  console.log(``)
  console.log(`  중고 가격 (조건별):`)
  for (const [cond, data] of Object.entries(profile.usedPrice.byCondition)) {
    if (data.count === 0) continue
    console.log(`    ${cond.padEnd(10)} p10=${krw(data.p10)} / p50=${krw(data.p50)} / p90=${krw(data.p90)}  (n=${data.count})`)
  }
  console.log(``)
  console.log(`  감가율 (신품 대비):`)
  console.log(`    개봉만 한:  ${pct(profile.depreciationRatio.likeNew)}`)
  console.log(`    사용감 적음: ${pct(profile.depreciationRatio.good)}`)
  console.log(`    사용감 있음: ${pct(profile.depreciationRatio.fair)}`)
}
