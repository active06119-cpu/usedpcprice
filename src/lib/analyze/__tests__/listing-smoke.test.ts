import { aliasesCompatible } from "@/lib/ingest/part-alias";
import { pickBestRamPartId, ramPartKey } from "@/lib/ingest/ram-match";
import {
  normalizeExtractedParts,
  supplementRamPartsFromText,
} from "@/lib/analyze/parts";

jest.mock("@/lib/prisma", () => ({
  prisma: {
    part: { findMany: jest.fn(), findFirst: jest.fn(), upsert: jest.fn() },
    priceSnapshot: { findMany: jest.fn(), findFirst: jest.fn(), deleteMany: jest.fn(), createMany: jest.fn() },
  },
}));

const RAM_CATALOG = [
  { id: "ddr4-16", fullName: "Samsung DDR4 16GB", modelName: "DDR4 16GB" },
  { id: "ddr4-32-kit", fullName: "Samsung DDR4 32GB Kit 2x16", modelName: "DDR4 32GB" },
  { id: "ddr5-32", fullName: "Samsung DDR5 32GB", modelName: "DDR5 32GB" },
];

describe("analyze matching smoke (4060 vs 4060 Ti + RAM kits)", () => {
  it("keeps 4060 and 4060 Ti as different SKUs", () => {
    expect(aliasesCompatible("RTX 4060", "지포스 4060ti")).toBe(false);
    expect(aliasesCompatible("RTX 4060 8GB", "NVIDIA GeForce RTX 4060")).toBe(true);
    expect(aliasesCompatible("4060 Ti 8기가", "RTX 4060 Ti")).toBe(true);
  });

  it("extracts DDR4 16GB from a 4060 listing without collapsing to 2x16", () => {
    const text = "RTX 4060 8GB + i5-13600K + DDR4 16GB 팝니다 65만원";
    const parts = supplementRamPartsFromText(text, [
      { partName: "RTX 4060", category: "GPU", condition: "GOOD" },
    ]);
    const ram = parts.filter((part) => part.category === "RAM");
    expect(ram.map((part) => ramPartKey(part.partName))).toEqual(["ddr4:16"]);
    expect(pickBestRamPartId(ram[0].partName, RAM_CATALOG)).toBe("ddr4-16");
  });

  it("extracts 32GB kit from a 4060 Ti listing instead of 16GB", () => {
    const text = "지포스 4060ti 8기가 / 라이젠 5600 / 삼성 DDR4 32GB 2x16 키트 팝니다 78만원";
    const parts = supplementRamPartsFromText(text, [
      { partName: "RTX 4060 Ti", category: "GPU", condition: "GOOD" },
    ]);
    const ram = parts.filter((part) => part.category === "RAM");
    expect(ram.some((part) => ramPartKey(part.partName) === "ddr4:32")).toBe(true);
    expect(pickBestRamPartId("DDR4 32GB 2x16", RAM_CATALOG)).toBe("ddr4-32-kit");
    expect(pickBestRamPartId("DDR4 16GB", RAM_CATALOG)).not.toBe("ddr4-32-kit");
  });

  it("normalizes MEMORY category to RAM", () => {
    const normalized = normalizeExtractedParts([
      { partName: "DDR5 32GB", category: "MEMORY", estimatedUsedMid: 110000 },
    ]);
    expect(normalized).toHaveLength(1);
    expect(normalized[0].category).toBe("RAM");
    expect(normalized[0].partName).toBe("DDR5 32GB");
  });
});
