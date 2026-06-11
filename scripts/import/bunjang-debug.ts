// ============================================================
// scripts/debug/bunjang-debug.ts
// 번개장터 API 엔드포인트 진단 스크립트
//
// 실행: npx ts-node scripts/debug/bunjang-debug.ts
//
// 결과물:
//   debug-output/bunjang-screenshot.png  — 실제 렌더링 화면
//   debug-output/bunjang-network.txt     — 모든 XHR 요청 + 응답
//   debug-output/bunjang-dom.html        — 전체 HTML
// ============================================================

import { chromium } from 'playwright'
import * as fs from 'fs'
import * as path from 'path'

const OUT_DIR = path.join(process.cwd(), 'debug-output')
const TEST_QUERY = 'RTX 4070'

// 알려진 엔드포인트 후보들 — 직접 fetch 테스트
const ENDPOINT_CANDIDATES = [
  `https://search.bunjang.co.kr/api/1/find/products?q=${encodeURIComponent(TEST_QUERY)}&order=date&page=0&n=10&status=live`,
  `https://api.bunjang.co.kr/api/1/find/products?q=${encodeURIComponent(TEST_QUERY)}&order=date&page=0&n=10`,
  `https://api2.bunjang.co.kr/api/1/find/products?q=${encodeURIComponent(TEST_QUERY)}`,
  `https://api.bunjang.co.kr/api/panda/v2/feed/products?q=${encodeURIComponent(TEST_QUERY)}`,
  `https://api.bunjang.co.kr/api/1/search.json?q=${encodeURIComponent(TEST_QUERY)}`,
]

