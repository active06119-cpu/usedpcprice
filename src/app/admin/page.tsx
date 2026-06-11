'use client'
// src/app/admin/bulk-import/page.tsx
// 매물 칸별 입력 — 한 칸에 하나씩, 여러 개 동시 분석

import { useEffect, useState } from 'react'

const krw = (n: number | null) => n ? `₩${n.toLocaleString()}` : '—'
const CONDITION_KO: Record<string, string> = {
  NEW: '새 제품', LIKE_NEW: '개봉만', GOOD: '사용감 적음',
  FAIR: '사용감 있음', POOR: '불량',
}

interface Slot {
  id: number
  text: string
  status: 'idle' | 'loading' | 'done' | 'error'
  result: any
  error: string
  saved: boolean
}

type UrlPreviewPart = {
  category: "CPU" | "GPU" | "RAM" | "SSD" | "HDD" | "MAINBOARD" | "PSU" | "CASE" | "ETC"
  name: string
  price: number | null
  condition: "새상품" | "사용감적음" | "사용감있음" | "알수없음"
}

type UrlPreview = {
  sourceUrl: string
  title: string
  description: string
  rawText: string
  source: string
  totalPrice: number | null
  soldStatus: "ACTIVE" | "SOLD" | "RESERVED" | "UNKNOWN"
  registeredAt: string | null
  parts: UrlPreviewPart[]
}

type HealthCheck = {
  checks: {
    tooLowCount: number
    tooHighCount: number
    todayBuyoutCount: number
    todayBySource: { sourceType: string; count: number }[]
  }
  hasAnomaly: boolean
}

let nextId = 1

function makeSlot(): Slot {
  return { id: nextId++, text: '', status: 'idle', result: null, error: '', saved: false }
}

