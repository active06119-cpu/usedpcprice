export type EnvPresence = {
  DATABASE_URL: boolean;
  DIRECT_URL: boolean;
  ANTHROPIC_API_KEY: boolean;
};

export type UrlKind = "supabase_pooler" | "supabase_direct" | "localhost" | "invalid" | "other";

export type UrlPasteHint =
  | "wrapping_quotes"
  | "env_key_prefix"
  | "newline"
  | "placeholder_password"
  | "missing_protocol"
  | "question_mark_before_host";

export type UrlInspection = {
  present: boolean;
  hostKind?: UrlKind;
  port?: string;
  hasPgbouncerParam?: boolean;
  hasSslMode?: boolean;
  pasteHints?: UrlPasteHint[];
};

export type DbFailureReason =
  | "missing_database_url"
  | "invalid_connection_string"
  | "auth_failed"
  | "unreachable_host"
  | "timeout"
  | "server_closed"
  | "project_paused_or_inactive"
  | "client_init_failed"
  | "unknown";

export function envPresence(env: NodeJS.ProcessEnv = process.env): EnvPresence {
  return {
    DATABASE_URL: Boolean(env.DATABASE_URL?.trim()),
    DIRECT_URL: Boolean(env.DIRECT_URL?.trim()),
    ANTHROPIC_API_KEY: Boolean(env.ANTHROPIC_API_KEY?.trim()),
  };
}

function collectPasteHints(raw: string): UrlPasteHint[] {
  const hints: UrlPasteHint[] = [];
  if (/^["']|["']$/.test(raw.trim())) hints.push("wrapping_quotes");
  if (/^(DATABASE_URL|DIRECT_URL)\s*=/i.test(raw.trim())) hints.push("env_key_prefix");
  if (/[\r\n]/.test(raw)) hints.push("newline");
  if (/\[YOUR-PASSWORD\]/i.test(raw)) hints.push("placeholder_password");
  if (!/^\s*["']?\s*(DATABASE_URL\s*=\s*["']?)?postgres(ql)?:\/\//i.test(raw)) {
    hints.push("missing_protocol");
  }
  const atIndex = raw.indexOf("@");
  const qIndex = raw.indexOf("?");
  if (qIndex >= 0 && (atIndex < 0 || qIndex < atIndex)) {
    hints.push("question_mark_before_host");
  }
  return hints;
}

function stripPasteNoise(raw: string): string {
  return raw
    .trim()
    .replace(/^(DATABASE_URL|DIRECT_URL)\s*=\s*/i, "")
    .replace(/^["']|["']$/g, "")
    .trim();
}

export function inspectPostgresUrl(raw?: string | null): UrlInspection {
  const value = raw ?? "";
  if (!value.trim()) return { present: false };

  const pasteHints = collectPasteHints(value);
  const candidates = [value.trim(), stripPasteNoise(value)].filter(
    (item, index, arr) => item && arr.indexOf(item) === index,
  );

  for (const candidate of candidates) {
    try {
      const normalized = candidate.replace(/^prisma\+/, "");
      const url = new URL(normalized);
      const host = url.hostname.toLowerCase();
      const port = url.port || (url.protocol.startsWith("postgres") ? "5432" : "");

      let hostKind: UrlKind = "other";
      if (host.includes("pooler.supabase.com")) hostKind = "supabase_pooler";
      else if (host.endsWith(".supabase.co") || host.includes("supabase.com")) hostKind = "supabase_direct";
      else if (host === "localhost" || host === "127.0.0.1") hostKind = "localhost";

      if (!host) continue;

      return {
        present: true,
        hostKind,
        port,
        hasPgbouncerParam: url.searchParams.has("pgbouncer"),
        hasSslMode: url.searchParams.has("sslmode"),
        pasteHints: pasteHints.length ? pasteHints : undefined,
      };
    } catch {
      // try next candidate
    }
  }

  return {
    present: true,
    hostKind: "invalid",
    pasteHints: pasteHints.length ? pasteHints : undefined,
  };
}

export function classifyDbError(error: unknown, env: NodeJS.ProcessEnv = process.env): {
  reason: DbFailureReason;
  code: string | null;
  name: string;
} {
  const code =
    typeof error === "object" && error && "code" in error && typeof (error as { code?: unknown }).code === "string"
      ? (error as { code: string }).code
      : null;
  const name = error instanceof Error ? error.name : "Unknown";
  const message = error instanceof Error ? error.message : "";

  if (!env.DATABASE_URL?.trim()) {
    return { reason: "missing_database_url", code, name };
  }
  if (inspectPostgresUrl(env.DATABASE_URL).hostKind === "invalid") {
    return { reason: "invalid_connection_string", code, name };
  }
  if (code === "P1013" || /invalid.*connection string|invalid `prisma:/i.test(message)) {
    return { reason: "invalid_connection_string", code, name };
  }
  if (code === "P1000" || /authentication failed|tenant or user not found|password authentication/i.test(message)) {
    return { reason: "auth_failed", code, name };
  }
  if (code === "P1001" || /can't reach database server/i.test(message)) {
    return { reason: "unreachable_host", code, name };
  }
  if (/timed out|timeout/i.test(message)) {
    return { reason: "timeout", code, name };
  }
  if (code === "P1017" || /server has closed the connection/i.test(message)) {
    return { reason: "server_closed", code, name };
  }
  if (/paused|inactive|not yet started|project is paused/i.test(message)) {
    return { reason: "project_paused_or_inactive", code, name };
  }
  if (name.includes("Initialization")) {
    return { reason: "client_init_failed", code, name };
  }
  return { reason: "unknown", code, name };
}
