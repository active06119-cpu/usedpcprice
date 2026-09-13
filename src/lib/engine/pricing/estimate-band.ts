/** 시세 샘플이 없을 때 쓰는 중고 고정 밴드. 램/SSD/보드/파워/케이스는 적정가 합산에 넣는다. */

export type EstimateBand = { low: number; mid: number; high: number };

function band(mid: number, spread = 0.2): EstimateBand {
  return {
    low: Math.round(mid * (1 - spread)),
    mid: Math.round(mid),
    high: Math.round(mid * (1 + spread)),
  };
}

export function estimateUsedBand(name: string, category: string): EstimateBand | null {
  const n = name.toLowerCase();

  if (category === "RAM") {
    const gb = n.match(/(\d+)\s*(?:gb|g)\b/);
    const size = gb ? Number(gb[1]) : /32/.test(n) ? 32 : /16/.test(n) ? 16 : /8/.test(n) ? 8 : 0;
    const ddr5 = /ddr5/.test(n);
    if (ddr5 && size >= 32) return band(140_000);
    if (ddr5 && size >= 16) return band(70_000);
    if (ddr5) return band(45_000);
    if (size >= 32) return band(90_000);
    if (size >= 16) return band(45_000);
    if (size >= 8) return band(25_000);
    return band(40_000);
  }

  if (category === "SSD") {
    if (/2\s*tb|2048/.test(n)) return band(180_000);
    if (/1\s*tb|1024/.test(n)) return band(95_000);
    if (/512|500/.test(n)) return band(55_000);
    if (/256|250/.test(n)) return band(35_000);
    return band(70_000);
  }

  if (category === "HDD") {
    if (/8\s*tb/.test(n)) return band(90_000);
    if (/4\s*tb/.test(n)) return band(55_000);
    if (/2\s*tb/.test(n)) return band(35_000);
    return band(25_000);
  }

  if (category === "MOTHERBOARD") {
    if (/z890|x870/.test(n)) return band(220_000);
    if (/x670|z790/.test(n)) return band(140_000);
    if (/b860/.test(n)) return band(90_000);
    if (/b650/.test(n)) return band(80_000);
    if (/b850/.test(n)) return band(85_000);
    if (/b760/.test(n)) return band(70_000);
    if (/b550/.test(n)) return band(60_000);
    if (/b450|h610|a320|a520/.test(n)) return band(45_000);
    return band(70_000);
  }

  if (category === "PSU") {
    const watt = n.match(/(\d{3,4})\s*w/);
    const w = watt ? Number(watt[1]) : /1000|1200/.test(n) ? 1000 : /850/.test(n) ? 850 : /750/.test(n) ? 750 : /650/.test(n) ? 650 : 0;
    if (w >= 1000) return band(90_000);
    if (w >= 850) return band(70_000);
    if (w >= 750) return band(50_000);
    if (w >= 650) return band(40_000);
    return band(35_000);
  }

  if (category === "CASE") {
    if (/distro|monoblock|수냉 일체|우수금/.test(n)) return band(250_000);
    if (
      /lian\s*li|o11|lancool|hyte|y60|y70|어항|fish\s*tank|fishtank|distro\s*plate|evolv|torrent/.test(n)
    ) {
      return band(180_000);
    }
    if (/nzxt\s*h|h5\s*flow|h7\s*flow|darkflash|다크플래시|abko|앱코|4000d|5000d/.test(n)) {
      return band(80_000);
    }
    return band(50_000);
  }

  if (category === "CPU") {
    if (/14600|14700|14900|7800x3d|9800x3d/.test(n)) return band(280_000);
    if (/13600|7500|7600|9600/.test(n)) return band(180_000);
    return null;
  }

  if (category === "GPU") {
    if (/5090/.test(n)) return band(3_200_000);
    if (/5080/.test(n)) return band(1_800_000);
    if (/5070\s*ti/.test(n)) return band(1_450_000);
    if (/5070/.test(n)) return band(1_050_000);
    if (/4090/.test(n)) return band(1_600_000);
    if (/4080/.test(n)) return band(1_100_000);
    if (/4070\s*ti/.test(n)) return band(750_000);
    if (/4070/.test(n)) return band(550_000);
    if (/4060\s*ti/.test(n)) return band(380_000);
    if (/4060/.test(n)) return band(300_000);
    return null;
  }

  return null;
}

export const FIXED_FILL_CATEGORIES = new Set(["RAM", "SSD", "HDD", "MOTHERBOARD", "PSU", "CASE"]);