export default function BulkImportPage() {
  const adminToken = process.env.NEXT_PUBLIC_ADMIN_API_TOKEN ?? ''
  const [slots, setSlots] = useState<Slot[]>([makeSlot(), makeSlot(), makeSlot()])
  const [sourceFilter, setSourceFilter] = useState<'all' | 'db' | 'ai'>('all')
  const [url, setUrl] = useState('')
  const [urlLoading, setUrlLoading] = useState(false)
  const [urlSaving, setUrlSaving] = useState(false)
  const [urlMessage, setUrlMessage] = useState('')
  const [urlPreview, setUrlPreview] = useState<UrlPreview | null>(null)
  const [buyoutLoading, setBuyoutLoading] = useState(false)
  const [buyoutMessage, setBuyoutMessage] = useState('')
  const [naverLoading, setNaverLoading] = useState(false)
  const [naverMessage, setNaverMessage] = useState('')
  const [aiPricesLoading, setAiPricesLoading] = useState(false)
  const [aiPricesMessage, setAiPricesMessage] = useState('')
  const [reportedPrices, setReportedPrices] = useState<
    Array<{
      id: string;
      partName: string;
      reportedPrice: number;
      reason: string;
      createdAt: string;
    }>
  >([])
  const [reportedLoading, setReportedLoading] = useState(true)
  const [healthCheck, setHealthCheck] = useState<HealthCheck | null>(null)
  const [healthLoading, setHealthLoading] = useState(true)
  const [cleanupLoading, setCleanupLoading] = useState(false)
  const [cleanupMessage, setCleanupMessage] = useState('')

  async function fetchHealthCheck() {
    setHealthLoading(true)
    try {
      const res = await fetch('/api/admin/health-check', {
        headers: { 'x-admin-token': adminToken },
      })
      if (!res.ok) return
      const data = await res.json()
      if (data.ok) setHealthCheck(data)
    } catch {
      // ignore
    } finally {
      setHealthLoading(false)
    }
  }

  async function fetchReportedPrices() {
    setReportedLoading(true)
    try {
      const res = await fetch('/api/report-price?limit=20', {
        headers: { 'x-admin-token': adminToken },
      })
      if (!res.ok) return
      const data = await res.json()
      if (data.ok && Array.isArray(data.items)) setReportedPrices(data.items)
    } catch {
      // ignore
    } finally {
      setReportedLoading(false)
    }
  }

  useEffect(() => {
    fetchHealthCheck()
    fetchReportedPrices()
  }, [])

  async function deleteTooLowSnapshots() {
    if (!healthCheck?.checks.tooLowCount) return
    if (!window.confirm(`₩1,000 미만 실거래 ${healthCheck.checks.tooLowCount}건을 삭제할까요?`)) return

    setCleanupLoading(true)
    setCleanupMessage('')
    try {
      const res = await fetch('/api/admin/cleanup', {
        method: 'POST',
        headers: { 'x-admin-token': adminToken },
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.message ?? '삭제 실패')
      setCleanupMessage(data.message ?? `${data.deleted}건 삭제`)
      await fetchHealthCheck()
    } catch (e: any) {
      setCleanupMessage(e.message ?? '삭제 중 오류가 발생했습니다.')
    } finally {
      setCleanupLoading(false)
    }
  }

  const update = (id: number, patch: Partial<Slot>) =>
    setSlots(s => s.map(sl => sl.id === id ? { ...sl, ...patch } : sl))

  const addSlot = () => setSlots(s => [...s, makeSlot()])

  const removeSlot = (id: number) =>
    setSlots(s => s.length > 1 ? s.filter(sl => sl.id !== id) : s)

  // 단일 슬롯 분석
  async function analyzeOne(slot: Slot) {
    if (!slot.text.trim()) return
    update(slot.id, { status: 'loading', result: null, error: '' })
    try {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: slot.text }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      update(slot.id, { status: 'done', result: data })
    } catch (e: any) {
      update(slot.id, { status: 'error', error: e.message })
    }
  }

  // 전체 슬롯 동시 분석
  async function analyzeAll() {
    const pending = slots.filter(s => s.text.trim() && s.status === 'idle')
    await Promise.all(pending.map(analyzeOne))
  }

  // 결과 저장
  async function saveOne(slot: Slot) {
    if (!slot.result?.parts) return
    const items = slot.result.parts
      .filter((p: any) => p.partId && p.usedMid)
      .map((p: any) => ({
        partName: p.partName,
        priceKrw: p.usedMid,
        condition: p.condition,
        sourceUrl: null,
        memo: `bulk-import / ${p.priceSource}`,
      }))
    if (!items.length) return

    try {
      const res = await fetch('/api/admin/save-listings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-token': adminToken,
        },
        body: JSON.stringify({ items, source: 'MANUAL' }),
      })
      if (res.ok) update(slot.id, { saved: true })
    } catch {}
  }

  const filledCount = slots.filter(s => s.text.trim()).length
  const doneCount   = slots.filter(s => s.status === 'done').length

  const filteredSlots = slots.filter(slot => {
    if (sourceFilter === 'all') return true
    if (slot.status !== 'done' || !slot.result?.parts) return true
    const hasDb = slot.result.parts.some((p: any) => p.priceSource === 'db')
    const hasAi = slot.result.parts.some((p: any) => p.priceSource === 'ai')
    if (sourceFilter === 'db') return hasDb
    return hasAi
  })

  async function deleteSavedPart(slotId: number, partId: string) {
    try {
      const res = await fetch(`/api/admin/snapshots/${partId}`, {
        method: 'DELETE',
        headers: { 'x-admin-token': adminToken },
      })
      if (!res.ok) throw new Error('삭제 실패')
      const slot = slots.find(s => s.id === slotId)
      if (!slot?.result?.parts) return
      const nextParts = slot.result.parts.filter((p: any) => p.partId !== partId)
      update(slotId, {
        result: {
          ...slot.result,
          parts: nextParts,
        },
      })
    } catch {
      // ignore UI delete failure for now
    }
  }

  async function analyzeUrl() {
    if (!url.trim()) return
    setUrlLoading(true)
    setUrlMessage('')
    setUrlPreview(null)
    try {
      const res = await fetch('/api/admin/url-analyze', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-token': adminToken,
        },
        body: JSON.stringify({ url: url.trim() }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.message ?? 'URL 분석 실패')
      if (data.skipped) {
        setUrlMessage(data.message ?? '이미 등록된 URL입니다.')
        return
      }
      setUrlPreview(data.preview)
      setUrlMessage('분석 완료. 미리보기 확인 후 저장하세요.')
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('stats:refresh'))
        localStorage.setItem('stats:refresh', Date.now().toString())
      }
    } catch (e: any) {
      setUrlMessage(e.message ?? 'URL 분석 중 오류가 발생했습니다.')
    } finally {
      setUrlLoading(false)
    }
  }

  async function updateBuyoutPrices() {
    setBuyoutLoading(true)
    setBuyoutMessage('')
    try {
      const res = await fetch('/api/admin/fetch-buyout', {
        method: 'POST',
        headers: { 'x-admin-token': adminToken },
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.message ?? '매입가 업데이트 실패')
      setBuyoutMessage(data.message ?? `저장 ${data.inserted}건 완료`)
      await fetchHealthCheck()
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('stats:refresh'))
        localStorage.setItem('stats:refresh', Date.now().toString())
      }
    } catch (e: any) {
      setBuyoutMessage(e.message ?? '매입가 업데이트 중 오류가 발생했습니다.')
    } finally {
      setBuyoutLoading(false)
    }
  }

  async function updateNaverNewPrices() {
    setNaverLoading(true)
    setNaverMessage('')
    try {
      const res = await fetch('/api/admin/fetch-naver', {
        method: 'POST',
        headers: { 'x-admin-token': adminToken },
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.message ?? '네이버 신품가 업데이트 실패')
      setNaverMessage(data.message ?? `저장 ${data.inserted}건 완료`)
      await fetchHealthCheck()
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('stats:refresh'))
        localStorage.setItem('stats:refresh', Date.now().toString())
      }
    } catch (e: any) {
      setNaverMessage(e.message ?? '네이버 신품가 업데이트 중 오류가 발생했습니다.')
    } finally {
      setNaverLoading(false)
    }
  }

  async function generateAiPrices() {
    setAiPricesLoading(true)
    setAiPricesMessage('')
    try {
      const res = await fetch('/api/admin/generate-ai-prices', {
        method: 'POST',
        headers: { 'x-admin-token': adminToken },
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.message ?? 'AI 시세 생성 실패')
      setAiPricesMessage(data.message ?? `${data.partsGenerated ?? 0}개 부품 시세 생성됨`)
      await fetchHealthCheck()
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('stats:refresh'))
        localStorage.setItem('stats:refresh', Date.now().toString())
      }
    } catch (e: any) {
      setAiPricesMessage(e.message ?? 'AI 시세 생성 중 오류가 발생했습니다.')
    } finally {
      setAiPricesLoading(false)
    }
  }

  async function saveUrlPreview() {
    if (!urlPreview) return
    setUrlSaving(true)
    setUrlMessage('')
    try {
      const res = await fetch('/api/admin/url-save', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-token': adminToken,
        },
        body: JSON.stringify(urlPreview),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.message ?? '저장 실패')
      if (data.skipped) {
        setUrlMessage(data.message ?? '이미 등록된 URL입니다.')
      } else {
        setUrlMessage(`${data.inserted ?? 0}개 부품이 DB에 저장되었습니다.`)
        setUrlPreview(null)
      }
    } catch (e: any) {
      setUrlMessage(e.message ?? 'DB 저장 중 오류가 발생했습니다.')
    } finally {
      setUrlSaving(false)
    }
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      {/* 데이터 이상 감지 */}
      <div className="mb-8 rounded-xl border border-zinc-200 bg-zinc-50 p-4">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold text-zinc-800">데이터 이상 감지</h2>
          {healthCheck?.hasAnomaly ? (
            <span className="rounded-full bg-red-600 px-2 py-0.5 text-[10px] font-semibold text-white">
              이상
            </span>
          ) : null}
        </div>
        <p className="mt-1 text-xs text-zinc-600">
          price_snapshots 테이블 이상치·오늘 저장 현황을 확인합니다.
        </p>

        {healthLoading ? (
          <p className="mt-3 text-xs text-zinc-500">불러오는 중...</p>
        ) : healthCheck ? (
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="rounded-lg border border-zinc-200 bg-white p-3">
              <div className="flex items-center justify-between">
                <p className="text-xs text-zinc-500">₩1,000 미만</p>
                {healthCheck.checks.tooLowCount > 0 ? (
                  <span className="rounded-full bg-red-600 px-2 py-0.5 text-[10px] font-semibold text-white">
                    {healthCheck.checks.tooLowCount}
                  </span>
                ) : (
                  <span className="text-sm font-medium text-zinc-800">
                    {healthCheck.checks.tooLowCount}
                  </span>
                )}
              </div>
            </div>

            <div className="rounded-lg border border-zinc-200 bg-white p-3">
              <div className="flex items-center justify-between">
                <p className="text-xs text-zinc-500">₩10,000,000 초과</p>
                {healthCheck.checks.tooHighCount > 0 ? (
                  <span className="rounded-full bg-red-600 px-2 py-0.5 text-[10px] font-semibold text-white">
                    {healthCheck.checks.tooHighCount}
                  </span>
                ) : (
                  <span className="text-sm font-medium text-zinc-800">
                    {healthCheck.checks.tooHighCount}
                  </span>
                )}
              </div>
            </div>

            <div className="rounded-lg border border-zinc-200 bg-white p-3">
              <div className="flex items-center justify-between">
                <p className="text-xs text-zinc-500">오늘 BUYOUT 저장</p>
                <span className="text-sm font-medium text-zinc-800">
                  {healthCheck.checks.todayBuyoutCount}
                </span>
              </div>
            </div>

            <div className="rounded-lg border border-zinc-200 bg-white p-3 sm:col-span-2">
              <p className="text-xs text-zinc-500 mb-2">오늘 sourceType별 저장</p>
              {healthCheck.checks.todayBySource.length === 0 ? (
                <p className="text-xs text-zinc-400">오늘 저장된 거래 데이터 없음</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {healthCheck.checks.todayBySource.map((row) => (
                    <span
                      key={row.sourceType}
                      className="rounded-md border border-zinc-200 bg-zinc-50 px-2 py-1 text-xs text-zinc-700"
                    >
                      {row.sourceType}{' '}
                      <span className="font-semibold tabular-nums">{row.count}</span>
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : (
          <p className="mt-3 text-xs text-red-600">헬스체크를 불러오지 못했습니다.</p>
        )}

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            onClick={fetchHealthCheck}
            disabled={healthLoading}
            className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-xs text-zinc-700 disabled:opacity-50"
          >
            새로고침
          </button>
          <button
            onClick={deleteTooLowSnapshots}
            disabled={
              cleanupLoading ||
              healthLoading ||
              !healthCheck?.checks.tooLowCount
            }
            className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
          >
            {cleanupLoading ? '삭제 중...' : '₩1,000 미만 데이터 삭제'}
          </button>
          {cleanupMessage ? (
            <p className="text-xs text-zinc-600">{cleanupMessage}</p>
          ) : null}
        </div>
      </div>

      {/* 신고된 가격 */}
      <div className="mb-8 rounded-xl border border-orange-200 bg-orange-50 p-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-orange-800">신고된 가격</h2>
          <button
            onClick={fetchReportedPrices}
            disabled={reportedLoading}
            className="rounded-lg border border-orange-300 bg-white px-2 py-1 text-xs text-orange-800 disabled:opacity-50"
          >
            새로고침
          </button>
        </div>
        <p className="mt-1 text-xs text-orange-700">
          사용자가 &quot;이 가격이 이상해요&quot;로 신고한 최근 내역입니다.
        </p>
        {reportedLoading ? (
          <p className="mt-3 text-xs text-orange-600">불러오는 중...</p>
        ) : reportedPrices.length === 0 ? (
          <p className="mt-3 text-xs text-orange-600">신고 내역이 없습니다.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {reportedPrices.map((row) => (
              <li
                key={row.id}
                className="rounded-lg border border-orange-200 bg-white px-3 py-2 text-xs text-zinc-700"
              >
                <div className="font-medium text-zinc-900">{row.partName}</div>
                <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-zinc-600">
                  <span>신고가 {krw(row.reportedPrice)}</span>
                  <span>{row.reason === 'too_high' ? '너무 비쌈' : '너무 쌈'}</span>
                  <span>{new Date(row.createdAt).toLocaleString('ko-KR')}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* 빠른 액션 */}
      <div className="mb-8 rounded-xl border border-violet-200 bg-violet-50 p-4">
        <h2 className="text-sm font-semibold text-violet-800">빠른 액션</h2>
        <p className="mt-1 text-xs text-violet-700">
          실거래 3건 미만인 활성 부품에 대해 Claude로 중고 시세(low/mid/high)를 생성해 저장합니다.
        </p>
        <div className="mt-3 flex items-center gap-3">
          <button
            onClick={generateAiPrices}
            disabled={aiPricesLoading}
            className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {aiPricesLoading ? '생성 중...' : 'AI 시세 자동 생성'}
          </button>
          {aiPricesMessage ? (
            <p className="text-xs text-violet-800">{aiPricesMessage}</p>
          ) : null}
        </div>
      </div>

      {/* 네이버 쇼핑 신품가 업데이트 */}
      <div className="mb-8 rounded-xl border border-green-200 bg-green-50 p-4">
        <h2 className="text-sm font-semibold text-green-800">네이버 쇼핑 신품가</h2>
        <p className="mt-1 text-xs text-green-700">
          활성 부품 전체에 대해 네이버 쇼핑 API로 신품 최저가를 수집해 NAVER_SHOPPING 거래 데이터로 저장합니다.
        </p>
        <div className="mt-3 flex items-center gap-3">
          <button
            onClick={updateNaverNewPrices}
            disabled={naverLoading}
            className="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {naverLoading ? '업데이트 중...' : '신품가 업데이트'}
          </button>
          {naverMessage ? (
            <p className="text-xs text-green-800">{naverMessage}</p>
          ) : null}
        </div>
      </div>

      {/* 매입가 업데이트 */}
      <div className="mb-8 rounded-xl border border-blue-200 bg-blue-50 p-4">
        <h2 className="text-sm font-semibold text-blue-800">월드메모리 매입가</h2>
        <p className="mt-1 text-xs text-blue-700">
          worldmemory.co.kr 매입 단가표를 긁어와 BUYOUT 거래 데이터로 저장합니다.
        </p>
        <div className="mt-3 flex items-center gap-3">
          <button
            onClick={updateBuyoutPrices}
            disabled={buyoutLoading}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {buyoutLoading ? '업데이트 중...' : '매입가 업데이트'}
          </button>
          {buyoutMessage ? (
            <p className="text-xs text-blue-800">{buyoutMessage}</p>
          ) : null}
        </div>
      </div>

      {/* URL 분석 섹션 */}
      <div className="mb-8 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
        <h2 className="text-sm font-semibold text-emerald-800">매물 URL 분석</h2>
        <p className="mt-1 text-xs text-emerald-700">
          URL → 크롤링 → Claude 파싱 → 미리보기 확인 → DB 저장 순서로 진행됩니다.
        </p>
        <div className="mt-3 flex gap-2">
          <input
            value={url}
            onChange={e => setUrl(e.target.value)}
            placeholder="https://..."
            className="flex-1 rounded-lg border border-emerald-300 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-300"
          />
          <button
            onClick={analyzeUrl}
            disabled={urlLoading}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {urlLoading ? '분석 중...' : '분석'}
          </button>
        </div>

        {urlMessage ? (
          <p className="mt-2 text-xs text-emerald-800">{urlMessage}</p>
        ) : null}

        {urlPreview ? (
          <div className="mt-4 rounded-lg border border-emerald-200 bg-white p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-sm font-medium text-zinc-900">{urlPreview.title}</p>
                <p className="text-xs text-zinc-500">{urlPreview.sourceUrl}</p>
              </div>
              <div className="text-right text-xs text-zinc-600">
                <p>출처: {urlPreview.source}</p>
                <p>판매상태: {urlPreview.soldStatus}</p>
                <p>등록일: {urlPreview.registeredAt ? new Date(urlPreview.registeredAt).toLocaleString('ko-KR') : '알수없음'}</p>
              </div>
            </div>

            <div className="mt-3 overflow-hidden rounded-md border">
              <table className="w-full text-xs">
                <thead className="bg-zinc-50">
                  <tr>
                    <th className="px-2 py-2 text-left font-medium text-zinc-500">카테고리</th>
                    <th className="px-2 py-2 text-left font-medium text-zinc-500">부품명</th>
                    <th className="px-2 py-2 text-right font-medium text-zinc-500">가격</th>
                    <th className="px-2 py-2 text-center font-medium text-zinc-500">상태</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {urlPreview.parts.map((part, idx) => (
                    <tr key={`${part.name}-${idx}`}>
                      <td className="px-2 py-2">{part.category}</td>
                      <td className="px-2 py-2">{part.name}</td>
                      <td className="px-2 py-2 text-right">{krw(part.price)}</td>
                      <td className="px-2 py-2 text-center">{part.condition}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-3 flex justify-end">
              <button
                onClick={saveUrlPreview}
                disabled={urlSaving}
                className="rounded-lg bg-teal-600 px-4 py-2 text-xs font-medium text-white disabled:opacity-50"
              >
                {urlSaving ? '저장 중...' : 'DB 저장'}
              </button>
            </div>
          </div>
        ) : null}
      </div>

      {/* 헤더 */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-medium">매물 입력</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            칸 하나에 매물 하나씩 — 여러 개 동시에 분석할 수 있어요
          </p>
        </div>
        <div className="flex gap-2">
          <select
            value={sourceFilter}
            onChange={e => setSourceFilter(e.target.value as 'all' | 'db' | 'ai')}
            className="text-sm px-3 py-2 border rounded-lg bg-white"
          >
            <option value="all">전체</option>
            <option value="db">DB 포함</option>
            <option value="ai">AI 포함</option>
          </select>
          <button
            onClick={addSlot}
            className="text-sm px-4 py-2 border rounded-lg hover:bg-gray-50"
          >
            + 칸 추가
          </button>
          <button
            onClick={analyzeAll}
            disabled={filledCount === 0}
            className="text-sm px-4 py-2 bg-gray-900 text-white rounded-lg disabled:opacity-40"
          >
            전체 분석 ({filledCount}개)
          </button>
        </div>
      </div>

      {/* 슬롯 그리드 */}
      <div className="grid grid-cols-1 gap-4">
        {filteredSlots.map((slot, idx) => (
          <div key={slot.id}
            className={`border rounded-xl overflow-hidden transition-colors ${
              slot.status === 'done' ? 'border-teal-200' :
              slot.status === 'error' ? 'border-red-200' : 'border-gray-200'
            }`}
          >
            {/* 슬롯 헤더 */}
            <div className="flex items-center justify-between px-4 py-2.5 bg-gray-50 border-b">
              <span className="text-xs font-medium text-gray-500">매물 {idx + 1}</span>
              <div className="flex items-center gap-2">
                {slot.status === 'loading' && (
                  <span className="text-xs text-blue-500">분석 중...</span>
                )}
                {slot.status === 'done' && (
                  <span className="text-xs text-teal-600">✓ 완료</span>
                )}
                {slot.status === 'error' && (
                  <span className="text-xs text-red-500">오류</span>
                )}
                <button
                  onClick={() => removeSlot(slot.id)}
                  className="text-xs text-gray-300 hover:text-gray-500 px-1"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* 입력창 */}
            {slot.status !== 'done' && (
              <div className="p-3">
                <textarea
                  value={slot.text}
                  onChange={e => update(slot.id, { text: e.target.value, status: 'idle' })}
                  rows={4}
                  placeholder={`매물 ${idx + 1} 본문 붙여넣기\n\n예) RTX 4070 팝니다. 3개월 사용, 52만원`}
                  className="w-full text-sm font-mono border-0 bg-transparent resize-none focus:outline-none text-gray-700 placeholder-gray-300"
                />
                {slot.status === 'error' && (
                  <p className="text-xs text-red-500 mt-1">{slot.error}</p>
                )}
                {slot.text.trim() && slot.status === 'idle' && (
                  <div className="flex justify-end mt-2">
                    <button
                      onClick={() => analyzeOne(slot)}
                      className="text-xs px-3 py-1.5 bg-gray-900 text-white rounded-lg"
                    >
                      이것만 분석
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* 결과 */}
            {slot.status === 'done' && slot.result && (
              <div className="p-4 space-y-3">
                {/* 판정 + 가격 */}
                <div className="flex items-center justify-between">
                  <div>
                    <span className={`text-sm font-medium px-3 py-1 rounded-full ${
                      slot.result.verdict === 'CHEAP' ? 'bg-blue-50 text-blue-700' :
                      slot.result.verdict === 'FAIR'  ? 'bg-green-50 text-green-700' :
                      'bg-red-50 text-red-700'
                    }`}>
                      {slot.result.verdictKo ?? '—'}
                    </span>
                    <span className="text-xs text-gray-400 ml-2">
                      {slot.result.verdictReason}
                    </span>
                  </div>
                  <div className="text-right">
                    <div className="text-xs text-gray-400">적정가</div>
                    <div className="font-semibold">{krw(slot.result.totalFairMid)}</div>
                  </div>
                </div>

                {/* 부품 목록 */}
                <div className="border rounded-lg overflow-hidden">
                  <table className="w-full text-xs">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="text-left px-3 py-2 text-gray-400 font-medium">부품</th>
                        <th className="text-right px-3 py-2 text-gray-400 font-medium">중고 적정가</th>
                        <th className="text-center px-3 py-2 text-gray-400 font-medium">상태</th>
                        <th className="text-center px-3 py-2 text-gray-400 font-medium">출처</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {slot.result.parts?.map((p: any, i: number) => (
                        <tr key={i}>
                          <td className="px-3 py-2 font-medium">{p.partName}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{krw(p.usedMid)}</td>
                          <td className="px-3 py-2 text-center text-gray-500">
                            {CONDITION_KO[p.condition] ?? p.condition}
                          </td>
                          <td className="px-3 py-2 text-center">
                            <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${
                              p.priceSource === 'db'
                                ? 'bg-green-50 text-green-700'
                                : 'bg-orange-50 text-orange-600'
                            }`}>
                              {p.priceSource === 'db' ? 'DB' : 'AI'}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-right">
                            {p.partId ? (
                              <button
                                onClick={() => deleteSavedPart(slot.id, p.partId)}
                                className="text-[11px] px-2 py-0.5 border rounded text-red-600 hover:bg-red-50"
                              >
                                삭제
                              </button>
                            ) : null}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* 액션 버튼 */}
                <div className="flex gap-2 justify-end">
                  <button
                    onClick={() => update(slot.id, { status: 'idle', result: null })}
                    className="text-xs px-3 py-1.5 border rounded-lg text-gray-500 hover:bg-gray-50"
                  >
                    다시 입력
                  </button>
                  {slot.saved ? (
                    <span className="text-xs px-3 py-1.5 text-teal-600">✓ 저장됨</span>
                  ) : (
                    <button
                      onClick={() => saveOne(slot)}
                      className="text-xs px-3 py-1.5 bg-teal-600 text-white rounded-lg"
                    >
                      DB 저장
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* 하단 전체 저장 */}
      {doneCount > 0 && (
        <div className="mt-6 flex justify-end">
          <button
            onClick={() => slots.filter(s => s.status === 'done' && !s.saved).forEach(saveOne)}
            className="text-sm px-5 py-2.5 bg-teal-600 text-white rounded-xl"
          >
            완료된 {doneCount}개 전부 저장
          </button>
        </div>
      )}
    </div>
  )
}
