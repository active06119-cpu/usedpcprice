/**
 * 부품명 → 별칭(정규화 키) 여러 개 생성.
 *
 * 표기가 달라도("RTX 4060 Ti" / "4060ti" / "4060 Ti" / "지포스 4060ti") 같은 부품으로
 * 매칭되게, 각 부품에 가능한 정규화 표기를 별칭으로 붙여둔다.
 * 핵심 식별자 = 모델번호+접미사(4060ti, 13600k, 5600x). 브랜드·접두어·띄어쓰기는 노이즈.
 *
 * 주의: 4060 과 4060 Ti 는 접미사 join 덕분에 "4060" / "4060ti" 로 분리돼 충돌하지 않는다.
 */
export function generateAliases(name: string): string[] {
  const lower = name.toLowerCase();
  const norm = (s: string) => s.replace(/[^a-z0-9]/g, "");
  const out = new Set<string>();
  out.add(norm(lower)); // 원본 통짜 정규화

  // 접미사(ti/super/xt/xtx) 앞 공백 제거 → "4070 ti super" → "4070tisuper" (연속 접미사도 흡수)
  let core = lower.replace(/\s+(ti|super|xt|xtx)\b/g, "$1");
  // 브랜드 단어 제거 (모델 식별자가 아님)
  core = core
    .replace(/nvidia|geforce|지포스|radeon|라데온|intel|인텔|삼성|samsung/g, "")
    .replace(/\s+/g, " ")
    .trim();
  out.add(norm(core));

  // 접두어(rtx/gtx/rx/ryzen/core 등) 뗀 형태 → "4060ti", "5600x"
  const noPrefix = core
    .replace(/\b(rtx|gtx|rx|arc|ryzen|core)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (noPrefix) out.add(norm(noPrefix));

  // 핵심 모델 토큰 (숫자 3~5자리 + 접미) → 4060ti, 13600k, 5600x, 5800x3d
  const tokens = core.match(/\d{3,5}[a-z0-9]*/g);
  if (tokens) tokens.forEach((t) => out.add(norm(t)));

  return [...out].filter((a) => a.length >= 3);
}
