import { NextRequest, NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { Prisma } from "@prisma/client";

import type { AnalyzeResult } from "@/app/api/analyze/route";
import { prisma } from "@/lib/prisma";

type SaveBody = {
  result?: AnalyzeResult;
  sourceText?: string;
};

function serializeAnalyzeResult(result: AnalyzeResult, sourceText?: string) {
  return JSON.parse(
    JSON.stringify({
      ...result,
      sourceText: sourceText ?? null,
      savedAt: new Date().toISOString(),
    }),
  ) as Prisma.InputJsonValue;
}

async function createSharedResult(payload: Prisma.InputJsonValue): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const id = nanoid(10);
    try {
      await prisma.valuationResult.create({
        data: { id, payload },
      });
      return id;
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002" &&
        attempt < 4
      ) {
        continue;
      }
      throw error;
    }
  }

  throw new Error("공유 ID 생성에 실패했습니다.");
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as SaveBody;
    const result = body.result;
    if (!result || !Array.isArray(result.parts)) {
      return NextResponse.json({ ok: false, message: "저장할 결과 데이터가 없습니다." }, { status: 400 });
    }

    const payload = serializeAnalyzeResult(result, body.sourceText);
    const id = await createSharedResult(payload);

    return NextResponse.json({ ok: true, id });
  } catch (error) {
    console.error("결과 저장 실패:", error);

    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2021") {
      return NextResponse.json(
        {
          ok: false,
          message: "공유 저장 테이블(valuation_results)이 없습니다. DB 마이그레이션을 실행해주세요.",
        },
        { status: 500 },
      );
    }

    return NextResponse.json({ ok: false, message: "결과 저장에 실패했습니다." }, { status: 500 });
  }
}
