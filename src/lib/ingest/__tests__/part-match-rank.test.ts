import { pickBestPartId, type AliasHit } from "@/lib/ingest/part-match-rank";
import { aliasesCompatible, generateAliases, primaryModelKey } from "@/lib/ingest/part-alias";

const catalog: AliasHit[] = [
  {
    partId: "gpu-4060",
    alias: "4060",
    fullName: "NVIDIA GeForce RTX 4060",
    modelName: "RTX 4060",
  },
  {
    partId: "gpu-4060ti",
    alias: "4060ti",
    fullName: "NVIDIA GeForce RTX 4060 Ti",
    modelName: "RTX 4060 Ti",
  },
  {
    partId: "gpu-4070s",
    alias: "4070super",
    fullName: "NVIDIA GeForce RTX 4070 SUPER",
    modelName: "RTX 4070 SUPER",
  },
  {
    partId: "gpu-4070",
    alias: "4070",
    fullName: "NVIDIA GeForce RTX 4070",
    modelName: "RTX 4070",
  },
];

describe("pickBestPartId 4060 vs 4060 Ti", () => {
  it("maps 4060 listings to the non-Ti part", () => {
    expect(pickBestPartId(catalog, "RTX 4060")).toBe("gpu-4060");
    expect(pickBestPartId(catalog, "지포스 4060 8GB")).toBe("gpu-4060");
    expect(pickBestPartId(catalog, "rtx4060")).toBe("gpu-4060");
  });

  it("maps 4060 Ti listings to the Ti part", () => {
    expect(pickBestPartId(catalog, "RTX 4060 Ti")).toBe("gpu-4060ti");
    expect(pickBestPartId(catalog, "지포스 4060ti")).toBe("gpu-4060ti");
    expect(pickBestPartId(catalog, "4060 Ti 8GB")).toBe("gpu-4060ti");
  });

  it("does not fall back to Ti when only the base model is queried against mixed hits", () => {
    expect(aliasesCompatible("RTX 4060", "NVIDIA GeForce RTX 4060 Ti")).toBe(false);
    expect(pickBestPartId(catalog.filter((h) => h.partId === "gpu-4060ti"), "RTX 4060")).toBeNull();
  });

  it("keeps SUPER separate from the non-SUPER sibling", () => {
    expect(pickBestPartId(catalog, "4070s")).toBe("gpu-4070s");
    expect(pickBestPartId(catalog, "RTX 4070")).toBe("gpu-4070");
    expect(pickBestPartId(catalog, "RTX 4070 SUPER")).toBe("gpu-4070s");
  });
});

describe("alias keys used by matching", () => {
  it("does not emit bare 4060 for a Ti name", () => {
    expect(primaryModelKey("RTX 4060 Ti")).toBe("4060ti");
    expect(generateAliases("NVIDIA GeForce RTX 4060 Ti")).not.toContain("4060");
    expect(generateAliases("RTX 4060")).toEqual(expect.arrayContaining(["4060"]));
  });
});
