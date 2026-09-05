import { NextResponse } from "next/server";

import {
  ADMIN_COOKIE,
  adminCookieOptions,
  getRequiredAdminToken,
  tokensEqual,
} from "@/lib/admin-auth";

export async function POST(req: Request) {
  const required = getRequiredAdminToken();
  if (!required) {
    return NextResponse.json(
      { ok: false, message: "서버에 ADMIN_API_TOKEN이 없습니다." },
      { status: 503 },
    );
  }

  let token = "";
  try {
    const body = (await req.json()) as { token?: string };
    token = body.token?.trim() ?? "";
  } catch {
    token = "";
  }

  if (!token || !tokensEqual(token, required)) {
    return NextResponse.json({ ok: false, message: "토큰이 올바르지 않습니다." }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(ADMIN_COOKIE, token, adminCookieOptions());
  return res;
}
