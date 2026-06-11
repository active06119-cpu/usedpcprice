// ============================================================
// scripts/normalize/part-matcher.ts
// 스크랩한 상품명 → parts 테이블 매핑
//
// 이것이 전체 파이프라인에서 가장 어려운 부분.
// "ASUS TUF Gaming GeForce RTX 4070 OC D6X 12GB" 같은 이름을
// "RTX 4070" (Part id: xxx) 에 연결해야 함.
//
// 3단계 매칭 전략:
//   1. 정확한 alias 매칭 (가장 빠름, 가장 신뢰)
//   2. 패턴 기반 추출 (정규식)
//   3. 미매칭 → 큐에 저장 (수동 검토 후 alias 추가)
// ============================================================

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

// alias 테이블 전체를 메모리에 캐시 (batch 실행 중 재조회 방지)
let aliasCache: Map<string, string> | null = null // alias → partId

async function getAliasCache(): Promise<Map<string, string>> {
  if (aliasCache) return aliasCache

  const aliases = await prisma.partAlias.findMany({
    select: { alias: true, partId: true },
  })

  aliasCache = new Map(aliases.map(a => [a.alias.toLowerCase(), a.partId]))
  return aliasCache
}

export function invalidateAliasCache() {
  aliasCache = null
}

// ============================================================
// STEP 1: 정확한 alias 매칭
// ============================================================
async function matchByAlias(productName: string): Promise<string | null> {
  const cache = await getAliasCache()
  const normalized = productName.toLowerCase().trim()

  // 전체 상품명으로 직접 매칭 시도
  if (cache.has(normalized)) return cache.get(normalized)!

  // 상품명 내에 alias가 포함되어 있는지 확인 (부분 매칭)
  // 긴 alias부터 시도 (더 구체적인 것 우선)
  const sortedAliases = Array.from(cache.entries()).sort((a, b) => b[0].length - a[0].length)

  for (const [alias, partId] of sortedAliases) {
    // alias가 단어 경계로 구분되어 있는지 확인
    // "4070" 이 "34070" 에 매칭되는 오탐 방지
    const regex = new RegExp(`(?<![\\d])${escapeRegex(alias)}(?![\\d])`, 'i')
    if (regex.test(productName)) {
      return partId
    }
  }

  return null
}

// ============================================================
// STEP 2: 패턴 기반 추출
// GPU/CPU 모델명은 패턴이 있어서 정규식으로 추출 가능
// ============================================================

// GPU 모델명 추출 패턴
// "ASUS TUF Gaming GeForce RTX 4070 OC D6X 12GB" → "RTX 4070"
const GPU_PATTERNS: Array<{ pattern: RegExp; normalize: (m: RegExpMatchArray) => string }> = [
  // NVIDIA RTX 시리즈
  { pattern: /RTX\s*(4090|4080\s*SUPER|4080|4070\s*Ti\s*SUPER|4070\s*Ti|4070\s*SUPER|4070|4060\s*Ti|4060)/i,
    normalize: m => `RTX ${m[1].replace(/\s+/g, ' ').trim().toUpperCase()}` },
  { pattern: /RTX\s*(3090\s*Ti|3090|3080\s*Ti|3080|3070\s*Ti|3070|3060\s*Ti|3060)/i,
    normalize: m => `RTX ${m[1].replace(/\s+/g, ' ').trim().toUpperCase()}` },
  // AMD RX 시리즈
  { pattern: /RX\s*(7900\s*XTX|7900\s*XT|7800\s*XT|7700\s*XT|7600\s*XT|7600)/i,
    normalize: m => `RX ${m[1].replace(/\s+/g, ' ').trim().toUpperCase()}` },
  { pattern: /RX\s*(6900\s*XT|6800\s*XT|6800|6700\s*XT|6700|6600\s*XT|6600)/i,
    normalize: m => `RX ${m[1].replace(/\s+/g, ' ').trim().toUpperCase()}` },
]

// CPU 모델명 추출 패턴
const CPU_PATTERNS: Array<{ pattern: RegExp; normalize: (m: RegExpMatchArray) => string }> = [
  // Intel Core
  { pattern: /Core\s*(i[3579]-\d{4,5}[A-Z]*)/i,
    normalize: m => `Core ${m[1]}` },
  // AMD Ryzen (X3D 포함)
  { pattern: /Ryzen\s*(\d)\s*(\d{4}X3D|\d{4}X|\d{4})/i,
    normalize: m => `Ryzen ${m[1]} ${m[2].toUpperCase()}` },
]

