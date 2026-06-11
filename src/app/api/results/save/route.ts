import { NextRequest, NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { Prisma } from "@prisma/client";

import type { AnalyzeResult } from "@/app/api/analyze/route";
import { prisma } from "@/lib/prisma";

type SaveBody = {
  result?: AnalyzeResult;
  sourceText?: string;
};

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as SaveBody;
    const result = body.result;
    if (!result || !Array.isArray(result.parts)) {
      return NextResponse.json({ ok: false, message: "저장할 결과 데이터가 없습니다." }, { status: 400 });
    }

    const id = nanoid(6);
    const payload = ({
      ...result,
      sourceText: body.sourceText ?? null,
      savedAt: new Date().toISOString(),
    } as unknown) as Prisma.InputJsonValue;

    await prisma.valuationResult.create({
      data: {
        id,
        payload,
      },
    });

    return NextResponse.json({ ok: true, id });
  } catch (error) {
    console.error("결과 저장 실패:", error);
    return NextResponse.json({ ok: false, message: "결과 저장에 실패했습니다." }, { status: 500 });
  }
}
