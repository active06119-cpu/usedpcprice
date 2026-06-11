// ============================================================
// scripts/import/sources/bunjang.ts (강화 버전)
//
// 변경 사항:
//   - XHR 인터셉트 우선 (API 엔드포인트 변경 대응)
//   - Playwright DOM 폴백
//   - 가격 패턴 역추적 최후 수단
//   - 실패 시 HTML 자동 덤프
// ============================================================

import { PrismaClient, SnapshotSource, PartCondition } from '@prisma/client'
import { chromium, Browser, Page } from 'playwright'
import * as fs from 'fs'
import * as path from 'path'

const prisma = new PrismaClient()
const DEBUG_DIR = path.join(process.cwd(), 'debug-output')

let browser: Browser | null = null

async function getBrowser(): Promise<Browser> {
  if (!browser) {
    browser = await chromium.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-blink-features=AutomationControlled',
        '--disable-dev-shm-usage',
        '--lang=ko-KR',
      ],
    })
  }
  return browser
}

export async function closeBrowser() {
  if (browser) { await browser.close(); browser = null }
}

interface ScrapedItem {
  title: string
  priceKrw: number
  isSold: boolean
  url: string
  condition?: string
}

// ============================================================
// XHR 인터셉트 — 번개장터 내부 API 자동 감지
// ============================================================
function extractFromBunjangJson(data: any, out: ScrapedItem[], depth = 0) {
  if (depth > 6 || !data || typeof data !== 'object') return
  if (Array.isArray(data)) {
    data.forEach(d => extractFromBunjangJson(d, out, depth + 1))
    return
  }

  // 번개장터 응답 필드명 후보 (구버전 / 신버전 모두 커버)
  const priceValue = data.price ?? data.salePrice ?? data.sale_price ?? data.prc
  const titleValue = data.name ?? data.title ?? data.product_name ?? data.pname

  if (priceValue !== undefined && titleValue !== undefined) {
    const priceKrw = typeof priceValue === 'number'
      ? priceValue
      : parseInt(String(priceValue).replace(/[^0-9]/g, ''), 10)

    if (!isNaN(priceKrw) && priceKrw > 0) {
      const status = data.status ?? data.tradeStatus ?? data.trade_status ?? ''
      const isSold = ['closed', 'reserved', 'traded', 'sold', '예약중', '판매완료']
        .some(s => String(status).toLowerCase().includes(s))

      const pid = data.pid ?? data.id ?? data.product_id ?? ''
      out.push({
        title: String(titleValue),
        priceKrw,
        isSold,
        url: pid ? `https://m.bunjang.co.kr/products/${pid}` : 'https://m.bunjang.co.kr',
      })
    }
  }

  Object.values(data).forEach(v => extractFromBunjangJson(v, out, depth + 1))
}

// ============================================================
// 전략 1: 기존 XHR API 직접 호출 (구버전 엔드포인트)
// ============================================================
const BUNJANG_API_CANDIDATES = [
  (q: string) => `https://search.bunjang.co.kr/api/1/find/products?q=${encodeURIComponent(q)}&order=date&page=0&n=30&status=live`,
  (q: string) => `https://api.bunjang.co.kr/api/1/find/products?q=${encodeURIComponent(q)}&order=date&page=0&n=30`,
  (q: string) => `https://api2.bunjang.co.kr/api/1/find/products?q=${encodeURIComponent(q)}&page=0&n=30`,
]

async function tryDirectApi(query: string): Promise<ScrapedItem[]> {
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/125.0.0.0 Safari/537.36',
    'Accept': 'application/json',
    'Accept-Language': 'ko-KR,ko;q=0.9',
    'Referer': 'https://m.bunjang.co.kr/',
    'Origin': 'https://m.bunjang.co.kr',
  }

  for (const buildUrl of BUNJANG_API_CANDIDATES) {
    const url = buildUrl(query)
    try {
      const res = await fetch(url, { headers })
      if (!res.ok) continue

      const ct = res.headers.get('content-type') ?? ''
      if (!ct.includes('application/json')) continue

      const data = await res.json()
      const items: ScrapedItem[] = []
      extractFromBunjangJson(data, items)

      if (items.length > 0) {
        return items
      }
    } catch {}
  }
  return []
}

