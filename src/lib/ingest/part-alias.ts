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
  const lower = name
    .toLowerCase()
    .replace(/슈퍼/g, "super")
    .replace(/티아이/g, "ti");
  const norm = (s: string) => s.replace(/[^a-z0-9]/g, "");
  const out = new Set<string>();
  out.add(norm(lower));

  let core = lower.replace(/\s+(ti|super|xt|xtx)\b/g, "$1");
  core = core
    .replace(/nvidia|geforce|지포스|radeon|라데온|intel|인텔|삼성|samsung/g, "")
    .replace(/\s+/g, " ")
    .trim();
  out.add(norm(core));

  const noPrefix = core
    .replace(/\b(rtx|gtx|rx|arc|ryzen|core)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (noPrefix) out.add(norm(noPrefix));

  const tokens = core.match(/\d{3,5}[a-z0-9]*/g);
  if (tokens) tokens.forEach((t) => out.add(norm(t)));

  for (const alias of [...out]) {
    const shortSuper = alias.match(/^(\d{3,5})s$/);
    if (shortSuper) out.add(`${shortSuper[1]}super`);
    const longSuper = alias.match(/^(\d{3,5})super$/);
    if (longSuper) out.add(`${longSuper[1]}s`);
  }

  return [...out].filter((a) => a.length >= 3);
}

export function primaryModelKey(name: string): string | null {
  const aliases = generateAliases(name);
  const modelTokens = aliases.filter((alias) => /^\d{3,5}[a-z0-9]*$/.test(alias));
  if (modelTokens.length > 0) {
    return [...modelTokens].sort((a, b) => b.length - a.length || a.localeCompare(b))[0];
  }
  if (aliases.length === 0) return null;
  return [...aliases].sort((a, b) => b.length - a.length || a.localeCompare(b))[0];
}

export function digitCore(nameOrKey: string): string | null {
  const key = primaryModelKey(nameOrKey) ?? nameOrKey.toLowerCase();
  const match = key.match(/\d{3,5}/);
  return match?.[0] ?? null;
}

export function aliasesCompatible(queryName: string, candidateName: string): boolean {
  const queryKey = primaryModelKey(queryName);
  const candidateKey = primaryModelKey(candidateName);
  if (queryKey && candidateKey && /^\d{3,5}[a-z0-9]*$/.test(queryKey) && /^\d{3,5}[a-z0-9]*$/.test(candidateKey)) {
    return queryKey === candidateKey;
  }
  const queryAliases = new Set(generateAliases(queryName));
  return generateAliases(candidateName).some((alias) => queryAliases.has(alias));
}
