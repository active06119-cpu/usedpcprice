export type ExtractedPart = {
  partName: string;
  category: string;
  condition: string;
  conditionKo: string;
};

export type ExtractedListing = {
  askingPrice: number | null;
  parts: ExtractedPart[];
};

const EXTRACT_SYSTEM = `
너는 한국 중고마켓 PC 매물 텍스트 파서야. 부품과 가격을 추출해서 JSON으로만 반환해.

=== 부품명 정규화 규칙 ===
한국어/약칭을 반드시 영문 표준명으로 변환:
- "4070", "지포스4070", "rtx4070", "지포스 4070" → "RTX 4070"
- "4070ti", "4070 티아이", "4070TI" → "RTX 4070 Ti"
- "4070 슈퍼", "4070s" → "RTX 4070 SUPER"
- "3080", "지포스 3080" → "RTX 3080"
- "7900xtx", "라데온 7900" → "RX 7900 XTX"
- "아이5 13600k", "i5-13600k", "인텔 13600k" → "Core i5-13600K"
- "아이7 14700k", "i7 14700" → "Core i7-14700K"
- "라이젠 5600x", "r5 5600x", "5600엑스" → "Ryzen 5 5600X"
- "라이젠 7800x3d", "7800x3d" → "Ryzen 7 7800X3D"
- "삼성 32기가", "ddr4 32g" → "Samsung DDR4 32GB"
- "980프로 1테라", "980pro 1tb" → "Samsung 980 PRO 1TB"

=== 가격 추출 규칙 ===
- "52만" / "52만원" / "520,000" / "52만에" → 520000
- "130만" / "1300000" / "130만원" → 1300000
- "네고가능 50만" → 500000
- "가격제안" / "가격미정" / 가격 없음 → null

=== 상태 판단 ===
NEW: 미개봉, 새제품, 신품, 봉인
LIKE_NEW: 개봉만, 거의새것, 미사용, 풀박스, 1주일
GOOD: 사용감없음, 깨끗, 3개월이하, 상급, A급, 박스있음
FAIR: 사용감있음, 6개월이상, 1년, B급, 박스없음
POOR: 불량, 파손, 부품용, 고장, 스크래치심함
명시 없으면: GOOD

=== 카테고리 ===
GPU(그래픽카드), CPU(프로세서), RAM(메모리), SSD, HDD, MOTHERBOARD(메인보드), PSU(파워), CASE(케이스), COOLER(쿨러)

=== 출력 형식 ===
반드시 JSON만. 설명 없음. 마크다운 없음.
{
  "askingPrice": 숫자 or null,
  "parts": [
    {
      "partName": "RTX 4070",
      "category": "GPU",
      "condition": "GOOD",
      "conditionKo": "사용감 적음"
    }
  ]
}
`;

async function callClaude(system: string, user: string): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY is not configured.");
  }

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 2000,
      system,
      messages: [{ role: "user", content: user }],
    }),
  });

  const data = await res.json();
  return data.content?.[0]?.text ?? "";
}

export async function extractListingFromText(text: string): Promise<ExtractedListing> {
  const raw = await callClaude(EXTRACT_SYSTEM, text);
  const cleaned = raw.replace(/```json|```/g, "").trim();
  const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error("JSON not found in extraction response.");
  }

  const parsed = JSON.parse(jsonMatch[0]) as Partial<ExtractedListing>;
  return {
    askingPrice: typeof parsed.askingPrice === "number" ? parsed.askingPrice : null,
    parts: Array.isArray(parsed.parts) ? (parsed.parts as ExtractedPart[]) : [],
  };
}