// ============================================================
// 전략 2: Playwright + XHR 인터셉트
// ============================================================
async function tryPlaywrightWithIntercept(query: string): Promise<ScrapedItem[]> {
  const b = await getBrowser()
  const page = await b.newPage()

  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined })
    Object.defineProperty(navigator, 'languages', { get: () => ['ko-KR', 'ko'] })
  })
  await page.route('**/*.{png,jpg,jpeg,gif,webp,svg,woff,woff2,ttf}', r => r.abort())
  await page.route(/google-analytics|googletagmanager|amplitude|clarity/, r => r.abort())

  const xhrItems: ScrapedItem[] = []

  page.on('response', async res => {
    const ct = res.headers()['content-type'] ?? ''
    if (!ct.includes('application/json')) return
    const url = res.url()
    if (!url.includes('bunjang') && !url.includes('api')) return
    try {
      const data = await res.json()
      extractFromBunjangJson(data, xhrItems)
    } catch {}
  })

  const url = `https://m.bunjang.co.kr/search/products?q=${encodeURIComponent(query)}`

  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15_000 })
    await page.waitForTimeout(3000) // XHR 완료 대기

    if (xhrItems.length > 0) {
      await page.close()
      return xhrItems
    }

    // XHR도 없으면 DOM 파싱
    const domItems = await tryDomScraping(page)
    await page.close()
    return domItems

  } catch (err: any) {
    await dumpHtmlForDebug(page, query)
    await page.close()
    return []
  }
}

// ============================================================
// 전략 3: DOM 파싱 (셀렉터 후보 목록)
// ============================================================
const CARD_SELECTORS = [
  'li[data-pid]',
  'li[class*="ProductCard"]',
  'li[class*="product"]',
  'li[class*="item"]',
  'article[class*="product"]',
  'div[class*="ProductCard"]',
  'ul li',
]

async function tryDomScraping(page: Page): Promise<ScrapedItem[]> {
  return page.evaluate((cardSels: string[]) => {
    const results: any[] = []
    const byProductLink = Array.from(document.querySelectorAll('a[href*="/products/"]')) as HTMLAnchorElement[]

    for (const link of byProductLink) {
      const container = (link.closest('li, article, div') as Element | null) ?? link.parentElement
      const allText = (container?.textContent ?? link.textContent ?? '').replace(/\s+/g, ' ').trim()
      const priceMatch = allText.match(/([\d,]+)\s*원/)
      if (!priceMatch) continue

      const priceKrw = parseInt(priceMatch[1].replace(/,/g, ''), 10)
      if (!priceKrw || priceKrw <= 0) continue

      const titleCandidates = allText
        .split(/\n| {2,}/)
        .map(s => s.trim())
        .filter(s => s.length >= 4 && !/^[\d,\s]+원$/.test(s))
      const title = titleCandidates[0] ?? ''
      if (!title) continue

      const pid = link.getAttribute('href')?.match(/\/products\/(\d+)/)?.[1] ?? ''
      const isSold = /거래완료|예약중|판매완료|품절/i.test(allText)
      results.push({
        title,
        priceKrw,
        isSold,
        url: pid ? `https://m.bunjang.co.kr/products/${pid}` : (link.href || 'https://m.bunjang.co.kr'),
      })
    }

    if (results.length > 0) {
      const uniq = new Map<string, any>()
      for (const item of results) {
        const key = `${item.url}|${item.priceKrw}`
        if (!uniq.has(key)) uniq.set(key, item)
      }
      return Array.from(uniq.values())
    }

    const priceEls = Array.from(document.querySelectorAll('p, span, strong'))
      .filter(el => /[\d,]+\s*원/.test(el.textContent ?? ''))

    for (const priceEl of priceEls) {
      const priceText = priceEl.textContent ?? ''
      const match = priceText.match(/([\d,]+)\s*원/)
      if (!match) continue

      const priceKrw = parseInt(match[1].replace(/,/g, ''), 10)
      if (!priceKrw || priceKrw <= 0) continue

      const wrap = (priceEl.closest('li, article, section, div') as Element | null) ?? priceEl.parentElement
      if (!wrap) continue

      const text = (wrap.textContent ?? '').replace(/\s+/g, ' ').trim()
      const title = text
        .split(/\n| {2,}/)
        .map(s => s.trim())
        .find(s => s.length >= 4 && !/^[\d,\s]+원$/.test(s)) ?? ''
      if (!title) continue

      const isSold = /거래완료|예약중|판매완료|품절/i.test(text)
      const link = wrap.querySelector('a[href]') as HTMLAnchorElement | null
      results.push({
        title,
        priceKrw,
        isSold,
        url: link?.href ?? 'https://m.bunjang.co.kr',
      })
    }

    if (results.length > 0) {
      const uniq = new Map<string, any>()
      for (const item of results) {
        const key = `${item.title}|${item.priceKrw}`
        if (!uniq.has(key)) uniq.set(key, item)
      }
      return Array.from(uniq.values())
    }

    let cards: Element[] = []

    for (const sel of cardSels) {
      const found = Array.from(document.querySelectorAll(sel))
      if (found.length > 2) { cards = found; break }
    }

    for (const card of cards) {
      const allText = card.textContent ?? ''
      const priceMatch = allText.match(/([\d,]+)\s*원/)
      if (!priceMatch) continue

      const priceKrw = parseInt(priceMatch[1].replace(/,/g, ''), 10)
      if (!priceKrw || priceKrw <= 0) continue

      const els = Array.from(card.querySelectorAll('span, p, strong, a'))
      const titleEl = els
        .filter(el => (el.textContent?.trim().length ?? 0) > 5)
        .sort((a, b) => (b.textContent?.length ?? 0) - (a.textContent?.length ?? 0))[0]
      const title = titleEl?.textContent?.trim() ?? ''
      if (!title) continue

      const isSold = allText.includes('거래완료') || allText.includes('예약중') || allText.includes('판매완료')
      const linkEl = card.querySelector('a[href*="/products/"]') as HTMLAnchorElement | null
      const pid = card.getAttribute('data-pid') ?? ''

      results.push({
        title,
        priceKrw,
        isSold,
        url: pid
          ? `https://m.bunjang.co.kr/products/${pid}`
          : (linkEl?.href ?? 'https://m.bunjang.co.kr'),
      })
    }
    return results
  }, CARD_SELECTORS)
}

