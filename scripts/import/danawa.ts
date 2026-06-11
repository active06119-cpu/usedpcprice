// ============================================================
// scripts/import/sources/danawa.ts
// 신품 최저가 수집 — 다나와 (다나와 가격비교)
//
// 다나와는 공개 API가 없어서 HTML 스크래핑.
// Playwright를 사용해 실제 브라우저로 렌더링.
//
// 설치: npm install playwright
//        npx playwright install chromium
//
// 다나와 검색 URL 구조:
//   https://search.danawa.com/dsearch.php?query=RTX+4070&tab=main
//
// 수집 대상: 최저가 상품 상위 3개의 가격
// ============================================================

import { PrismaClient, SnapshotSource, PartCondition } from '@prisma/client'
import { chromium, Browser } from 'playwright'

const prisma = new PrismaClient()

let browser: Browser | null = null

async function getBrowser(): Promise<Browser> {
  if (!browser) {
    browser = await chromium.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-blink-features=AutomationControlled', // 봇 감지 회피
      ],
    })
  }
  return browser
}

async function closeBrowser() {
  if (browser) {
    await browser.close()
    browser = null
  }
}

interface DanawaProduct {
  name: string
  priceKrw: number
  shopName: string
  productUrl: string
}

// 다나와 검색 페이지에서 최저가 제품 파싱
async function scrapeDanawaSearch(query: string): Promise<DanawaProduct[]> {
  const b = await getBrowser()
  const page = await b.newPage()

  // 봇 감지 우회: navigator.webdriver 숨기기
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false })
  })

  try {
    const url = `https://search.danawa.com/dsearch.php?query=${encodeURIComponent(query)}&tab=main&_productListType=list`
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15_000 })

    // 가격 목록 로드 대기
    await page.waitForSelector('.product_list', { timeout: 8_000 }).catch(() => {})

    const products = await page.evaluate(() => {
      const results: Array<{ name: string; priceKrw: number; shopName: string; productUrl: string }> = []

      // 다나와 상품 리스트 아이템 선택자
      const items = document.querySelectorAll('.product_list .product_item')

      items.forEach((item, idx) => {
        if (idx >= 5) return // 상위 5개만

        const nameEl = item.querySelector('.prod_name a')
        const priceEl = item.querySelector('.price_sect a strong')
        const shopEl  = item.querySelector('.mall_name')

        const name = nameEl?.textContent?.trim() ?? ''
        const priceText = priceEl?.textContent?.replace(/[^0-9]/g, '') ?? ''
        const price = parseInt(priceText, 10)
        const shopName = shopEl?.textContent?.trim() ?? ''
        const href = (nameEl as HTMLAnchorElement)?.href ?? ''

        if (name && price > 0) {
          results.push({ name, priceKrw: price, shopName, productUrl: href })
        }
      })

      return results
    })

    return products
  } catch (err) {
    console.warn(`  [Danawa] Page error for "${query}": ${(err as Error).message}`)
    return []
  } finally {
    await page.close()
  }
}

// 다나와는 신품 최저가 전문이므로 condition = NEW
export async function runDanawaImport(batchId: string): Promise<number> {
  const parts = await prisma.part.findMany({
    where: { isActive: true },
    select: { id: true, brandName: true, modelName: true, fullName: true, category: true },
  })

  let inserted = 0

  for (const part of parts) {
    try {
      const query = `${part.modelName}` // 모델명만으로도 다나와에서 잘 걸림
      const products = await scrapeDanawaSearch(query)

      for (const product of products) {
        if (product.priceKrw < 10_000 || product.priceKrw > 20_000_000) continue

        await prisma.priceSnapshot.create({
          data: {
            partId: part.id,
            batchId,
            sourceType: SnapshotSource.DANAWA,
            sourceUrl: product.productUrl || `https://search.danawa.com/dsearch.php?query=${encodeURIComponent(query)}`,
            priceKrw: product.priceKrw,
            condition: PartCondition.NEW,
            rawText: JSON.stringify({
              name: product.name,
              priceKrw: product.priceKrw,
              shopName: product.shopName,
              query,
            }),
          },
        })
        inserted++
      }

      // 다나와는 Playwright 사용이므로 딜레이 더 길게
      await new Promise(r => setTimeout(r, 2000 + Math.random() * 1000))
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      console.error(`  [Danawa] Failed for "${part.fullName}": ${message}`)
    }
  }

  await closeBrowser()
  return inserted
}