async function testEndpointsDirect() {
  console.log('\n1️⃣  직접 fetch 테스트 (헤더 없이)')
  for (const url of ENDPOINT_CANDIDATES) {
    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/125.0.0.0',
          'Accept': 'application/json',
          'Referer': 'https://m.bunjang.co.kr/',
        },
      })
      const text = await res.text()
      const isJson = text.trim().startsWith('{') || text.trim().startsWith('[')
      console.log(`  [${res.status}] ${url.substring(0, 80)}`)
      if (res.status === 200 && isJson) {
        console.log(`  ✅ 작동! 응답 미리보기: ${text.substring(0, 200)}`)
      }
    } catch (e: any) {
      console.log(`  ❌ fetch 오류: ${e.message}`)
    }
  }
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true })

  // ── 1. 직접 fetch 테스트 ──────────────────────────────────
  await testEndpointsDirect()

  // ── 2. Playwright로 실제 브라우저 네트워크 캡처 ──────────
  console.log('\n2️⃣  Playwright 브라우저 네트워크 캡처')

  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-blink-features=AutomationControlled', '--lang=ko-KR'],
  })

  const page = await browser.newPage()
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined })
    Object.defineProperty(navigator, 'languages', { get: () => ['ko-KR', 'ko'] })
  })

  const networkLog: string[] = []
  const apiResponses: Array<{ url: string; status: number; body: string }> = []

  // 모든 요청 로깅
  page.on('request', req => {
    const url = req.url()
    const method = req.method()
    const headers = JSON.stringify(req.headers()).substring(0, 200)
    networkLog.push(`[REQ ${method}] ${url}`)
    if (url.includes('bunjang') || url.includes('search')) {
      networkLog.push(`  headers: ${headers}`)
    }
  })

  // JSON 응답 캡처
  page.on('response', async res => {
    const url = res.url()
    const status = res.status()
    const ct = res.headers()['content-type'] ?? ''

    networkLog.push(`[RES ${status}] ${url}`)

    if (ct.includes('application/json') || ct.includes('text/plain')) {
      try {
        const body = await res.text()
        if (body.length > 10 && (url.includes('bunjang') || url.includes('api'))) {
          apiResponses.push({ url, status, body: body.substring(0, 1000) })
          networkLog.push(`  ✅ JSON 응답: ${body.substring(0, 300)}`)
        }
      } catch {}
    }
  })

  // 메인 검색 페이지
  const searchUrl = `https://m.bunjang.co.kr/search/products?q=${encodeURIComponent(TEST_QUERY)}`
  console.log(`  접속: ${searchUrl}`)

  await page.goto(searchUrl, { waitUntil: 'networkidle', timeout: 20_000 })
  await page.waitForTimeout(3000)

  // 스크린샷
  const screenshotPath = path.join(OUT_DIR, 'bunjang-screenshot.png')
  await page.screenshot({ path: screenshotPath, fullPage: true })
  console.log(`  📸 스크린샷: ${screenshotPath}`)

  // HTML 덤프
  const html = await page.content()
  fs.writeFileSync(path.join(OUT_DIR, 'bunjang-dom.html'), html, 'utf-8')

  // 네트워크 로그
  const networkPath = path.join(OUT_DIR, 'bunjang-network.txt')
  fs.writeFileSync(networkPath, networkLog.join('\n'), 'utf-8')
  console.log(`  📡 네트워크 로그: ${networkPath}`)

  // ── 3. API 응답 요약 ─────────────────────────────────────
  console.log('\n3️⃣  감지된 API 응답:')
  if (apiResponses.length === 0) {
    console.log('  ❌ JSON API 응답 없음 — 봇 차단 또는 구조 변경')
  } else {
    apiResponses.forEach(r => {
      console.log(`\n  ✅ [${r.status}] ${r.url}`)
      console.log(`     ${r.body.substring(0, 300)}`)
    })
  }

  // ── 4. DOM에서 상품 구조 분석 ────────────────────────────
  console.log('\n4️⃣  DOM 상품 구조:')
  const domStructure = await page.evaluate(() => {
    const lines: string[] = []

    // 가격 포함 요소 찾기
    const priceRegex = /([\d,]+)\s*원/
    const allEls = Array.from(document.querySelectorAll('*'))
    const priceEls = allEls.filter(el => {
      const ownText = Array.from(el.childNodes)
        .filter(n => n.nodeType === Node.TEXT_NODE)
        .map(n => n.textContent?.trim() ?? '')
        .join('')
      return priceRegex.test(ownText)
    })

    lines.push(`가격 포함 요소 수: ${priceEls.length}`)
    priceEls.slice(0, 10).forEach(el => {
      const attrs = Array.from(el.attributes).map(a => `${a.name}="${a.value}"`).join(' ')
      lines.push(`  <${el.tagName.toLowerCase()} ${attrs}>`)
      lines.push(`    텍스트: "${el.textContent?.trim().substring(0, 60)}"`)
    })

    // data-* 속성 있는 카드 요소
    lines.push('\ndata-* 속성 있는 li/article/div:')
    const candidates = Array.from(document.querySelectorAll('li, article, div[class*="item"], div[class*="product"], div[class*="card"]'))
      .filter(el => Array.from(el.attributes).some(a => a.name.startsWith('data-')))
    candidates.slice(0, 10).forEach(el => {
      const attrs = Array.from(el.attributes).map(a => `${a.name}="${a.value}"`).join(' ')
      lines.push(`  <${el.tagName.toLowerCase()} ${attrs}>`)
    })

    // Next.js SSR 데이터
    lines.push('\n__NEXT_DATA__:')
    try {
      const d = (window as any).__NEXT_DATA__
      lines.push(d ? JSON.stringify(d).substring(0, 2000) : '없음')
    } catch { lines.push('오류') }

    return lines.join('\n')
  })

  const domPath = path.join(OUT_DIR, 'bunjang-structure.txt')
  fs.writeFileSync(domPath, domStructure, 'utf-8')
  console.log(domStructure.substring(0, 500))
  console.log(`  📄 DOM 구조: ${domPath}`)

  await browser.close()

  console.log('\n✅ 진단 완료. debug-output/ 확인:')
  console.log('  bunjang-screenshot.png — 봇 차단 여부 확인')
  console.log('  bunjang-network.txt    — API 엔드포인트 확인')
  console.log('  bunjang-structure.txt  — DOM 셀렉터 단서')
}

main().catch(e => { console.error(e); process.exit(1) })
