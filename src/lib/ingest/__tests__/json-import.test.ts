import { parseImportJson } from "@/lib/ingest/json-import";

describe("parseImportJson", () => {
  it("splits wrapped parts and listings", () => {
    const parsed = parseImportJson({
      parts: [{ name: "RTX 4060", category: "GPU", priceKrw: 340000, kind: "part" }],
      listings: [
        {
          kind: "pc",
          title: "라이젠5 5600 + RTX 3060 16GB",
          priceKrw: 450000,
          url: "https://www.daangn.com/articles/1",
          rawText: "라이젠5 5600 + RTX 3060 16GB 창원",
        },
      ],
    });
    expect(parsed.parts).toHaveLength(1);
    expect(parsed.listings).toHaveLength(1);
    expect(parsed.rejected).toHaveLength(0);
    expect(parsed.parts[0]?.sourceType).toBe("DAANGN");
  });

  it("keeps 4060 Ti as its own part and drops junk prices", () => {
    const parsed = parseImportJson([
      { kind: "part", name: "RTX 4060 Ti", category: "GPU", priceKrw: 410000 },
      { kind: "part", name: "RTX 4060 Ti", category: "GPU", priceKrw: 50 },
    ]);
    expect(parsed.parts.map((row) => row.name)).toEqual(["RTX 4060 Ti"]);
    expect(parsed.rejected).toHaveLength(1);
  });

  it("does not treat a full PC asking price as a part snapshot", () => {
    const parsed = parseImportJson([
      {
        kind: "pc",
        title: "RTX 4060 완본",
        priceKrw: 650000,
        rawText: "RTX 4060 완본 팔아요",
      },
    ]);
    expect(parsed.parts).toHaveLength(0);
    expect(parsed.listings).toHaveLength(1);
    expect(parsed.listings[0]?.askingPriceKrw).toBe(650000);
  });
});
