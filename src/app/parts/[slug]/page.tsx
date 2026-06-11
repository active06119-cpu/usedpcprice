// src/app/parts/[slug]/page.tsx
// 부품별 시세 페이지 — SEO 핵심

import { Metadata } from 'next'
import { notFound } from 'next/navigation'
import PartPriceClient from './client'
import { fromSlug } from '@/lib/slug'

// ── SEO 메타데이터 (구글/네이버 검색 결과에 노출) ──────
export async function generateMetadata(
  { params }: { params: Promise<{ slug: string }> }
): Promise<Metadata> {
  const resolvedParams = await params
  const keyword = fromSlug(resolvedParams.slug)

  try {
    const res = await fetch(
      `${process.env.NEXT_PUBLIC_BASE_URL}/api/parts/${resolvedParams.slug}`,
      { next: { revalidate: 3600 } }  // 1시간 캐시
    )
    if (!res.ok) return { title: 'PC시세' }
    const data = await res.json()
    const { part, used, newPrice, depreciationPct } = data

    const midKrw = used.mid ? `₩${used.mid.toLocaleString()}` : ''
    const depStr = depreciationPct ? ` · 신품 대비 -${depreciationPct}%` : ''

    return {
      title: `${part.fullName} 중고 시세 ${midKrw} | PC시세`,
      description: `${part.fullName} 중고 적정가 ${midKrw}${depStr}. 번개장터·당근·중고나라 실거래가 기준 60일 시세 분석.`,
      openGraph: {
        title: `${part.fullName} 중고 시세`,
        description: `현재 적정가 ${midKrw}${depStr}`,
      },
    }
  } catch {
    return { title: `${keyword} 중고 시세 | PC시세` }
  }
}

export default async function PartPage(
  { params }: { params: Promise<{ slug: string }> }
) {
  const resolvedParams = await params
  const res = await fetch(
    `${process.env.NEXT_PUBLIC_BASE_URL}/api/parts/${resolvedParams.slug}`,
    { next: { revalidate: 3600 } }
  )

  if (!res.ok) notFound()
  const data = await res.json()

  return <PartPriceClient data={data} slug={resolvedParams.slug} />
}
