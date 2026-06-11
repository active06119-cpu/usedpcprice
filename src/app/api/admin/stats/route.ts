// src/app/api/admin/stats/route.ts

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { guardAdminRequest } from '@/lib/admin-guard'
import { checkRateLimit, getClientIp } from '@/lib/rate-limit'

export async function GET(req: Request) {
  const guard = guardAdminRequest(req)
  if (guard) return guard
  const ip = getClientIp(req)
  const rate = checkRateLimit(`admin:stats:${ip}`, 60, 60_000)
  if (!rate.allowed) {
    return NextResponse.json(
      { ok: false, message: "요청이 너무 많습니다. 잠시 후 다시 시도해주세요." },
      { status: 429 },
    )
  }

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const [
    totalParts,
    totalSnapshots,
    todaySnapshots,
    aiSnapshots,
    dbSnapshots,
    recentSnapshots,
    unmatchedCount,
    batchHistory,
  ] = await Promise.all([
    prisma.part.count({ where: { isActive: true } }),
    prisma.priceSnapshot.count(),
    prisma.priceSnapshot.count({ where: { capturedAt: { gte: today } } }),
    // AI 추정 기반 저장 수
    prisma.priceSnapshot.count({
      where: { rawText: { contains: '"estimationMethod":"ai"' } }
    }),
    // DB 기반 저장 수
    prisma.priceSnapshot.count({
      where: { rawText: { contains: '"estimationMethod":"db"' } }
    }),
    // 최근 20개
    prisma.priceSnapshot.findMany({
      take: 20,
      orderBy: { capturedAt: 'desc' },
      select: {
        id: true,
        priceKrw: true,
        condition: true,
        sourceType: true,
        capturedAt: true,
        rawText: true,
        part: { select: { fullName: true, category: true } },
      },
    }),
    // 미매칭 리스트 (ListingPartMatch에서 partId null인 것)
    prisma.listingPartMatch.count({ where: { partId: null } }),
    // 배치 히스토리 최근 5개
    prisma.importBatch.findMany({
      take: 5,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        source: true,
        status: true,
        recordCount: true,
        createdAt: true,
        errorLog: true,
      },
    }),
  ])

  return NextResponse.json({
    stats: {
      totalParts,
      totalSnapshots,
      todaySnapshots,
      aiSnapshots,
      dbSnapshots,
      unmatchedCount,
    },
    recentSnapshots: recentSnapshots.map(s => ({
      ...s,
      rawData: s.rawText ? JSON.parse(s.rawText) : null,
      rawText: undefined,
    })),
    batchHistory,
  })
}
