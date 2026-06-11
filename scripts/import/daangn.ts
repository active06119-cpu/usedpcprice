// ============================================================
// scripts/import/sources/daangn.ts (셀렉터 강화 버전)
//
// 변경 사항:
//   - 셀렉터 3단계 폴백 전략
//   - XHR API 인터셉트 (당근 내부 API 자동 감지)
//   - 가격 패턴 기반 DOM 탐색 (셀렉터 없어도 동작)
//   - 셀렉터 변경 감지 시 자동 HTML 덤프
// ============================================================

import { PrismaClient, SnapshotSource, PartCondition } from '@prisma/client'
import { chromium, Browser, Page } from 'playwright'
import * as fs from 'fs'
import * as path from 'path'

const prisma = new PrismaClient()
const DAANGN_SEARCH_BASE = 'https://www.daangn.com/search/flea-markets'
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

interface InterceptedItem {
  title: string
  priceKrw: number
  region: string
  isSold: boolean
  url: string
}

// ============================================================
// 전략 1: XHR API 인터셉트
// 당근 웹앱이 내부 JSON API를 호출하면 그 응답을 직접 파싱.
// 셀렉터 변경과 무관하게 동작하는 가장 안정적인 방법.
// ============================================================
function extractItemsFromJson(data: any, query: string, out: InterceptedItem[], depth = 0) {
  if (depth > 6 || !data || typeof data !== 'object') return

  if (Array.isArray(data)) {
    data.forEach(item => extractItemsFromJson(item, query, out, depth + 1))
    return
  }

  // 당근 API 응답 필드명 후보
  const priceValue = data.price ?? data.priceText ?? data.price_text ?? data.salePrice
  const titleValue = data.title ?? data.name ?? data.content ?? data.subject

  if (priceValue !== undefined && titleValue !== undefined) {
    const priceKrw = typeof priceValue === 'number'
      ? priceValue
      : parseInt(String(priceValue).replace(/[^0-9]/g, ''), 10)

    if (!isNaN(priceKrw) && priceKrw > 0) {
      const isSold =
        data.status === 'CLOSED' ||
        data.tradeStatus === 'RESERVED' ||
        data.tradeStatus === 'TRADED' ||
        data.soldOut === true

      const id = data.id ?? data.articleId ?? data.productId ?? ''
      out.push({
        title: String(titleValue),
        priceKrw,
        region: String(data.regionName ?? data.region ?? data.location ?? ''),
        isSold,
        url: id ? `https://www.daangn.com/articles/${id}` : DAANGN_SEARCH_BASE,
      })
    }
  }

  Object.values(data).forEach(v => extractItemsFromJson(v, query, out, depth + 1))
}

// ============================================================
// 전략 2: DOM 셀렉터 (알려진 후보 순서대로 시도)
// ============================================================
const CONTAINER_SELECTORS = [
  '[data-gtm="search-result-list"]',
  '[data-testid="search-result-list"]',
  '#search-result-list',
  'section[class*="SearchResult"]',
  'ul[class*="ArticleList"]',
  'ul[class*="article"]',
  'ul[class*="list"]',
  'div[class*="ArticleList"]',
  'main ul',
]

const CARD_SELECTORS = [
  'article[data-gtm="search-result-item"]',
  'article[data-testid]',
  'li[data-testid]',
  'li[class*="article"]',
  'article',
]

