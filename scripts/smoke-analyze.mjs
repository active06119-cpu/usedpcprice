#!/usr/bin/env node
/**
 * Live /api/analyze smoke. Does not store tokens.
 *   SMOKE_ANALYZE_URL=https://usedpcprice.vercel.app/api/analyze node scripts/smoke-analyze.mjs
 */
const url = process.env.SMOKE_ANALYZE_URL || "https://usedpcprice.vercel.app/api/analyze";

const cases = [
  {
    id: "4060-ddr4-16",
    text: "RTX 4060 8GB + i5-13600K + DDR4 16GB 팝니다 65만원 상태 좋습니다",
  },
  {
    id: "4060ti-ddr4-32kit",
    text: "지포스 4060ti 8기가 / 라이젠 5600 / 삼성 DDR4 32GB 2x16 키트 팝니다 78만원",
  },
];

function lastResult(ndjson) {
  const lines = ndjson
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));
  return lines[lines.length - 1] ?? null;
}

async function run() {
  const summary = [];
  for (const testCase of cases) {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "used", text: testCase.text }),
    });
    const body = await res.text();
    const parsed = lastResult(body);
    const names = (parsed?.result?.parts ?? []).map((part) => `${part.category}:${part.partName}`);
    summary.push({
      id: testCase.id,
      http: res.status,
      error: parsed?.error ?? null,
      parts: names,
    });
    console.log(JSON.stringify(summary[summary.length - 1], null, 2));
  }
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
