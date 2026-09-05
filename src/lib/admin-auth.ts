import { NextResponse } from "next/server";

export const ADMIN_COOKIE = "admin_session";
export const ADMIN_COOKIE_MAX_AGE = 60 * 60 * 24 * 7;

export function getRequiredAdminToken(): string | null {
  const token = process.env.ADMIN_API_TOKEN?.trim();
  return token ? token : null;
}

export function tokensEqual(provided: string, expected: string): boolean {
  if (provided.length !== expected.length) {
    let acc = 0;
    const sample = expected || provided;
    for (let i = 0; i < sample.length; i += 1) acc |= sample.charCodeAt(i);
    return acc === -1;
  }
  let diff = 0;
  for (let i = 0; i < expected.length; i += 1) {
    diff |= provided.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return diff === 0;
}

export function readProvidedAdminToken(req: Request): string {
  const header =
    req.headers.get("x-admin-token")?.trim() ??
    req.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim() ??
    "";
  if (header) return header;

  const cookie = req.headers.get("cookie") ?? "";
  const match = cookie.match(new RegExp(`(?:^|;\\s*)${ADMIN_COOKIE}=([^;]+)`));
  return match ? decodeURIComponent(match[1]) : "";
}

export function isAdminAuthorized(req: Request): boolean {
  const required = getRequiredAdminToken();
  if (!required) return false;
  const provided = readProvidedAdminToken(req);
  if (!provided) return false;
  return tokensEqual(provided, required);
}

export function unauthorizedJson() {
  return NextResponse.json({ ok: false, message: "권한이 없습니다." }, { status: 401 });
}

export function adminCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: ADMIN_COOKIE_MAX_AGE,
  };
}
