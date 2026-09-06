import {
  getUsedPriceRange,
  shouldPersistUsedPrice,
  isValidUsedPrice,
} from "@/lib/engine/pricing/guards";

describe("used-price bands", () => {
  it("keeps current Daangn RAM prices inside the band", () => {
    expect(shouldPersistUsedPrice(48_000, "DDR4 8GB", "RAM")).toBe(true);
    expect(shouldPersistUsedPrice(120_000, "DDR4 16GB", "RAM")).toBe(true);
    expect(shouldPersistUsedPrice(225_000, "DDR4 32GB", "RAM")).toBe(true);
    expect(shouldPersistUsedPrice(440_000, "DDR5 32GB", "RAM")).toBe(true);
    expect(shouldPersistUsedPrice(20_000, "DDR4 16GB", "RAM")).toBe(false);
    expect(shouldPersistUsedPrice(2_000_000, "DDR5 32GB", "RAM")).toBe(false);
  });

  it("separates 16GB and 32GB names without collapsing them", () => {
    const single16 = getUsedPriceRange("DDR4 16GB", "RAM");
    const kit32 = getUsedPriceRange("DDR4 32GB 2x16 키트", "RAM");
    expect(single16?.max).toBeGreaterThan(single16?.min ?? 0);
    expect(kit32?.max).toBeGreaterThan(110_000);
    expect(shouldPersistUsedPrice(90_000, "DDR4 32GB Kit 2x16", "RAM")).toBe(true);
  });

  it("accepts in-range 4060 / 4060 Ti GPU prices and rejects junk", () => {
    expect(isValidUsedPrice(350_000, "RTX 4060", "GPU")).toBe(true);
    expect(isValidUsedPrice(420_000, "RTX 4060 Ti", "GPU")).toBe(true);
    expect(shouldPersistUsedPrice(1_000, "RTX 4060 Ti", "GPU")).toBe(false);
    expect(shouldPersistUsedPrice(9_000_000, "RTX 4060", "GPU")).toBe(false);
  });
});
