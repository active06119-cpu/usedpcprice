import { isValidPartName, partitionPersistable } from "@/lib/ingest/used-listing-guard";

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
