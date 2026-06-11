import { parseListingText } from "@/lib/parser/listing-parser";

jest.mock("@/features/parsing/part-matcher", () => ({
  matchProductToPart: jest.fn(),
}));

jest.mock("@/lib/prisma", () => ({
  prisma: {
    partAlias: {
      findMany: jest.fn(),
    },
    part: {
      findMany: jest.fn(),
    },
  },
}));

const { matchProductToPart } = jest.requireMock("@/features/parsing/part-matcher") as {
  matchProductToPart: jest.Mock;
};
const { prisma } = jest.requireMock("@/lib/prisma") as {
  prisma: {
    partAlias: { findMany: jest.Mock };
    part: { findMany: jest.Mock };
  };
};

describe("parseListingText", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('"RTX 4070 팝니다 50만원" → RTX 4070 추출, 가격 skip', async () => {
    matchProductToPart.mockResolvedValueOnce({
      partId: "gpu-4070",
      confidence: 1,
      method: "alias_exact",
    });

    prisma.partAlias.findMany.mockResolvedValue([]);
    prisma.part.findMany.mockResolvedValue([{ id: "gpu-4070", category: "GPU" }]);

    const parsed = await parseListingText("RTX 4070 팝니다, 50만원");
    expect(parsed).toHaveLength(1);
    expect(parsed[0].partId).toBe("gpu-4070");
    expect(parsed[0].rawText).toContain("RTX 4070");
  });

  it('"i5-13600K / RTX 3080 / 32GB" → 3개 부품 분리', async () => {
    matchProductToPart
      .mockResolvedValueOnce({ partId: "cpu-13600k", confidence: 1, method: "alias_exact" })
      .mockResolvedValueOnce({ partId: "gpu-3080", confidence: 1, method: "alias_exact" })
      .mockResolvedValueOnce({ partId: "ram-32gb", confidence: 0.8, method: "pattern" });

    prisma.partAlias.findMany.mockResolvedValue([]);
    prisma.part.findMany.mockResolvedValue([
      { id: "cpu-13600k", category: "CPU" },
      { id: "gpu-3080", category: "GPU" },
      { id: "ram-32gb", category: "RAM" },
    ]);

    const parsed = await parseListingText("i5-13600K / RTX 3080 / 32GB");
    expect(parsed).toHaveLength(3);
    expect(parsed.map((p) => p.partId)).toEqual(["cpu-13600k", "gpu-3080", "ram-32gb"]);
  });

  it("중복 카테고리 감지 → confidence 낮아지는지", async () => {
    matchProductToPart
      .mockResolvedValueOnce({ partId: "gpu-4070", confidence: 1, method: "alias_exact" })
      .mockResolvedValueOnce({ partId: "gpu-4070-super", confidence: 0.9, method: "alias_partial" });

    prisma.partAlias.findMany.mockResolvedValue([]);
    prisma.part.findMany.mockResolvedValue([
      { id: "gpu-4070", category: "GPU" },
      { id: "gpu-4070-super", category: "GPU" },
    ]);

    const parsed = await parseListingText("4070 / RTX 4070 Super");
    expect(parsed).toHaveLength(2);
    expect(parsed[0].confidence).toBe(0.5);
    expect(parsed[1].confidence).toBe(0.5);
    expect(parsed[0].candidates.length).toBeGreaterThan(0);
    expect(parsed[1].candidates.length).toBeGreaterThan(0);
  });
});
