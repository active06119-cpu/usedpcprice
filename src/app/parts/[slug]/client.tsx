'use client'
// src/app/parts/[slug]/client.tsx

import { useRouter } from 'next/navigation'

const COND_KO: Record<string, string> = {
  NEW: '새 제품', LIKE_NEW: '개봉만', GOOD: '사용감 적음',
  FAIR: '사용감 있음', POOR: '불량',
}
const krw = (n: number | null) => n ? `₩${n.toLocaleString()}` : '—'

export default function PartPriceClient({ data, slug }: { data: any; slug: string }) {
  const router = useRouter()
  const { part, used, newPrice, depreciationPct } = data

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">

      {/* 브레드크럼 */}
      <div className="flex items-center gap-2 text-sm text-gray-400">
        <span className="cursor-pointer hover:text-gray-600" onClick={() => router.push('/parts')}>
          부품 시세
        </span>
        <span>›</span>
        <span>{part.category}</span>
        <span>›</span>
        <span className="text-gray-700">{part.fullName}</span>
      </div>

      {/* 헤더 */}
      <div>
        <h1 className="text-2xl font-medium mb-1">{part.fullName}</h1>
        <p className="text-sm text-gray-400">
          {part.releaseYear && `${part.releaseYear}년 출시 · `}
          {used.sampleSize}개 거래 기준 · 최근 60일
        </p>
      </div>

      {/* 핵심 가격 */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-gray-50 rounded-xl p-4 text-center">
          <div className="text-xs text-gray-400 mb-1">하한가</div>
          <div className="text-lg font-medium">{krw(used.low)}</div>
        </div>
        <div className="bg-teal-50 border border-teal-200 rounded-xl p-4 text-center">
          <div className="text-xs text-teal-600 mb-1">적정가</div>
          <div className="text-xl font-semibold text-teal-800">{krw(used.mid)}</div>
          {depreciationPct && (
            <div className="text-xs text-teal-600 mt-1">신품 대비 -{depreciationPct}%</div>
          )}
        </div>
        <div className="bg-gray-50 rounded-xl p-4 text-center">
          <div className="text-xs text-gray-400 mb-1">상한가</div>
          <div className="text-lg font-medium">{krw(used.high)}</div>
        </div>
      </div>

      {/* 신품 기준가 */}
      {newPrice && (
        <div className="flex items-center justify-between px-4 py-3 border rounded-xl text-sm">
          <span className="text-gray-500">신품 기준가</span>
          <span className="font-medium">{krw(newPrice)}</span>
        </div>
      )}

      {/* 상태별 가격 */}
      <div className="border rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b bg-gray-50 text-sm font-medium">상태별 가격</div>
        <table className="w-full text-sm">
          <tbody className="divide-y">
            {Object.entries(used.byCondition)
              .filter(([, v]: any) => v.count > 0)
              .map(([cond, v]: any) => (
                <tr key={cond}>
                  <td className="px-4 py-3 text-gray-600">{COND_KO[cond] ?? cond}</td>
                  <td className="px-4 py-3 text-right font-medium">{krw(v.mid)}</td>
                  <td className="px-4 py-3 text-right text-xs text-gray-400">{v.count}개 기준</td>
                </tr>
              ))}
          </tbody>
        </table>
        {Object.values(used.byCondition).every((v: any) => v.count === 0) && (
          <div className="px-4 py-4 text-sm text-gray-400 text-center">
            아직 상태별 데이터가 없습니다
          </div>
        )}
      </div>

      {/* 시세 추이 */}
      {used.trend.length > 0 && (
        <div className="border rounded-xl p-4">
          <div className="text-sm font-medium mb-3">최근 60일 시세 추이</div>
          <div className="flex items-end gap-1 h-20">
            {used.trend.map((t: any, i: number) => {
              const max = Math.max(...used.trend.map((x: any) => x.price))
              const min = Math.min(...used.trend.map((x: any) => x.price))
              const h = max === min ? 50 : ((t.price - min) / (max - min)) * 100
              return (
                <div key={i} className="flex-1 flex flex-col items-center gap-1">
                  <div
                    className="w-full bg-teal-400 rounded-sm"
                    style={{ height: `${Math.max(h, 8)}%` }}
                    title={`${t.date}: ${krw(t.price)}`}
                  />
                  <div className="text-xs text-gray-400 rotate-45 origin-left whitespace-nowrap">
                    {t.date.slice(5)}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* CTA */}
      <div className="border border-teal-200 bg-teal-50 rounded-xl p-4">
        <div className="text-sm font-medium text-teal-800 mb-1">
          {part.fullName} 매물 분석하기
        </div>
        <div className="text-xs text-teal-600 mb-3">
          번개장터·당근 매물 본문을 붙여넣으면 적정가인지 바로 확인해드립니다
        </div>
        <button
          onClick={() => router.push(`/?q=${encodeURIComponent(part.fullName)}`)}
          className="text-sm px-4 py-2 bg-teal-600 text-white rounded-lg"
        >
          지금 분석하기 →
        </button>
      </div>

    </div>
  )
}
