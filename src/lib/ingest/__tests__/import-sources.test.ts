import { resolveImportSources } from "@/lib/ingest/import-sources";

describe("resolveImportSources", () => {
  it("keeps official NAVER_SHOPPING and ignores unknown values", () => {
    expect(resolveImportSources("NAVER_SHOPPING,FOO", false)).toEqual(["NAVER_SHOPPING"]);
  });

  it("drops DAANGN unless explicitly enabled", () => {
    expect(resolveImportSources("NAVER_SHOPPING,DAANGN", false)).toEqual(["NAVER_SHOPPING"]);
    expect(resolveImportSources("NAVER_SHOPPING,DAANGN", true)).toEqual([
      "NAVER_SHOPPING",
      "DAANGN",
    ]);
  });
});
