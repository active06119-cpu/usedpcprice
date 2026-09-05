import {
  isValidListingAskingPrice,
  isValidListingText,
  isValidPartName,
  partitionPersistable,
  partitionPersistableListings,
} from "@/lib/ingest/used-listing-guard";
import { parseManualPriceText } from "@/lib/ingest/manual-price-parser";

describe("isValidPartName", () => {
  it("accepts real part names", () => {
    expect(isValidPartName("RTX 4060 Ti")).toBe(true);
    expect(isValidPartName("i5-13600K")).toBe(true);
  });

  it("rejects junk placeholders", () => {
    expect(isValidPartName("없음")).toBe(false);
    expect(isValidPartName("unknown")).toBe(false);
    expect(isValidPartName("제목 없음")).toBe(false);
    expect(isValidPartName("??")).toBe(false);
    expect(isValidPartName("")).toBe(false);
  });
});

describe("partitionPersistable", () => {
  it("keeps in-range GPU prices and drops outliers / missing prices", () => {
    const { kept, rejected } = partitionPersistable([
      { category: "GPU", name: "RTX 4060", priceKrw: 350_000 },
      { category: "GPU", name: "RTX 4060 Ti", priceKrw: 1_000 },
      { category: "GPU", name: "없음", priceKrw: 300_000 },
      { category: "GPU", name: "RTX 4070", priceKrw: null },
    ]);

    expect(kept.map((row) => row.name)).toEqual(["RTX 4060"]);
    expect(rejected.map((row) => row.reason).sort()).toEqual([
      "invalid_name",
      "no_price",
      "price_out_of_range",
    ]);
  });

  it("does not let a 4060 Ti outlier pollute a valid 4060 row", () => {
    const { kept, rejected } = partitionPersistable([
      { category: "GPU", name: "RTX 4060", priceKrw: 340_000 },
      { category: "GPU", name: "RTX 4060 Ti", priceKrw: 410_000 },
      { category: "GPU", name: "RTX 4060 Ti", priceKrw: 50 },
    ]);
    expect(kept.map((row) => row.name).sort()).toEqual(["RTX 4060", "RTX 4060 Ti"]);
    expect(rejected).toEqual([
      expect.objectContaining({ name: "RTX 4060 Ti", reason: "price_out_of_range" }),
    ]);
  });

  it("applies RAM used-price bands", () => {
    const { kept, rejected } = partitionPersistable([
      { category: "RAM", name: "DDR5 32GB", priceKrw: 90_000 },
      { category: "RAM", name: "DDR5 32GB", priceKrw: 10_000 },
    ]);

    expect(kept).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason).toBe("price_out_of_range");
  });

  it("keeps DDR4 16GB and 32GB kit in their own bands", () => {
    const { kept, rejected } = partitionPersistable([
      { category: "RAM", name: "DDR4 16GB", priceKrw: 65_000 },
      { category: "RAM", name: "DDR4 32GB 2x16 키트", priceKrw: 95_000 },
      { category: "RAM", name: "DDR4 16GB", priceKrw: 8_000 },
      { category: "RAM", name: "DDR4 32GB Kit 2x16", priceKrw: 15_000 },
    ]);
    expect(kept.map((row) => row.name)).toEqual(["DDR4 16GB", "DDR4 32GB 2x16 키트"]);
    expect(rejected).toHaveLength(2);
    expect(rejected.every((row) => row.reason === "price_out_of_range")).toBe(true);
  });
});

describe("partitionPersistableListings", () => {
  it("keeps a normal listing and drops junk / bad url / insane price", () => {
    const { kept, rejected } = partitionPersistableListings([
      { rawText: "RTX 4060 35만원", askingPriceKrw: 350_000 },
      { rawText: "없음" },
      { rawText: "RTX 4070", sourceUrl: "ftp://example.com" },
      { rawText: "전체 PC", askingPriceKrw: 99 },
    ]);

    expect(kept.map((row) => row.rawText)).toEqual(["RTX 4060 35만원"]);
    expect(rejected.map((row) => row.reason).sort()).toEqual([
      "invalid_text",
      "invalid_url",
      "price_out_of_range",
    ]);
  });

  it("keeps separate 4060 and 4060 Ti listings when text and price are valid", () => {
    const { kept, rejected } = partitionPersistableListings([
      {
        rawText: "RTX 4060 8GB + DDR4 16GB 65만원",
        sourceUrl: "https://example.com/4060",
        askingPriceKrw: 650_000,
      },
      {
        rawText: "지포스 4060ti + DDR4 32GB 2x16 78만원",
        sourceUrl: "https://example.com/4060ti",
        askingPriceKrw: 780_000,
      },
      {
        rawText: "4060 Ti 완본체",
        sourceUrl: "javascript:alert(1)",
        askingPriceKrw: 780_000,
      },
    ]);
    expect(kept.map((row) => row.askingPriceKrw)).toEqual([650_000, 780_000]);
    expect(rejected.map((row) => row.reason)).toEqual(["invalid_url"]);
  });

  it("allows missing asking price", () => {
    expect(isValidListingAskingPrice(undefined)).toBe(true);
    expect(isValidListingText("i5-13600K + 4060 Ti")).toBe(true);
  });
});

describe("parseManualPriceText", () => {
  it("rejects RAM prices outside used bands before save", () => {
    const { rows, bad } = parseManualPriceText(
      ["DDR5 32GB\tRAM\t90000", "DDR5 32GB\tRAM\t10000", "없음\tGPU\t300000"].join("\n"),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].price).toBe(90_000);
    expect(bad).toHaveLength(2);
  });

  it("accepts 4060 and 4060 Ti rows independently", () => {
    const { rows, bad } = parseManualPriceText(
      [
        "RTX 4060\tGPU\t340000",
        "RTX 4060 Ti\tGPU\t410000",
        "RTX 4060 Ti\tGPU\t1000",
        "DDR4 16GB\tRAM\t65000",
        "DDR4 32GB 2x16\tRAM\t95000",
      ].join("\n"),
    );
    expect(rows.map((row) => row.name)).toEqual([
      "RTX 4060",
      "RTX 4060 Ti",
      "DDR4 16GB",
      "DDR4 32GB 2x16",
    ]);
    expect(bad).toHaveLength(1);
    expect(bad[0].reason).toMatch(/시세 범위 밖/);
  });
});
