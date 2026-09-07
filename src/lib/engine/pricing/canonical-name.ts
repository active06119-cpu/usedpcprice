const CHIPSET =
  /\b(a320|b450|b550|x570|a620|b650e|b650|x670e|x670|b840|b850|x870e|x870|h610|b660|b760|b860|z690|z790|z890)\b/i;

export function canonicalPartName(name: string, category: string): string {
  const cleaned = name.replace(/\s+/g, " ").trim();

  if (category === "GPU") {
    const gpu = cleaned.match(/\b(rtx|gtx|rx)\s*(\d{3,4})\s*(ti|super)?/i);
    if (gpu) {
      const suffix = gpu[3] ? ` ${gpu[3].toUpperCase().replace("TI", "Ti")}` : "";
      return `${gpu[1].toUpperCase()} ${gpu[2]}${suffix}`;
    }
  }
  if (category === "CPU") {
    const ryzen = cleaned.match(/(?:ryzen|라이젠)\s*([3579])?\s*(\d{4})\s*(x3d|[xkf]{0,3})/i);
    if (ryzen) {
      const series = ryzen[1] ? `${ryzen[1]} ` : "";
      return `Ryzen ${series}${ryzen[2]}${(ryzen[3] ?? "").toUpperCase()}`.replace(/\s+/g, " ").trim();
    }
    const intel = cleaned.match(/\b(i[3579])\s*-?\s*(\d{4,5}[a-z]*)/i);
    if (intel) return `${intel[1].toLowerCase()}-${intel[2].toUpperCase()}`;
  }
  if (category === "RAM") {
    const gen = /ddr5/i.test(cleaned) ? "DDR5" : /ddr3/i.test(cleaned) ? "DDR3" : "DDR4";
    const kit = cleaned.match(/(\d+)\s*(?:gb|g)\s*[x×*]\s*(\d+)/i);
    if (kit) return `${gen} ${Number(kit[1]) * Number(kit[2])}GB`;
    const gb = cleaned.match(/(\d+)\s*(?:gb|g)\b/i);
    if (gb) return `${gen} ${gb[1]}GB`;
  }
  if (category === "SSD") {
    const tb = cleaned.match(/(\d+(?:\.\d+)?)\s*tb/i);
    if (tb) return `SSD ${tb[1]}TB`;
    const gb = cleaned.match(/(\d+)\s*(?:gb|g)\b/i);
    if (gb) return `SSD ${gb[1]}GB`;
  }
  if (category === "MOTHERBOARD") {
    const chip = cleaned.match(CHIPSET);
    if (chip) return chip[1].toUpperCase();
  }
  if (category === "PSU") {
    const watt = cleaned.match(/(\d{3,4})\s*w/i);
    if (watt) {
      const n = Number(watt[1]);
      const bucket = n >= 1000 ? 1000 : n >= 850 ? 850 : n >= 750 ? 750 : n >= 650 ? 650 : n >= 550 ? 550 : 500;
      return `PSU ${bucket}W`;
    }
  }
  return cleaned;
}
