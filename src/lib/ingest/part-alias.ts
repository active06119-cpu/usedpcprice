/**
 * 부품명 → 별칭(정규화 키) 여러 개 생성.
 */
const MODEL_SUFFIX = "ti|super|xtx|xt|x3d|ks|kf|k|f|x|s";

function normalizeInput(name: string): string {
  return name
    .toLowerCase()
    .replace(/슈퍼/g, "super")
    .replace(/티아이/g, "ti")
    .replace(/\b\d+\s*(gb|tb|g)\b/g, " ")
    .replace(/\b(i[3579]|아이[3579]|core)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function generateAliases(name: string): string[] {
  const lower = normalizeInput(name);
  const norm = (s: string) => s.replace(/[^a-z0-9]/g, "");
  const out = new Set<string>();
  out.add(norm(lower));

  let core = lower.replace(new RegExp(`\\s+(${MODEL_SUFFIX})\\b`, "g"), "$1");
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
    const intelSuffix = alias.match(/^(\d{4,5})(kf|ks|k|f)$/);
    if (intelSuffix) {
      out.add(intelSuffix[1]);
      if (intelSuffix[2] === "kf" || intelSuffix[2] === "ks") out.add(`${intelSuffix[1]}k`);
    }
  }

  return [...out].filter((a) => a.length >= 3);
}

const MODEL_KEY_RE = new RegExp(`^\\d{3,5}(?:${MODEL_SUFFIX})?$`);

export function primaryModelKey(name: string): string | null {
  const aliases = generateAliases(name);
  const modelTokens = aliases.filter((alias) => MODEL_KEY_RE.test(alias));
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
  if (queryKey && candidateKey && MODEL_KEY_RE.test(queryKey) && MODEL_KEY_RE.test(candidateKey)) {
    return queryKey === candidateKey;
  }
  const queryAliases = new Set(generateAliases(queryName));
  return generateAliases(candidateName).some((alias) => queryAliases.has(alias));
}
