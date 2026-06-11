import { NextResponse } from "next/server";

export function guardAdminRequest(req: Request): NextResponse | null {
  const requiredToken = process.env.ADMIN_API_TOKEN?.trim();
  if (!requiredToken) return null;

  const provided =
    req.headers.get("x-admin-token")?.trim() ??
    req.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();

  if (provided !== requiredToken) {
    return NextResponse.json({ ok: false, message: "권한이 없습니다." }, { status: 401 });
  }

  return null;
}
