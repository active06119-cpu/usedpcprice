// src/app/api/parts/[slug]/route.ts
// 부품 시세 데이터 API — SEO 페이지용

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { fromSlug } from '@/lib/slug'
import { PartCondition } from '@prisma/client'

function pct(arr: number[], p: number): number | null {
  if (!arr.length) return null
  return arr[Math.floor(arr.length * p)]
}

function removeOutliers(prices: number[]): number[] {
  if (prices.length < 4) return prices
  const s = [...prices].sort((a, b) => a - b)
  const q1 = s[Math.floor(s.length * 0.25)]
  const q3 = s[Math.floor(s.length * 0.75)]
  const iqr = q3 - q1
  return s.filter(p => p >= q1 - 1.5 * iqr && p <= q3 + 1.5 * iqr)
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const resolvedParams = await params
  const keyword = fromSlug(resolvedParams.slug)

  // 슬러그로 부품 찾기
  const part = await prisma.part.findFirst({
    where: {
      isActive: true,
      OR: [
        { modelName: { contains: keyword, mode: 'insensitive' } },
        { fullName:  { contains: keyword, mode: 'insensitive' } },
        { aliases: { some: { alias: { contains: keyword, mode: 'insensitive' } } } },
      ],
    },
    select: {
      id: true, fullName: true, modelName: true,
      brandName: true, category: true, releaseYear: true, msrpKrw: true,
    },
  })

  if (!part) {
    return NextResponse.json({ error: '부품을 찾을 수 없습니다.' }, { status: 404 })
  }

  const since60 = new Date(Date.now() - 60 * 86_400_000)
  const since14 = new Date(Date.now() - 14 * 86_400_000)

  const [usedSnaps, newSnaps] = await Promise.all([
    prisma.priceSnapshot.findMany({
      where: {
        partId: part.id,
        sourceType: { in: ['BUNJANG', 'DAANGN', 'JOONGNA', 'MANUAL'] as any },
        capturedAt: { gte: since60 },
      },
      select: { priceKrw: true, condition: true, capturedAt: true },
      orderBy: { capturedAt: 'desc' },
    }),
    prisma.priceSnapshot.findMany({
      where: {
        partId: part.id,
        sourceType: { in: ['NAVER_SHOPPING', 'DANAWA'] as any },
        capturedAt: { gte: since14 },
      },
      select: { priceKrw: true, capturedAt: true },
      orderBy: { capturedAt: 'desc' },
      take: 5,
    }),
  ])

  // 전체 중고 집계
  const allPrices = removeOutliers(usedSnaps.map(s => s.priceKrw)).sort((a, b) => a - b)

  // 조건별 집계
  const byCondition: Record<string, { mid: number | null; count: number }> = {}
  for (const cond of Object.values(PartCondition)) {
    const prices = removeOutliers(
      usedSnaps.filter(s => s.condition === cond).map(s => s.priceKrw)
    ).sort((a, b) => a - b)
    byCondition[cond] = { mid: pct(prices, 0.5), count: prices.length }
  }

  // 60일 추이 (7일 단위 평균)
  const trend: { date: string; price: number }[] = []
  for (let i = 8; i >= 0; i--) {
    const from = new Date(Date.now() - (i + 1) * 7 * 86_400_000)
    const to   = new Date(Date.now() - i * 7 * 86_400_000)
    const week = usedSnaps.filter(s =>
      s.capturedAt >= from && s.capturedAt < to
    ).map(s => s.priceKrw)
    if (week.length > 0) {
      const avg = Math.round(week.reduce((a, b) => a + b, 0) / week.length)
      trend.push({ date: to.toISOString().slice(0, 10), price: avg })
    }
  }

  const newPrices = newSnaps.map(s => s.priceKrw).sort((a, b) => a - b)
  const newMedian = pct(newPrices, 0.5)
  const usedMid   = pct(allPrices, 0.5)

  return NextResponse.json({
    part,
    used: {
      low:  pct(allPrices, 0.1),
      mid:  usedMid,
      high: pct(allPrices, 0.9),
      sampleSize: usedSnaps.length,
      byCondition,
      trend,
    },
    newPrice: newMedian,
    depreciationPct: usedMid && newMedian
      ? Math.round((1 - usedMid / newMedian) * 100)
      : null,
  })
}