async function tryDomScraping(page: Page): Promise<InterceptedItem[]> {
  // 작동하는 컨테이너 셀렉터 찾기
  let foundContainer: string | null = null
  for (const sel of CONTAINER_SELECTORS) {
    const exists = await page.$(sel).then(el => !!el)
    if (exists) { foundContainer = sel; break }
  }

  if (!foundContainer) {
    // 컨테이너도 못 찾으면 가격 패턴 역추적
    return tryPricePatternScraping(page)
  }

  return page.evaluate((cardSels: string[]) => {
    const results: any[] = []
    let cards: Element[] = []

    for (const sel of cardSels) {
      const found = Array.from(document.querySelectorAll(sel))
      if (found.length > 0) { cards = found; break }
    }
    if (cards.length === 0) cards = Array.from(document.querySelectorAll('article'))

    for (const card of cards) {
      const allText = card.textContent ?? ''
      const priceMatch = allText.match(/([\d,]+)\s*원/)
      if (!priceMatch) continue
      const priceKrw = parseInt(priceMatch[1].replace(/,/g, ''), 10)
      if (!priceKrw) continue

      const anchors = Array.from(card.querySelectorAll('a, span, p'))
      const titleEl = anchors
        .filter(el => (el.textContent?.trim().length ?? 0) > 5 && /[가-힣a-zA-Z0-9]/.test(el.textContent ?? ''))
        .sort((a, b) => (b.textContent?.length ?? 0) - (a.textContent?.length ?? 0))[0]
      const title = titleEl?.textContent?.trim() ?? ''
      if (!title) continue

      const isSold = allText.includes('거래완료') || allText.includes('예약중')
      const linkEl = card.querySelector('a[href*="/articles/"], a[href*="/products/"], a[href]') as HTMLAnchorElement | null

      results.push({ title, priceKrw, region: '', isSold, url: linkEl?.href ?? 'https://www.daangn.com' })
    }
    return results
  }, CARD_SELECTORS)
}

// ============================================================
// 전략 3: 가격 패턴 역추적 (최후 수단)
// "숫자원" 텍스트 노드를 찾아 부모 컨테이너를 역추적
// ============================================================
async function tryPricePatternScraping(page: Page): Promise<InterceptedItem[]> {
  console.warn('  [Daangn] DOM 셀렉터 전부 실패 → 가격 패턴 역추적')

  return page.evaluate(() => {
    const results: any[] = []
    const seen = new Set<string>()
    const priceRegex = /([\d,]+)\s*원/

    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT,
      { acceptNode: n => priceRegex.test(n.textContent ?? '') ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP },
    )

    let node: Text | null
    while ((node = walker.nextNode() as Text | null)) {
      let el: Element | null = node.parentElement
      for (let i = 0; i < 5 && el; i++) {
        const text = el.textContent ?? ''
        const priceMatch = text.match(priceRegex)
        if (!priceMatch) { el = el.parentElement; continue }

        const priceKrw = parseInt(priceMatch[1].replace(/,/g, ''), 10)
        if (priceKrw > 0 && text.length > 10 && text.length < 500 && /[가-힣]/.test(text)) {
          const key = text.substring(0, 40)
          if (!seen.has(key)) {
            seen.add(key)
            const lines = text.split(/\n|\s{2,}/).map(l => l.trim()).filter(l => l.length > 5)
            const title = lines.find(l => !priceRegex.test(l) && /[가-힣]/.test(l)) ?? ''
            const linkEl = el.querySelector('a[href]') as HTMLAnchorElement | null
            results.push({
              title,
              priceKrw,
              region: '',
              isSold: text.includes('거래완료') || text.includes('예약중'),
              url: linkEl?.href ?? 'https://www.daangn.com',
            })
          }
          break
        }
        el = el.parentElement
      }
    }
    return results
  })
}

// ============================================================
// HTML 덤프 — 전략 전부 실패 시 자동 저장
// ============================================================
async function dumpHtmlForDebug(page: Page) {
  try {
    fs.mkdirSync(DEBUG_DIR, { recursive: true })
    const html = await page.content()
    const filePath = path.join(DEBUG_DIR, `daangn-fail-${Date.now()}.html`)
    fs.writeFileSync(filePath, html, 'utf-8')
    console.error(`  [Daangn] HTML 덤프 → ${filePath}`)
    console.error(`  [Daangn] VS Code에서 열고 "원" 검색 → 가격 요소 확인 후 CONTAINER_SELECTORS 업데이트`)
  } catch {}
}

