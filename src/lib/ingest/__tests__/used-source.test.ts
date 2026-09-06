import { resolveUsedSource } from "@/lib/ingest/used-source";

describe("resolveUsedSource", () => {
  it("prefers explicit source then marketplace URL", () => {
    expect(resolveUsedSource({ source: "BUNJANG", url: "https://www.daangn.com/1" })).toBe("BUNJANG");
    expect(resolveUsedSource({ url: "https://www.daangn.com/articles/1" })).toBe("DAANGN");
    expect(resolveUsedSource({ url: "https://m.bunjang.co.kr/products/1" })).toBe("BUNJANG");
    expect(resolveUsedSource({})).toBe("DAANGN");
  });
});