async function matchByPattern(productName: string, category?: string): Promise<{ partId: string; confidence: number } | null> {
  const patterns = category === 'GPU' ? GPU_PATTERNS
    : category === 'CPU' ? CPU_PATTERNS
    : [...GPU_PATTERNS, ...CPU_PATTERNS]

  for (const { pattern, normalize } of patterns) {
    const match = productName.match(pattern)
    if (!match) continue

    const extractedModel = normalize(match)

    // 추출한 모델명으로 alias 검색
    const cache = await getAliasCache()
    const candidateAlias = extractedModel.toLowerCase().replace(/\s+/g, ' ').trim()

    if (cache.has(candidateAlias)) {
      return { partId: cache.get(candidateAlias)!, confidence: 0.85 }
    }

    // alias가 없으면 parts 테이블 직접 검색
    const part = await prisma.part.findFirst({
      where: {
        modelName: { contains: extractedModel, mode: 'insensitive' },
        isActive: true,
      },
      select: { id: true },
    })

    if (part) {
      // 다음 번에 빠르게 매칭되도록 alias 자동 추가
      await prisma.partAlias.upsert({
        where: { partId_alias: { partId: part.id, alias: candidateAlias } },
        update: {},
        create: { partId: part.id, alias: candidateAlias, source: 'auto-pattern' },
      })
      invalidateAliasCache()

      return { partId: part.id, confidence: 0.85 }
    }
  }

  return null
}

// ============================================================
// STEP 3: 미매칭 큐 저장
// 나중에 수동 검토 후 alias 추가
// ============================================================
export async function saveToUnmatchedQueue(
  rawText: string,
  sourceType: string,
  inferredCategory?: string,
) {
  // listing_part_matches에 partId=null로 저장
  // (이미 DB 설계에서 nullable로 지원됨)
  // batch 파이프라인에서 listingId가 없는 경우를 위해
  // 별도 테이블 대신 listing_part_matches 재사용

  // v1에서는 그냥 콘솔 로그로 남기고 나중에 수동 처리
  console.warn(`  [Unmatched] "${rawText.substring(0, 80)}" (${sourceType}, category: ${inferredCategory ?? 'unknown'})`)
}

// ============================================================
// 메인 매칭 함수 — 파이프라인에서 호출
// ============================================================
export interface MatchResult {
  partId: string | null
  confidence: number
  method: 'alias_exact' | 'alias_partial' | 'pattern' | 'unmatched'
}

export async function matchProductToPart(
  productName: string,
  category?: string,
): Promise<MatchResult> {
  // 1. alias 정확/부분 매칭
  const aliasMatch = await matchByAlias(productName)
  if (aliasMatch) {
    return { partId: aliasMatch, confidence: 1.0, method: 'alias_partial' }
  }

  // 2. 패턴 기반 추출
  const patternMatch = await matchByPattern(productName, category)
  if (patternMatch) {
    return { partId: patternMatch.partId, confidence: patternMatch.confidence, method: 'pattern' }
  }

  // 3. 미매칭
  return { partId: null, confidence: 0, method: 'unmatched' }
}

// ============================================================
// 유틸
// ============================================================
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// ============================================================
// 미매칭 비율 리포트 (배치 실행 후 운영자 확인용)
// ============================================================
export async function printMatchReport(results: MatchResult[]) {
  const total = results.length
  const byMethod = {
    alias_exact:   results.filter(r => r.method === 'alias_exact').length,
    alias_partial: results.filter(r => r.method === 'alias_partial').length,
    pattern:       results.filter(r => r.method === 'pattern').length,
    unmatched:     results.filter(r => r.method === 'unmatched').length,
  }

  console.log('\n📊 Part Matching Report:')
  console.log(`  Total:          ${total}`)
  console.log(`  Alias (exact):  ${byMethod.alias_exact} (${pct(byMethod.alias_exact, total)})`)
  console.log(`  Alias (partial):${byMethod.alias_partial} (${pct(byMethod.alias_partial, total)})`)
  console.log(`  Pattern:        ${byMethod.pattern} (${pct(byMethod.pattern, total)})`)
  console.log(`  ❌ Unmatched:   ${byMethod.unmatched} (${pct(byMethod.unmatched, total)})`)

  if (byMethod.unmatched / total > 0.2) {
    console.warn('  ⚠️  미매칭 20% 초과 — alias 테이블 확장 필요')
  }
}

function pct(n: number, total: number): string {
  return total === 0 ? '0%' : `${Math.round((n / total) * 100)}%`
}
