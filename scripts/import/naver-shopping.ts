// ============================================================
// scripts/import/sources/naver-shopping.ts
// 신품 가격 수집 — 네이버 쇼핑 검색 API (공식)
//
// 등록: https://developers.naver.com/apps/#/register
// 무료 할당량: 25,000 calls/day
// API 문서: https://developers.naver.com/docs/serviceapi/search/shopping/shopping.md
//
// 이 파일이 하는 일:
//   1. parts 테이블에서 활성 파트 목록 로드
//   2. 각 파트에 대해 네이버 쇼핑 API 검색
//   3. 결과를 price_snapshots에 NAVER_SHOPPING 소스로 저장
//   4. 신품 최저가 = 이 소스의 최솟값
// ============================================================

import { PrismaClient, SnapshotSource, PartCondition } from '@prisma/client'

const prisma = new PrismaClient()

const NAVER_CLIENT_ID = process.env.NAVER_CLIENT_ID!
const NAVER_CLIENT_SECRET = process.env.NAVER_CLIENT_SECRET!

interface NaverShoppingItem {
  title: string        // HTML 태그 포함 상품명
  link: string
  image: string
  lprice: string       // 최저가 (원)
  hprice: string       // 최고가 (없으면 "")
  mallName: string
  productId: string
  productType: string  // "1" = NVMall(신뢰), "2" = 일반몰
  brand: string
  maker: string
  category1: string
  category2: string
  category3: string
  category4: string
}

interface NaverShoppingResponse {
  lastBuildDate: string
  total: number
  start: number
  display: number
  items: NaverShoppingItem[]
}

// 네이버 쇼핑 API 호출
async function searchNaverShopping(query: string, display = 10): Promise<NaverShoppingItem[]> {
  const url = new URL('https://openapi.naver.com/v1/search/shop.json')
  url.searchParams.set('query', query)
  url.searchParams.set('display', String(display))
  url.searchParams.set('sort', 'asc')  // 최저가순

  const res = await fetch(url.toString(), {
    headers: {
      'X-Naver-Client-Id': NAVER_CLIENT_ID,
      'X-Naver-Client-Secret': NAVER_CLIENT_SECRET,
    },
  })

  if (!res.ok) {
    throw new Error(`Naver API error: ${res.status} ${await res.text()}`)
  }

  const data: NaverShoppingResponse = await res.json()
  return data.items
}

// HTML 태그 제거 (네이버 상품명에 <b> 태그 포함됨)
function stripHtml(str: string): string {
  return str.replace(/<[^>]*>/g, '').trim()
}

// 가격 문자열 → 숫자 (KRW)
function parsePrice(priceStr: string): number | null {
  const n = parseInt(priceStr.replace(/[^0-9]/g, ''), 10)
  return isNaN(n) || n <= 0 ? null : n
}

// 검색 쿼리 생성 — 카테고리별로 최적화
// 너무 구체적이면 결과 없음, 너무 넓으면 관계없는 상품 포함
// 카테고리별 검색 키워드 — 엉뚱한 제품 걸러냄
const CATEGORY_KEYWORD: Record<string, string> = {
  GPU:         '그래픽카드',
  CPU:         'CPU 프로세서',
  RAM:         '램 메모리',
  SSD:         'SSD',
  HDD:         'HDD 하드디스크',
  MOTHERBOARD: '메인보드',
  PSU:         '파워서플라이',
  CASE:        '케이스',
  COOLER:      'CPU쿨러',
}

function buildSearchQuery(brandName: string, modelName: string, category: string): string {
  const catKeyword = CATEGORY_KEYWORD[category] ?? ''
  // 예: "RTX 4070 그래픽카드" → 쿨러팬/액세서리 필터링
  return `${modelName} ${catKeyword}`.trim()
}

export async function runNaverShoppingImport(batchId: string): Promise<number> {
  const parts = await prisma.part.findMany({
    where: { isActive: true },
    select: { id: true, brandName: true, modelName: true, fullName: true, category: true },
  })

  let inserted = 0
  const DELAY_MS = 250 // API 요청 간 딜레이 (rate limit 방지)

  for (const part of parts) {
    try {
      const query = buildSearchQuery(part.brandName, part.modelName, part.category)
      const items = await searchNaverShopping(query, 5)

      // 카테고리별 최저가 필터 — 너무 싼 건 액세서리일 가능성 높음
      const MIN_PRICE: Record<string, number> = {
        GPU: 100_000, CPU: 50_000, RAM: 20_000, SSD: 20_000,
        HDD: 15_000, MOTHERBOARD: 50_000, PSU: 30_000,
      }
      const minPrice = MIN_PRICE[part.category] ?? 10_000

      for (const item of items) {
        const price = parsePrice(item.lprice)
        if (!price) continue

        // 신뢰도 필터: 가격이 명백히 비정상인 경우 skip
        // (예: 1원 낚시 상품, 99999999원 오류)
        if (price < minPrice || price > 50_000_000) continue

        await prisma.priceSnapshot.create({
          data: {
            partId: part.id,
            batchId,
            sourceType: SnapshotSource.NAVER_SHOPPING as any, // 아래 enum 확장 필요
            sourceUrl: item.link,
            priceKrw: price,
            condition: PartCondition.NEW, // 신품 API이므로 항상 NEW
            rawText: JSON.stringify({
              title: stripHtml(item.title),
              mallName: item.mallName,
              brand: item.brand,
              lprice: item.lprice,
              hprice: item.hprice,
              category: `${item.category1} > ${item.category2} > ${item.category3}`,
            }),
          },
        })
        inserted++
      }

      // Rate limit: 하루 25,000 콜 → 파트 500개 × 5개 = 2,500 콜 (여유 있음)
      await new Promise(r => setTimeout(r, DELAY_MS))
    } catch (err: any) {
      console.error(`  [Naver] Failed for "${part.fullName}": ${err.message}`)
    }
  }

  return inserted
}
