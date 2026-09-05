import { NextResponse } from "next/server";

import { envPresence, inspectPostgresUrl } from "@/lib/db-health";

export async function GET() {
  return NextResponse.json({
    ok: true,
    env: envPresence(),
    urls: {
      databaseUrl: inspectPostgresUrl(process.env.DATABASE_URL),
      directUrl: inspectPostgresUrl(process.env.DIRECT_URL),
    },
    checkedAt: new Date().toISOString(),
  });
}
