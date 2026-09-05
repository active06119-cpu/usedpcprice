import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { ADMIN_COOKIE, getRequiredAdminToken, tokensEqual } from "@/lib/admin-auth";

const PUBLIC_ADMIN_API = new Set([
  "/api/admin/login",
  "/api/admin/url-analyze",
  "/api/admin/url-save",
]);

function cookieToken(req: NextRequest): string {
  return req.cookies.get(ADMIN_COOKIE)?.value ?? "";
}

function headerToken(req: NextRequest): string {
  return (
    req.headers.get("x-admin-token")?.trim() ??
    req.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim() ??
    ""
  );
}

function isAuthed(req: NextRequest): boolean {
  const required = getRequiredAdminToken();
  if (!required) return false;
  const provided = headerToken(req) || cookieToken(req);
  return Boolean(provided) && tokensEqual(provided, required);
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (pathname === "/admin/login" || pathname.startsWith("/admin/login/")) {
    return NextResponse.next();
  }

  if (PUBLIC_ADMIN_API.has(pathname)) {
    return NextResponse.next();
  }

  if (pathname.startsWith("/admin") || pathname.startsWith("/api/admin")) {
    if (!getRequiredAdminToken()) {
      if (pathname.startsWith("/api/")) {
        return NextResponse.json({ ok: false, message: "권한이 없습니다." }, { status: 401 });
      }
      const url = req.nextUrl.clone();
      url.pathname = "/admin/login";
      url.searchParams.set("next", pathname);
      url.searchParams.set("reason", "missing-token");
      return NextResponse.redirect(url);
    }

    if (!isAuthed(req)) {
      if (pathname.startsWith("/api/")) {
        return NextResponse.json({ ok: false, message: "권한이 없습니다." }, { status: 401 });
      }
      const url = req.nextUrl.clone();
      url.pathname = "/admin/login";
      url.searchParams.set("next", pathname);
      return NextResponse.redirect(url);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*", "/api/admin/:path*"],
};