// ============================================================
// 공통 유틸
// ============================================================
async function dumpHtmlForDebug(page: Page, query: string) {
  try {
    fs.mkdirSync(DEBUG_DIR, { recursive: true })
    const html = await page.content()
    const p = path.join(DEBUG_DIR, `bunjang-fail-${Date.now()}.html`)
    fs.writeFileSync(p, html, 'utf-8')
    console.error(`  [Bunjang] HTML 덤프 → ${p}`)
  } catch {}
}

function isPriceSane(priceKrw: number, category: string): boolean {
  const limits: Record<string, [number, number]> = {
    GPU: [30_000, 5_000_000], CPU: [20_000, 2_000_000],
    RAM: [10_000, 500_000],   SSD: [10_000, 1_000_000],
    HDD: [10_000, 500_000],   MOTHERBOARD: [20_000, 1_500_000],
    PSU: [15_000, 600_000],   OTHER: [5_000, 10_000_000],
  }
  const [min, max] = limits[category] ?? limits.OTHER
  return priceKrw >= min && priceKrw <= max
}

function inferCondition(title: string): PartCondition {
  const t = title.toLowerCase()
  if (/미개봉|새제품|신품|박봉/.test(t))               return PartCondition.NEW
  if (/거의새것|개봉만|미사용|최상급|풀박스/.test(t))   return PartCondition.LIKE_NEW
  if (/상태좋음|상급|사용감\s*없|깨끗|s급/.test(t))     return PartCondition.GOOD
  if (/사용감|b급|약간의/.test(t))                      return PartCondition.FAIR
  if (/부품용|불량|파손|고장/.test(t))                  return PartCondition.POOR
  return PartCondition.GOOD
}

// ============================================================
// 메인 임포터
// ============================================================
export async function runBunjangImport(batchId: string): Promise<number> {
  const parts = await prisma.part.findMany({
    where: { isActive: true },
    select: { id: true, brandName: true, modelName: true, category: true, fullName: true },
  })

  let totalInserted = 0

  for (const part of parts) {
    const query = `${part.brandName} ${part.modelName}`

    try {
      // 전략 1: 직접 API 호출 (빠름)
      let items = await tryDirectApi(query)

      // 전략 2: Playwright 폴백
      if (items.length === 0) {
        console.log(`  [Bunjang] 직접 API 실패 → Playwright 시도: "${part.fullName}"`)
        items = await tryPlaywrightWithIntercept(query)
      }

      if (items.length === 0) {
        console.warn(`  [Bunjang] 전략 전부 실패: "${part.fullName}"`)
        await new Promise(r => setTimeout(r, 1000))
        continue
      }

      let saved = 0
      for (const item of items) {
        if (item.isSold || !isPriceSane(item.priceKrw, part.category)) continue

        await prisma.priceSnapshot.create({
          data: {
            partId: part.id,
            batchId,
            sourceType: SnapshotSource.BUNJANG,
            sourceUrl: item.url,
            priceKrw: item.priceKrw,
            condition: inferCondition(item.title),
            rawText: JSON.stringify({
              title: item.title,
              price: item.priceKrw,
              source: 'bunjang',
              query,
            }),
          },
        })
        saved++
      }

      totalInserted += saved
      if (saved > 0) console.log(`  [Bunjang] "${part.fullName}" → ${saved}개`)

    } catch (err: any) {
      console.error(`  [Bunjang] 오류 "${part.fullName}": ${err.message}`)
    }

    await new Promise(r => setTimeout(r, 800 + Math.random() * 400))
  }

  await closeBrowser()
  return totalInserted
}
