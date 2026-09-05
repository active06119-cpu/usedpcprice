import { NextResponse } from "next/server";

import { probeClaude } from "@/lib/analyze/claude";

export async function GET() {
  const probe = await probeClaude();
  return NextResponse.json(
    {
      ok: probe.reason === "ok",
      ...probe,
      checkedAt: new Date().toISOString(),
    },
    { status: probe.reason === "ok" || probe.reason === "missing_key" ? 200 : 500 },
  );
}
