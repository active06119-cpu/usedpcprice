import type { NextResponse } from "next/server";

import { getRequiredAdminToken, isAdminAuthorized, unauthorizedJson } from "@/lib/admin-auth";

export function guardAdminRequest(req: Request): NextResponse | null {
  if (!getRequiredAdminToken()) {
    return unauthorizedJson();
  }
  if (!isAdminAuthorized(req)) {
    return unauthorizedJson();
  }
  return null;
}
