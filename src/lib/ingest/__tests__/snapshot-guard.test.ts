import { canPersistSnapshot, partitionPersistableSnapshots } from "@/lib/ingest/snapshot-guard";

describe("canPersistSnapshot", () => {
  it("keeps in-range used 4060 and 4060 Ti separately", () => {
    expect(
      canPersistSnapshot({ category: "GPU", name: "RTX 4060", priceKrw: 340_000, condition: "GOOD" }),
    ).toBe(true);
    expect(
      canPersistSnapshot({ category: "GPU", name: "RTX 4060 Ti", priceKrw: 410_000, condition: "GOOD" }),
    ).toBe(true);
    expect(
      canPersistSnapshot({ category: "GPU", name: "RTX 4060 Ti", priceKrw: 50, condition: "GOOD" }),
    ).toBe(false);
  });

  it("uses new-price bands for NAVER_SHOPPING style NEW rows", () => {
    expect(
      canPersistSnapshot({ category: "RAM", name: "DDR4 16GB", priceKrw: 55_000, condition: "NEW" }),
    ).toBe(true);
    expect(
      canPersistSnapshot({ category: "RAM", name: "DDR4 16GB", priceKrw: 8_000, condition: "NEW" }),
    ).toBe(false);
  });
});

describe("partitionPersistableSnapshots", () => {
  it("drops junk names and keeps valid rows", () => {
    const { kept, rejected } = partitionPersistableSnapshots([
      { category: "GPU", name: "RTX 4060", priceKrw: 350_000, condition: "GOOD" },
      { category: "GPU", name: "없음", priceKrw: 350_000, condition: "GOOD" },
      { category: "GPU", name: "RTX 4070", priceKrw: null, condition: "GOOD" },
    ]);
    expect(kept.map((row) => row.name)).toEqual(["RTX 4060"]);
    expect(rejected.map((row) => row.reason).sort()).toEqual(["invalid_name", "no_price"]);
  });
});
