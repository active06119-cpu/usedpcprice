import { resolveImportSources } from "../../../scripts/batch-runner";

describe("resolveImportSources", () => {
  it("defaults to NAVER_SHOPPING", () => {
    expect(resolveImportSources("", false)).toEqual([]);
    expect(resolveImportSources("NAVER_SHOPPING", false)).toEqual(["NAVER_SHOPPING"]);
  });

  it("drops DAANGN unless explicitly enabled", () => {
    expect(resolveImportSources("NAVER_SHOPPING,DAANGN", false)).toEqual(["NAVER_SHOPPING"]);
    expect(resolveImportSources("NAVER_SHOPPING,DAANGN", true)).toEqual([
      "NAVER_SHOPPING",
      "DAANGN",
    ]);
  });
});
