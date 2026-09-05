import {
  aliasesCompatible,
  digitCore,
  generateAliases,
  primaryModelKey,
} from "@/lib/ingest/part-alias";

describe("generateAliases / primaryModelKey", () => {
  it("separates 4060 from 4060 Ti", () => {
    expect(primaryModelKey("RTX 4060")).toBe("4060");
    expect(primaryModelKey("RTX 4060 Ti")).toBe("4060ti");
    expect(primaryModelKey("지포스 4060ti")).toBe("4060ti");
    expect(primaryModelKey("지포스 4060 8GB")).toBe("4060");
    expect(primaryModelKey("4060 Ti 8GB")).toBe("4060ti");
    expect(aliasesCompatible("RTX 4060", "RTX 4060 Ti")).toBe(false);
    expect(aliasesCompatible("4060 Ti", "지포스 4060ti")).toBe(true);
    expect(aliasesCompatible("RTX 4060 8GB", "NVIDIA GeForce RTX 4060")).toBe(true);
  });

  it("keeps SUPER suffix", () => {
    expect(primaryModelKey("RTX 4070 SUPER")).toBe("4070super");
    expect(aliasesCompatible("4070s", "RTX 4070 SUPER")).toBe(true);
    expect(aliasesCompatible("RTX 4070", "RTX 4070 SUPER")).toBe(false);
  });

  it("normalizes CPU model numbers", () => {
    expect(primaryModelKey("Core i5-13600K")).toBe("13600k");
    expect(primaryModelKey("아이5 13600k")).toBe("13600k");
    expect(aliasesCompatible("i5-13600K", "인텔 13600k")).toBe(true);
    expect(aliasesCompatible("Ryzen 5 5600X", "Ryzen 5 5600")).toBe(false);
  });

  it("digitCore drops suffix", () => {
    expect(digitCore("RTX 4060 Ti")).toBe("4060");
    expect(digitCore("13600k")).toBe("13600");
  });

  it("generated aliases include model key only", () => {
    const aliases = generateAliases("NVIDIA GeForce RTX 4060 Ti");
    expect(aliases).toEqual(expect.arrayContaining(["4060ti"]));
    expect(aliases).not.toContain("4060");
    expect(generateAliases("RTX 4060 8GB")).not.toContain("40608gb");
  });
});
