import { extractPastedParts, parsePastedListings } from "@/lib/ingest/paste-listing";

const SAMPLE = `[가성비 게이밍 PC] 라이젠 5600X / RTX 3070 Ti 정리
디지털기기 · 3일 전
830,000원
실사용 기간 길지 않고 깔끔하게 관리한 게이밍 컴퓨터입니다. 최근 AI 및 그래픽카드 수요 폭증으로 GPU 가격대가 전반적으로 상승했으나, 빠르게 처리하고자 합리적인 가격에 올립니다.
전원 넣으면 튜닝 RGB LED 깔끔하게 들어오며, 배그, 로스트아크, 발로란트, 스팀 고사양 게임 모두 원활하게 돌아갑니다.
[상세 스펙]
CPU: AMD 라이젠 5 5600X
VGA: 갤럭시 RTX 3070 Ti (5060과 비슷한 깡성능)
RAM: DDR4 16GB (8GB x 2, LED 튜닝 방열판 적용)
SSD: NVMe 512GB (빠른 부팅 및 로딩)
Cooler & Case: 공랭 사제 쿨러 + LED 케이스 팬 (발열 잘잡음)
작동잘되며 교환환불은 안됩니다.`;

describe("parsePastedListings", () => {
  it("reads one Daangn PC paste as a single listing", () => {
    const [row] = parsePastedListings(SAMPLE);
    expect(row?.askingPriceKrw).toBe(830000);
    expect(row?.parts).toEqual(
      expect.arrayContaining([
        { category: "CPU", name: "Ryzen 5 5600X" },
        { category: "GPU", name: "RTX 3070 TI" },
        { category: "RAM", name: "DDR4 16GB" },
        { category: "SSD", name: "SSD 512GB" },
      ]),
    );
    expect(row?.parts.some((part) => part.name.includes("5060"))).toBe(false);
  });

  it("splits multiple listings on ---", () => {
    const rows = parsePastedListings(`${SAMPLE}\n---\nRTX 4060 단품\n340,000원\nhttps://www.daangn.com/articles/1`);
    expect(rows).toHaveLength(2);
    expect(rows[1]?.askingPriceKrw).toBe(340000);
    expect(rows[1]?.parts.some((part) => part.category === "GPU" && part.name === "RTX 4060")).toBe(true);
  });
});

describe("extractPastedParts", () => {
  it("does not treat JSON field names as parts", () => {
    const parts = extractPastedParts(`kind: "part"\nname: "DDR4 16GB"\ncategory: "RAM"\npriceKrw: 190000`);
    expect(parts.some((part) => /rtx 5080|white gaming/i.test(part.name))).toBe(false);
  });
});
