/**
 * 조립PC 호구 판정 코어 (관리자·소비자 라우트 공용).
 * 텍스트/이미지 → Claude로 부품 분해 → 부품별 시세 합 + 잔부품 정액 → 판정 + 기록 저장.
 */
import type { PrismaClient } from "@prisma/client";
import { ListingInputType, ParseStatus, ValuationType } from "@prisma/client";

import { basisLabel } from "./pricing/layered";
import { findPartId, resolvePartUsedBand } from "./pricing/resolve-part";

/** 케이스·쿨러·팬·케이블 등 개별로 안 세는 잔부품 정액 */
export const MISC_ALLOWANCE = 50_000;
/** 개별 시세를 안 매기고 잔부품 정액에 포함하는 카테고리 */
const MINOR_CATEGORIES = new Set(["CASE", "COOLER", "MONITOR", "OTHER"]);

const DECOMPOSE_SYSTEM = `너는 중고 조립PC 매물에서 부품 구성을 뽑아내는 분석기다.
매물 텍스트/이미지에서 들어있는 PC 부품을 추출해 extract_components 도구로 보고한다.
- 각 부품: category, name(영문 표준 모델명, 예: "RTX 4060 Ti", "Ryzen 5 7500F", "Samsung DDR5 16GB")
- 그래픽카드/CPU/램/SSD/메인보드/파워 위주로. 케이스·쿨러는 모델명 알면 넣되 모르면 생략.
- 전체 판매가가 보이면 totalPriceKrw 에 숫자로.`;

export type Component = { category: string; name: string };
export type ImageInput = { mediaType: string; base64: string };

export type PricedItem = {
  name: string;
  category: string;
  partId: string;
  mid: number;
  low: number;
  high: number;
  basis: string;
};

export type ValuationResult = {
  askingPriceKrw: number | null;
  fairMid: number;
  fairLow: number;
  fairHigh: number;
  miscAllowance: number;
  priced: PricedItem[];
  unpriced: Array<{ name: string; category: string }>;
  misc: Array<{ name: string; category: string }>;
  verdict: string | null;
  verdictKo: string;
};

