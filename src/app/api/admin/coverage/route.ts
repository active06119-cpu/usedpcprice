import { NextResponse } from "next/server";

import { guardAdminRequest } from "@/lib/admin-guard";
import { prisma } from "@/lib/prisma";

const USED = ["DAANGN", "BUNJANG", "JOONGNA", "MANUAL"] as const;
const FOCUS = ["GPU", "CPU", "RAM", "SSD"] as const;

export async function GET(req: Request) {
  const guard = guardAdminRequest(req);
  if (guard) return guard;

  const since = new Date(Date.now() - 90 * 86_400_000);
  const parts = await prisma.part.findMany({
    where: { isActive: true, category: { in: FOCUS as any } },
    select: {
      id: true,
      fullName: true,
      category: true,
      _count: {
        select: {
          snapshots: {
            where: {
              sourceType: { in: USED as any },
              capturedAt: { gte: since },
            },
          },
        },
      },
    },
  });

  const rows = parts
    .map((p) => ({
      id: p.id,
      name: p.fullName,
      category: p.category,
      samples90: p._count.snapshots,
    }))
    .sort((a, b) => a.samples90 - b.samples90 || a.name.localeCompare(b.name));

  const thin = rows.filter((r) => r.samples90 < 8);
  const byCategory = FOCUS.map((category) => {
    const list = rows.filter((r) => r.category === category);
    const samples = list.reduce((s, r) => s + r.samples90, 0);
    return {
      category,
      parts: list.length,
      samples,
      thin: list.filter((r) => r.samples90 < 8).length,
    };
  });

  return NextResponse.json({
    ok: true,
    since: since.toISOString(),
    byCategory,
    thin: thin.slice(0, 80),
    totalParts: rows.length,
    thinCount: thin.length,
  });
}
