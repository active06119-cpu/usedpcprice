// src/app/parts/page.tsx
// 부품 시세 목록 페이지

import { Metadata } from 'next'
import Link from 'next/link'
import { prisma } from '@/lib/prisma'
import { toSlug } from '@/lib/slug'

export const metadata: Metadata = {
  title: '부품별 중고 시세 | PC시세',
  description: 'GPU, CPU, RAM, SSD 등 PC 부품별 중고 시세를 확인하세요. 번개장터·당근·중고나라 실거래가 기준.',
}

const CAT_KO: Record<string, string> = {
  GPU: '그래픽카드', CPU: 'CPU', RAM: '메모리', SSD: 'SSD',
  HDD: 'HDD', MOTHERBOARD: '메인보드', PSU: '파워', CASE: '케이스', COOLER: '쿨러',
}

export default async function PartsPage() {
  const parts = await prisma.part.findMany({
    where: { isActive: true },
    select: { id: true, fullName: true, modelName: true, category: true, releaseYear: true },
    orderBy: [{ category: 'asc' }, { releaseYear: 'desc' }],
  })

  const grouped = parts.reduce((acc, part) => {
    if (!acc[part.category]) acc[part.category] = []
    acc[part.category].push(part)
    return acc
  }, {} as Record<string, typeof parts>)

  const catOrder = ['GPU', 'CPU', 'RAM', 'SSD', 'MOTHERBOARD', 'PSU', 'HDD', 'CASE', 'COOLER']

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 space-y-8">
      <div>
        <h1 className="text-2xl font-medium mb-1">부품별 중고 시세</h1>
        <p className="text-sm text-gray-400">실거래가 기반 적정가 · 매주 업데이트</p>
      </div>

      {catOrder.filter(c => grouped[c]).map(cat => (
        <div key={cat}>
          <h2 className="text-sm font-medium text-gray-400 uppercase tracking-wide mb-3">
            {CAT_KO[cat] ?? cat}
          </h2>
          <div className="grid grid-cols-2 gap-2">
            {grouped[cat].map(part => (
              <Link
                key={part.id}
                href={`/parts/${toSlug(part.modelName)}`}
                className="flex items-center justify-between px-4 py-3 border rounded-xl hover:bg-gray-50 text-sm"
              >
                <span className="font-medium">{part.modelName}</span>
                {part.releaseYear && (
                  <span className="text-xs text-gray-400">{part.releaseYear}</span>
                )}
              </Link>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
