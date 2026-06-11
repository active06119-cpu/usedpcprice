// src/lib/slug.ts
// 부품명 → URL 슬러그 변환

export function toSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/\s+/g, '-')        // 공백 → -
    .replace(/[^a-z0-9-]/g, '') // 영문/숫자/-만 남김
    .replace(/-+/g, '-')        // 중복 - 제거
    .replace(/^-|-$/g, '')      // 앞뒤 - 제거
}

export function fromSlug(slug: string): string {
  return slug.replace(/-/g, ' ')
}
