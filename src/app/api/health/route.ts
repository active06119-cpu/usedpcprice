import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    ok: true,
    service: "computer-calculator-api",
    checkedAt: new Date().toISOString(),
  });
}
