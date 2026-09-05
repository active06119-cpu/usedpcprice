import {
  parseRamSpec,
  pickBestRamPartId,
  ramPartKey,
  ramSpecsCompatible,
} from "@/lib/ingest/ram-match";

describe("parseRamSpec", () => {
  it("reads generation and capacity", () => {
    expect(parseRamSpec("DDR5 32GB")).toMatchObject({ gen: "DDR5", capacityGb: 32, kit: false });
    expect(parseRamSpec("삼성 DDR4 16G")).toMatchObject({ gen: "DDR4", capacityGb: 16, brand: "samsung" });
    expect(parseRamSpec("DDR4 32GB (2x16)")).toMatchObject({ gen: "DDR4", capacityGb: 32, kit: true });
  });

  it("does not treat memory speed as capacity", () => {
    expect(parseRamSpec("DDR5 32GB 6000MHz").capacityGb).toBe(32);
    expect(parseRamSpec("DDR4 16GB 3200").capacityGb).toBe(16);
  });
});

describe("ramSpecsCompatible / pickBestRamPartId", () => {
  const catalog = [
    { id: "ddr4-16", fullName: "Samsung DDR4 16GB", modelName: "DDR4 16GB" },
    { id: "ddr4-32-kit", fullName: "Samsung DDR4 32GB Kit 2x16", modelName: "DDR4 32GB" },
    { id: "ddr5-32", fullName: "Samsung DDR5 32GB", modelName: "DDR5 32GB" },
    { id: "ddr5-16", fullName: "G.Skill DDR5 16GB", modelName: "DDR5 16GB" },
  ];

  it("does not mix DDR4 16GB with DDR5 32GB or 2x16 kits", () => {
    expect(pickBestRamPartId("DDR4 16GB", catalog)).toBe("ddr4-16");
    expect(pickBestRamPartId("DDR5 32GB", catalog)).toBe("ddr5-32");
    expect(pickBestRamPartId("램 16기가 DDR4", catalog)).toBe("ddr4-16");
  });

  it("keeps generations incompatible", () => {
    expect(ramSpecsCompatible(parseRamSpec("DDR4 32GB"), parseRamSpec("DDR5 32GB"))).toBe(false);
    expect(pickBestRamPartId("DDR4 32GB", catalog.filter((row) => row.id.startsWith("ddr5")))).toBeNull();
  });

  it("builds stable static-price keys", () => {
    expect(ramPartKey("DDR5 32GB")).toBe("ddr5:32");
    expect(ramPartKey("DDR4 16G")).toBe("ddr4:16");
  });
});