// ============================================================
// 공통 유틸
// ============================================================
function isPriceSane(priceKrw: number, category: string): boolean {
  const limits: Record<string, [number, number]> = {
    GPU: [20_000, 4_000_000], CPU: [15_000, 1_800_000],
    RAM: [5_000, 450_000],   SSD: [5_000, 900_000],
    HDD: [5_000, 400_000],   MOTHERBOARD: [15_000, 1_200_000],
    PSU: [10_000, 500_000],  OTHER: [5_000, 10_000_000],
  }
  const [min, max] = limits[category] ?? limits.OTHER
  return priceKrw >= min && priceKrw <= max
}

function inferCondition(title: string): PartCondition {
  const t = title.toLowerCase()
  if (/미개봉|새제품|신품|박봉/.test(t))               return PartCondition.NEW
  if (/거의새것|개봉만|미사용|최상급|풀박스/.test(t))   return PartCondition.LIKE_NEW
  if (/상태좋음|상급|사용감\s*없|깨끗|a급/.test(t))     return PartCondition.GOOD
  if (/사용감|b급|약간의/.test(t))                      return PartCondition.FAIR
  if (/부품용|불량|파손|고장/.test(t))                  return PartCondition.POOR
  return PartCondition.GOOD
}

// ============================================================
// 메인 임포터
// ============================================================
export async function runDaangnImport(batchId: string): Promise<number> {
  const parts = await prisma.part.findMany({
    where: { isActive: true },
    select: { id: true, brandName: true, modelName: true, category: true, fullName: true },
  })

  const b = await getBrowser()
  const page = await b.newPage()

  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined })
    Object.defineProperty(navigator, 'languages', { get: () => ['ko-KR', 'ko'] })
  })
  await page.route('**/*.{png,jpg,jpeg,gif,webp,svg,woff,woff2,ttf}', r => r.abort())
  await page.route(/google-analytics|googletagmanager|facebook|amplitude|clarity/, r => r.abort())

  let totalInserted = 0

  for (const part of parts) {
    const query = part.modelName
    const url = `${DAANGN_SEARCH_BASE}?query=${encodeURIComponent(query)}`

    try {
      // 전략 1: XHR 인터셉트 준비
      const xhrItems: InterceptedItem[] = []
      const responseHandler = async (res: any) => {
        const ct = res.headers()['content-type'] ?? ''
        if (!ct.includes('application/json') || !res.url().includes('daangn')) return
        try { extractItemsFromJson(JSON.parse(await res.text()), query, xhrItems) } catch {}
      }
      page.on('response', responseHandler)

      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15_000 })
      await page.waitForTimeout(2500)

      let items: InterceptedItem[] = []

      if (xhrItems.length > 0) {
        console.log(`  [Daangn] XHR 성공: ${xhrItems.length}개`)
        items = xhrItems
      } else {
        // 전략 2, 3
        items = await tryDomScraping(page)
        if (items.length === 0) {
          await dumpHtmlForDebug(page)
          page.removeAllListeners('response')
          await page.waitForTimeout(2000)
          continue
        }
      }

      // DB 저장
      let saved = 0
      for (const item of items) {
        if (item.isSold || !isPriceSane(item.priceKrw, part.category)) continue
        await prisma.priceSnapshot.create({
          data: {
            partId: part.id,
            batchId,
            sourceType: SnapshotSource.DAANGN,
            sourceUrl: item.url,
            priceKrw: item.priceKrw,
            condition: inferCondition(item.title),
            rawText: JSON.stringify({ title: item.title, price: item.priceKrw, region: item.region, source: 'daangn', query }),
          },
        })
        saved++
      }

      totalInserted += saved
      console.log(`  [Daangn] "${part.fullName}" → ${saved}개`)

    } catch (err: any) {
      console.error(`  [Daangn] 오류 "${part.fullName}": ${err.message}`)
    }

    page.removeAllListeners('response')
    await page.waitForTimeout(2000 + Math.random() * 1000)
  }

  await page.close()
  await closeBrowser()
  return totalInserted
}
