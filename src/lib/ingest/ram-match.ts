/**
 * RAM 세대(DDR4/DDR5)·용량·키트 여부를 파싱해 카탈로그와 안전하게 매칭한다.
 * contains("16") 같은 부분문자열은 32GB(2x16) / 1600MHz와 섞이므로 쓰지 않는다.
 */

export type RamGen = "DDR4" | "DDR5";

export type RamSpec = {
  gen: RamGen | null;
  capacityGb: number | null;
  kit: boolean;
  brand: string | null;
};

export type RamCatalogPart = {
  id: string;
  fullName: string;
  modelName?: string | null;
};

const TYPICAL_CAPACITY = new Set([4, 8, 16, 32, 48, 64, 96, 128, 256]);
const SPEED_MHZ = new Set([
  2133, 2400, 2666, 2800, 3000, 3200, 3600, 4000, 4400, 4800, 5200, 5600, 6000, 6400, 6800, 7200, 7600, 8000,
]);

function detectBrand(lower: string): string | null {
  if (/samsung|삼성/.test(lower)) return "samsung";
  if (/sk\s*hynix|하이닉스/.test(lower)) return "hynix";
  if (/corsair/.test(lower)) return "corsair";
  if (/g\.?\s*skill|트라이던트/.test(lower)) return "gskill";
  if (/crucial|마이크론|micron/.test(lower)) return "crucial";
  if (/kingston/.test(lower)) return "kingston";
  if (/teamgroup|팀그룹/.test(lower)) return "teamgroup";
  return null;
}

export function parseRamSpec(name: string): RamSpec {
  const lower = name.toLowerCase().replace(/기가/g, "gb");
  const gen: RamGen | null = /\bddr5\b/.test(lower) ? "DDR5" : /\bddr4\b/.test(lower) ? "DDR4" : null;
  const kit = /(kit|키트|듀얼|2\s*x\s*\d+|x2\b)/i.test(lower);

  const gbValues = [...lower.matchAll(/(\d+)\s*(?:gb|g)\b/g)]
    .map((match) => Number(match[1]))
    .filter((value) => Number.isFinite(value) && value >= 4 && value <= 256 && !SPEED_MHZ.has(value));

  let capacityGb: number | null = null;
  const moduleMatch = lower.match(/(\d+)\s*x\s*(\d+)\s*(?:gb|g)?/i);
  if (moduleMatch) {
    const sticks = Number(moduleMatch[1]);
    const moduleGb = Number(moduleMatch[2]);
    const total = sticks * moduleGb;
    if (TYPICAL_CAPACITY.has(total) || (total >= 8 && total <= 256)) {
      capacityGb = total;
    }
  }

  if (capacityGb === null && gbValues.length > 0) {
    const typical = gbValues.filter((value) => TYPICAL_CAPACITY.has(value));
    capacityGb = typical.length > 0 ? Math.max(...typical) : gbValues[0];
  }

  return {
    gen,
    capacityGb,
    kit,
    brand: detectBrand(lower),
  };
}

export function ramPartKey(partName: string): string {
  const spec = parseRamSpec(partName);
  const gen = (spec.gen ?? "DDR4").toLowerCase();
  const cap = spec.capacityGb ? String(spec.capacityGb) : "";
  return `${gen}:${cap}`;
}

export function ramSpecsCompatible(query: RamSpec, candidate: RamSpec): boolean {
  if (query.gen && candidate.gen && query.gen !== candidate.gen) return false;
  if (query.capacityGb && candidate.capacityGb && query.capacityGb !== candidate.capacityGb) return false;
  if (query.capacityGb && !candidate.capacityGb) return false;
  return true;
}

export function scoreRamCandidate(query: RamSpec, candidate: RamSpec): number {
  let score = 0;
  if (query.gen && candidate.gen === query.gen) score += 100;
  if (query.capacityGb && candidate.capacityGb === query.capacityGb) score += 100;
  if (query.kit === candidate.kit) score += 20;
  else if (!query.kit && candidate.kit) score -= 15;
  if (query.brand && candidate.brand === query.brand) score += 15;
  return score;
}

export function pickBestRamPartId(queryName: string, parts: RamCatalogPart[]): string | null {
  const query = parseRamSpec(queryName);
  if (!query.capacityGb) return null;

  const ranked = parts
    .map((part) => {
      const spec = parseRamSpec(`${part.fullName} ${part.modelName ?? ""}`);
      if (!ramSpecsCompatible(query, spec)) return null;
      return { id: part.id, score: scoreRamCandidate(query, spec) };
    })
    .filter((row): row is { id: string; score: number } => row !== null)
    .sort((a, b) => b.score - a.score);

  return ranked[0]?.id ?? null;
}