async function decompose(input: { text?: string; image?: ImageInput }): Promise<{
  components: Component[];
  totalPriceKrw: number | null;
}> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY가 설정되지 않았습니다.");

  const content: unknown[] = [];
  if (input.image) {
    content.push({
      type: "image",
      source: { type: "base64", media_type: input.image.mediaType, data: input.image.base64 },
    });
  }
  content.push({
    type: "text",
    text: input.text
      ? `아래 조립PC 매물의 부품 구성을 뽑아줘:\n\n${input.text}`
      : "이 조립PC 매물 이미지의 부품 구성을 뽑아줘.",
  });

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({
      model: "claude-sonnet-5",
      max_tokens: 2000,
      system: DECOMPOSE_SYSTEM,
      tools: [
        {
          name: "extract_components",
          description: "조립PC의 부품 구성과 전체 판매가를 보고한다.",
          input_schema: {
            type: "object",
            properties: {
              components: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    category: {
                      type: "string",
                      enum: ["GPU", "CPU", "RAM", "SSD", "HDD", "MOTHERBOARD", "PSU", "CASE", "COOLER", "MONITOR", "OTHER"],
                    },
                    name: { type: "string" },
                  },
                  required: ["category", "name"],
                },
              },
              totalPriceKrw: { type: "number" },
            },
            required: ["components"],
          },
        },
      ],
      tool_choice: { type: "tool", name: "extract_components" },
      messages: [{ role: "user", content }],
    }),
  });

  if (!res.ok) throw new Error(`Claude API ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = (await res.json()) as {
    content?: Array<{ type?: string; input?: { components?: Component[]; totalPriceKrw?: number } }>;
  };
  const tool = (data.content ?? []).find((c) => c.type === "tool_use");
  return {
    components: Array.isArray(tool?.input?.components) ? tool!.input!.components! : [],
    totalPriceKrw: typeof tool?.input?.totalPriceKrw === "number" ? tool!.input!.totalPriceKrw! : null,
  };
}

function verdict(asking: number, fairMid: number): { code: string; ko: string } {
  const ratio = asking / fairMid;
  if (ratio <= 0.85) return { code: "CHEAP", ko: "싸다 👍" };
  if (ratio <= 1.05) return { code: "FAIR", ko: "적정가" };
  if (ratio <= 1.25) return { code: "OVERPRICED", ko: "약간 비쌈" };
  return { code: "WAY_OVERPRICED", ko: "많이 비쌈 ⚠️" };
}

async function saveRecord(
  prisma: PrismaClient,
  rec: { rawText: string; result: ValuationResult },
): Promise<void> {
  const listing = await prisma.listing.create({
    data: {
      inputType: ListingInputType.TEXT_PASTE,
      rawText: rec.rawText,
      parseStatus: ParseStatus.SUCCESS,
      parsedAt: new Date(),
    },
  });
  const run = await prisma.valuationRun.create({
    data: {
      runType: ValuationType.BUYER_CHECK,
      listingId: listing.id,
      askingPriceKrw: rec.result.askingPriceKrw,
      verdict: (rec.result.verdict ?? "NO_PRICE") as any,
      totalFairMid: rec.result.fairMid,
      totalFairLow: rec.result.fairLow,
      totalFairHigh: rec.result.fairHigh,
    },
  });
  for (const p of rec.result.priced) {
    await prisma.valuationItem.create({
      data: {
        valuationRunId: run.id,
        partId: p.partId,
        rawPartLabel: p.name,
        fairLowKrw: p.low,
        fairMidKrw: p.mid,
        fairHighKrw: p.high,
        snapshotIds: [],
        adjustmentsApplied: [],
      },
    });
  }
}

/** 조립PC 판정 (분해 → 시세 합 → 판정 → 기록 저장). */
export async function valuatePc(
  prisma: PrismaClient,
  input: { text?: string; image?: ImageInput; askingPriceKrw?: number | null },
): Promise<ValuationResult> {
  const { components, totalPriceKrw } = await decompose({ text: input.text, image: input.image });
  if (components.length === 0) throw new Error("부품 구성을 찾지 못했습니다.");

  const asking =
    typeof input.askingPriceKrw === "number" && input.askingPriceKrw > 0
      ? input.askingPriceKrw
      : totalPriceKrw;

  const priced: PricedItem[] = [];
  const unpriced: Array<{ name: string; category: string }> = [];
  const misc: Array<{ name: string; category: string }> = [];

  for (const c of components) {
    if (MINOR_CATEGORIES.has(c.category)) {
      misc.push({ name: c.name, category: c.category });
      continue;
    }
    const partId = await findPartId(prisma, c.name, c.category, { loose: false });
    const band = partId ? await resolvePartUsedBand(prisma, partId, c.category) : null;
    if (partId && band) {
      priced.push({
        name: c.name,
        category: c.category,
        partId,
        mid: band.usedMid,
        low: band.usedLow,
        high: band.usedHigh,
        basis: basisLabel(band),
      });
    } else {
      unpriced.push({ name: c.name, category: c.category });
    }
  }

  const fairMid = priced.reduce((s, p) => s + p.mid, 0) + MISC_ALLOWANCE;
  const fairLow = Math.round(fairMid * 0.9);
  const fairHigh = Math.round(fairMid * 1.1);
  const v = asking && fairMid > 0 ? verdict(asking, fairMid) : null;

  const result: ValuationResult = {
    askingPriceKrw: asking ?? null,
    fairMid,
    fairLow,
    fairHigh,
    miscAllowance: MISC_ALLOWANCE,
    priced,
    unpriced,
    misc,
    verdict: v?.code ?? null,
    verdictKo: v?.ko ?? "가격 정보 없음",
  };

  try {
    await saveRecord(prisma, {
      rawText: input.text?.trim() || `[이미지 캡처] ${components.map((c) => c.name).join(", ")}`,
      result,
    });
  } catch (e) {
    console.error("[valuatePc] 기록 저장 실패:", e);
  }

  return result;
}

export function parseDataUrl(dataUrl: string): ImageInput | null {
  const m = dataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  return m ? { mediaType: m[1], base64: m[2] } : null;
}
