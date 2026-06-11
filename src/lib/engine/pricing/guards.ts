export function getUsedPriceRange(
  partName: string,
  category: string,
): { min: number; max: number } | null {
  const name = partName.toLowerCase();

  if (category === "RAM") {
    const isKit = /kit|2x|x2|듀얼|키트/.test(name);
    if (/ddr5/.test(name) && /32/.test(name)) return { min: 70_000, max: 160_000 };
    if (/ddr5/.test(name) && /16/.test(name)) return { min: 45_000, max: 100_000 };
    if (/ddr4/.test(name) && /32/.test(name) && isKit) return { min: 70_000, max: 150_000 };
    if (/ddr4/.test(name) && /32/.test(name)) return { min: 85_000, max: 170_000 };
    if (/ddr4/.test(name) && /16/.test(name) && isKit) return { min: 35_000, max: 85_000 };
    if (/ddr4/.test(name) && /16/.test(name)) return { min: 50_000, max: 110_000 };
    if (/ddr4/.test(name) && /8/.test(name)) return { min: 12_000, max: 45_000 };
    if (/64/.test(name)) return { min: 150_000, max: 350_000 };
    if (/32/.test(name)) return { min: 70_000, max: 180_000 };
    if (/16/.test(name)) return { min: 35_000, max: 120_000 };
    if (/8/.test(name)) return { min: 10_000, max: 60_000 };
    return { min: 10_000, max: 250_000 };
  }

  if (category === "SSD") {
    if (/\b4\s*tb\b/.test(name) || /\b4096\s*g/.test(name)) return { min: 450_000, max: 1_000_000 };
    if (/\b2\s*tb\b/.test(name) || /\b2048\s*g/.test(name)) return { min: 200_000, max: 450_000 };
    if (/\b1\s*tb\b/.test(name) || /\b1024\s*g/.test(name)) return { min: 130_000, max: 300_000 };
    if (/\b512\s*g/.test(name)) return { min: 60_000, max: 150_000 };
    if (/\b256\s*g/.test(name)) return { min: 30_000, max: 80_000 };
    if (/\b128\s*g/.test(name)) return { min: 20_000, max: 55_000 };
    return { min: 15_000, max: 1_000_000 };
  }

  return null;
}

export function priceRangeByCategory(category: string): { min: number; max: number } {
  switch (category) {
    case "GPU":
      return { min: 20_000, max: 5_000_000 };
    case "CPU":
      return { min: 10_000, max: 2_500_000 };
    case "RAM":
      return { min: 5_000, max: 800_000 };
    case "SSD":
      return { min: 5_000, max: 1_500_000 };
    case "HDD":
      return { min: 5_000, max: 700_000 };
    case "MOTHERBOARD":
      return { min: 10_000, max: 2_000_000 };
    case "PSU":
      return { min: 5_000, max: 1_000_000 };
    case "CASE":
      return { min: 5_000, max: 700_000 };
    case "COOLER":
      return { min: 5_000, max: 500_000 };
    case "MONITOR":
      return { min: 10_000, max: 5_000_000 };
    default:
      return { min: 1_000, max: 20_000_000 };
  }
}

export function isValidUsedPrice(priceKrw: number, partName: string, category: string): boolean {
  if (!Number.isFinite(priceKrw) || priceKrw <= 0) return false;

  const range = getUsedPriceRange(partName, category);
  if (range) return priceKrw >= range.min && priceKrw <= range.max;

  const generic = priceRangeByCategory(category);
  return priceKrw >= generic.min && priceKrw <= generic.max;
}

export function isValidNewPrice(priceKrw: number, partName: string, category: string): boolean {
  const name = partName.toLowerCase();

  if (category === "RAM") {
    if (name.includes("8gb") || name.includes("8g")) return priceKrw >= 20_000 && priceKrw <= 60_000;
    if (name.includes("16gb") || name.includes("16g")) return priceKrw >= 40_000 && priceKrw <= 90_000;
    if (name.includes("32gb") || name.includes("32g")) return priceKrw >= 80_000 && priceKrw <= 180_000;
    return priceKrw >= 15_000 && priceKrw <= 200_000;
  }

  if (category === "GPU") {
    const discontinued = [
      /gtx\s*10[0-9]{2}/,
      /gtx\s*16[0-9]{2}/,
      /gtx\s*9[0-9]{2}/,
      /rx\s*5[0-9]{2}/,
      /rx\s*4[0-9]{2}/,
    ];
    if (discontinued.some((pattern) => pattern.test(name))) return false;
  }

  return true;
}

export function filterUsedPrices(prices: number[], partName: string, category: string): number[] {
  if (category !== "RAM" && category !== "SSD") return prices;
  return prices.filter((price) => isValidUsedPrice(price, partName, category));
}

export function isMidInValidRange(usedMid: number, partName: string, category: string): boolean {
  const range = getUsedPriceRange(partName, category);
  if (!range) return true;
  return usedMid >= range.min && usedMid <= range.max;
}

export function shouldPersistUsedPrice(priceKrw: number, partName: string, category: string): boolean {
  if (!isValidUsedPrice(priceKrw, partName, category)) return false;
  const range = priceRangeByCategory(category);
  return priceKrw >= range.min && priceKrw <= range.max;
}
