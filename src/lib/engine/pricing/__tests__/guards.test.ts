import {
  getUsedPriceRange,
  shouldPersistUsedPrice,
  isValidUsedPrice,
} from "@/lib/engine/pricing/guards";

describe("used-price bands", () => {
  it("separates DDR4 16GB single from 32GB 2x16 kit", () => {
    const single16 = getUsedPriceRange("DDR4 16GB", "RAM");
    const kit32 = getUsedPriceRange("DDR4 32GB 2x16 키트", "RAM");
    expect(single16).toEqual({ min: 50_000, max: 110_000 });
    expect(kit32).toEqual({ min: 70_000, max: 150_000 });
    expect(shouldPersistUsedPrice(65_000, "DDR4 16GB", "RAM")).toBe(true);
    expect(shouldPersistUsedPrice(20_000, "DDR4 16GB", "RAM")).toBe(false);
    expect(shouldPersistUsedPrice(90_000, "DDR4 32GB Kit 2x16", "RAM")).toBe(true);
    expect(shouldPersistUsedPrice(20_000, "DDR4 32GB Kit 2x16", "RAM")).toBe(false);
  });

  it("accepts in-range 4060 / 4060 Ti GPU prices and rejects junk", () => {
    expect(isValidUsedPrice(350_000, "RTX 4060", "GPU")).toBe(true);
    expect(isValidUsedPrice(420_000, "RTX 4060 Ti", "GPU")).toBe(true);
    expect(shouldPersistUsedPrice(1_000, "RTX 4060 Ti", "GPU")).toBe(false);
    expect(shouldPersistUsedPrice(9_000_000, "RTX 4060", "GPU")).toBe(false);
  });
});
