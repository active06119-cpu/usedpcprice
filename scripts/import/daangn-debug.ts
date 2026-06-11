// ============================================================
// scripts/debug/daangn-debug.ts
// 당근마켓 셀렉터 진단 스크립트
//
// 실행: npx ts-node scripts/debug/daangn-debug.ts
//
// 결과물:
//   debug-output/daangn-screenshot.png  — 실제 렌더링 화면
//   debug-output/daangn-dom.html        — 전체 HTML 덤프
//   debug-output/daangn-structure.txt   — 상품 관련 요소 구조 요약
// ============================================================

import { chromium } from 'playwright'
import * as fs from 'fs'
import * as path from 'path'

const OUT_DIR = path.join(process.cwd(), 'debug-output')
const TEST_QUERY = 'RTX 4070'

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true })

  const browser = await chromium.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-blink-features=AutomationControlled',
      '--lang=ko-KR',
    ],
  })

  const page = await browser.newPage()

  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined })
    Object.defineProperty(navigator, 'languages', { get: () => ['ko-KR', 'ko'] })
  })

  // 이미지만 차단 (폰트/스크립트는 허용 — 렌더링에 필요)
  await page.route('**/*.{png,jpg,jpeg,gif,webp}', r => r.abort())

  const url = `https://www.daangn.com/search/flea-markets?query=${encodeURIComponent(TEST_QUERY)}`
  console.log(`\n🔍 접속: ${url}`)

  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20_000 })

  // 추가 렌더링 대기
  await page.waitForTimeout(3000)

  // ── 1. 스크린샷 ──────────────────────────────────────────
  const screenshotPath = path.join(OUT_DIR, 'daangn-screenshot.png')
  await page.screenshot({ path: screenshotPath, fullPage: true })
  console.log(`📸 스크린샷 저장: ${screenshotPath}`)

  // ── 2. HTML 전체 덤프 ────────────────────────────────────
  const html = await page.content()
  const htmlPath = path.join(OUT_DIR, 'daangn-dom.html')
  fs.writeFileSync(htmlPath, html, 'utf-8')
  console.log(`📄 HTML 덤프 저장: ${htmlPath}`)

  // ── 3. 구조 분석 ─────────────────────────────────────────
  const structure = await page.evaluate(() => {
    const lines: string[] = []

    // 현재 URL 확인 (리다이렉트 감지)
    lines.push(`=== URL: ${window.location.href}`)
    lines.push(`=== Title: ${document.title}`)
    lines.push('')

    // 가격 패턴(숫자+원)을 포함하는 모든 요소 찾기
    // 이게 핵심 — 셀렉터 몰라도 가격 있는 노드를 역추적
    const priceRegex = /[\d,]+\s*원/
    const allElements = Array.from(document.querySelectorAll('*'))
    const priceElements = allElements.filter(el => {
      const text = el.textContent?.trim() ?? ''
      // 직계 텍스트만 (자식 포함하면 너무 많아짐)
      const ownText = Array.from(el.childNodes)
        .filter(n => n.nodeType === Node.TEXT_NODE)
        .map(n => n.textContent?.trim() ?? '')
        .join('')
      return priceRegex.test(ownText)
    })

    lines.push(`=== 가격 텍스트를 포함한 요소 (${priceElements.length}개) ===`)
    priceElements.slice(0, 20).forEach(el => {
      const tag = el.tagName.toLowerCase()
      const id = el.id ? `#${el.id}` : ''
      const classes = el.className && typeof el.className === 'string'
        ? '.' + el.className.trim().replace(/\s+/g, '.')
        : ''
      // data-* 속성 전체 출력
      const dataAttrs = Array.from(el.attributes)
        .filter(a => a.name.startsWith('data-') || a.name === 'role' || a.name === 'aria-label')
        .map(a => `[${a.name}="${a.value}"]`)
        .join(' ')
      const text = el.textContent?.trim().substring(0, 60) ?? ''
      lines.push(`  ${tag}${id}${classes} ${dataAttrs}`)
      lines.push(`    → "${text}"`)
    })

    lines.push('')

    // article, section, li 태그 중 data-* 속성 있는 것
    lines.push('=== data-* 속성 있는 article/section/li ===')
    const withData = Array.from(document.querySelectorAll('article, section, li'))
      .filter(el => el.attributes.length > 0 &&
        Array.from(el.attributes).some(a => a.name.startsWith('data-')))
    withData.slice(0, 15).forEach(el => {
      const attrs = Array.from(el.attributes).map(a => `${a.name}="${a.value}"`).join(' ')
      lines.push(`  <${el.tagName.toLowerCase()} ${attrs}>`)
      lines.push(`    텍스트: "${el.textContent?.trim().substring(0, 80)}"`)
    })

    lines.push('')

    // 네트워크 응답에서 JSON 데이터 있었는지 확인하기 위해
    // window.__NEXT_DATA__ 체크 (Next.js 앱)
    lines.push('=== Next.js SSR 데이터 (window.__NEXT_DATA__) ===')
    try {
      const nextData = (window as any).__NEXT_DATA__
      if (nextData) {
        const str = JSON.stringify(nextData, null, 2)
        lines.push(str.substring(0, 3000) + (str.length > 3000 ? '\n...(truncated)' : ''))
      } else {
        lines.push('  없음')
      }
    } catch (e) {
      lines.push(`  오류: ${e}`)
    }

    return lines.join('\n')
  })

  const structurePath = path.join(OUT_DIR, 'daangn-structure.txt')
  fs.writeFileSync(structurePath, structure, 'utf-8')
  console.log(`🔬 구조 분석 저장: ${structurePath}`)

  // ── 4. XHR 요청 캡처 ─────────────────────────────────────
  // 페이지 리로드하면서 네트워크 요청 감청
  console.log('\n🌐 네트워크 요청 재캡처 중...')
  const apiCalls: string[] = []

  page.on('request', req => {
    const url = req.url()
    // JSON API 요청만 필터
    if (
      (url.includes('/api/') || url.includes('.json') || url.includes('graphql')) &&
      !url.includes('google') && !url.includes('analytics')
    ) {
      apiCalls.push(`[${req.method()}] ${url}`)
    }
  })

  page.on('response', async res => {
    const url = res.url()
    const ct = res.headers()['content-type'] ?? ''
    if (ct.includes('application/json') && url.includes('daangn')) {
      try {
        const body = await res.text()
        apiCalls.push(`[RESPONSE] ${url}\n  body(500): ${body.substring(0, 500)}`)
      } catch {}
    }
  })

  await page.reload({ waitUntil: 'domcontentloaded', timeout: 20_000 })
  await page.waitForTimeout(2000)

  const networkPath = path.join(OUT_DIR, 'daangn-network.txt')
  fs.writeFileSync(networkPath, apiCalls.join('\n\n'), 'utf-8')
  console.log(`📡 네트워크 요청 저장: ${networkPath}`)

  await browser.close()

  console.log('\n✅ 진단 완료. debug-output/ 폴더 확인:')
  console.log('  1. daangn-screenshot.png — 화면 확인')
  console.log('  2. daangn-structure.txt  — 셀렉터 단서')
  console.log('  3. daangn-network.txt    — API 엔드포인트 단서')
  console.log('  4. daangn-dom.html       — 전체 HTML (VS Code에서 열기)')
}

main().catch(e => { console.error(e); process.exit(1) })
