// src/app/api/analyze-bulk/route.ts
// 여러 매물 동시 분석 — "---" 구분자로 분리 + 병렬 처리

import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const { text } = await req.json()
  if (!text?.trim()) return NextResponse.json({ error: '텍스트 없음' }, { status: 400 })

  // "---" 또는 빈 줄 3개로 매물 분리
  const listings = text
    .split(/\n---+\n|\n{3,}/)
    .map((s: string) => s.trim())
    .filter((s: string) => s.length > 15)

  if (listings.length === 0) return NextResponse.json({ error: '매물 없음' }, { status: 400 })
  if (listings.length > 10) return NextResponse.json({ error: '한 번에 최대 10개' }, { status: 400 })

  // 병렬로 개별 분석 API 호출
  const baseUrl = req.nextUrl.origin
  const results = await Promise.allSettled(
    listings.map((listing: string) =>
      fetch(`${baseUrl}/api/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: listing }),
      }).then(r => r.json())
    )
  )

  return NextResponse.json({
    total: listings.length,
    results: results.map((r, i) => ({
      index: i + 1,
      snippet: listings[i].substring(0, 60) + '...',
      status: r.status,
      data: r.status === 'fulfilled' ? r.value : null,
      error: r.status === 'rejected' ? r.reason : null,
    }))
  })
}
