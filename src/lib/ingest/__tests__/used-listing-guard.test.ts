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

  it("applies RAM used-price bands", () => {
    const { kept, rejected } = partitionPersistable([
      { category: "RAM", name: "DDR5 32GB", priceKrw: 90_000 },
      { category: "RAM", name: "DDR5 32GB", priceKrw: 10_000 },
    ]);

    expect(kept).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason).toBe("price_out_of_range");
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
});
