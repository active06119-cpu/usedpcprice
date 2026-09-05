import { classifyDbError, envPresence, inspectPostgresUrl } from "@/lib/db-health";

describe("envPresence", () => {
  it("reports only boolean presence", () => {
    expect(
      envPresence({
        DATABASE_URL: "postgres://x",
        DIRECT_URL: "   ",
        ANTHROPIC_API_KEY: "sk-ant-secret",
      }),
    ).toEqual({
      DATABASE_URL: true,
      DIRECT_URL: false,
      ANTHROPIC_API_KEY: true,
    });
  });
});

describe("inspectPostgresUrl", () => {
  it("detects supabase pooler + pgbouncer without exposing the host", () => {
    const info = inspectPostgresUrl(
      "postgresql://postgres.abc:pass@aws-0-ap-northeast-2.pooler.supabase.com:6543/postgres?pgbouncer=true",
    );
    expect(info).toEqual({
      present: true,
      hostKind: "supabase_pooler",
      port: "6543",
      hasPgbouncerParam: true,
      hasSslMode: false,
    });
  });

  it("detects supabase direct db host", () => {
    const info = inspectPostgresUrl("postgresql://postgres:pass@db.abcdefghijklmnop.supabase.co:5432/postgres");
    expect(info.hostKind).toBe("supabase_direct");
    expect(info.port).toBe("5432");
  });

  it("marks malformed urls invalid instead of throwing", () => {
    expect(inspectPostgresUrl("not-a-url")).toEqual({ present: true, hostKind: "invalid" });
  });
});

describe("classifyDbError", () => {
  it("flags missing DATABASE_URL first", () => {
    expect(classifyDbError(new Error("boom"), {}).reason).toBe("missing_database_url");
  });

  it("maps prisma codes", () => {
    const env = { DATABASE_URL: "postgres://x" };
    expect(classifyDbError({ code: "P1001", message: "Can't reach database server" }, env).reason).toBe(
      "unreachable_host",
    );
    expect(classifyDbError({ code: "P1000", name: "Error", message: "Authentication failed" }, env).reason).toBe(
      "auth_failed",
    );
    expect(classifyDbError({ code: "P1013", name: "Error", message: "invalid" }, env).reason).toBe(
      "invalid_connection_string",
    );
  });
});
