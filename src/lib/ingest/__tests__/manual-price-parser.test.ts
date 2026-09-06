import { parseManualPriceText } from "@/lib/ingest/manual-price-parser";

describe("parseManualPriceText freeform", () => {
  it("reads title + manwon + url without tabs", () => {
    const text = [
      "MSI 지포스 GTX 1660 6GB 그래픽카드 11만원 https://www.daangn.com/kr/buy-sell/msi-gtx-1660",
      "DDR4 4GB 25,000원 https://www.daangn.com/kr/buy-sell/ddr4-4gb",
      "아웃톤 M.2 NVMe SSD 256GB 51,000원 https://www.daangn.com/kr/buy-sell/ssd-256",
      "라이젠 5 7500F 12만원 https://www.daangn.com/kr/buy-sell/7500f",
      "DDR4 8GB 5만원 https://www.daangn.com/kr/buy-sell/ddr4-8gb",
    ].join("\n");

    const parsed = parseManualPriceText(text);
    expect(parsed.bad).toEqual([]);
    expect(parsed.rows.map((row) => [row.name, row.category, row.price])).toEqual([
      ["GTX 1660", "GPU", 110000],
      ["DDR4 4GB", "RAM", 25000],
      ["SSD 256GB", "SSD", 51000],
      ["Ryzen 5 7500F", "CPU", 120000],
      ["DDR4 8GB", "RAM", 50000],
    ]);
  });
});
