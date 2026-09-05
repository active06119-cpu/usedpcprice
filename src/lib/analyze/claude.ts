// Anthropic Messages API 호출. 분석 파이프라인 전용.

export const CLAUDE_MODEL = "claude-sonnet-5";

export type ClaudeHealth = {
  present: boolean;
  keyPrefix: "sk-ant" | "unexpected" | "missing";
  model: string;
  httpStatus: number | null;
  errorType: string | null;
  reason: string;
};

function keyPrefixOf(raw?: string | null): ClaudeHealth["keyPrefix"] {
  const value = raw?.trim() ?? "";
  if (!value) return "missing";
  return value.startsWith("sk-ant-") ? "sk-ant" : "unexpected";
}

export function classifyAnthropicStatus(status: number, errorType?: string | null): string {
  if (status === 401 || errorType === "authentication_error") return "invalid_api_key";
  if (status === 403 || errorType === "permission_error") return "no_permission";
  if (status === 404 || errorType === "not_found_error") return "model_or_route_not_found";
  if (status === 429 || errorType === "rate_limit_error") return "rate_limited";
  if (status === 402 || /billing|credit|quota/i.test(errorType ?? "")) return "billing";
  if (status === 400 || errorType === "invalid_request_error") return "invalid_request";
  if (status === 529 || errorType === "overloaded_error") return "overloaded";
  if (status >= 500) return "anthropic_server_error";
  return "unknown";
}

export async function probeClaude(env: NodeJS.ProcessEnv = process.env): Promise<ClaudeHealth> {
  const apiKey = env.ANTHROPIC_API_KEY?.trim() ?? "";
  const keyPrefix = keyPrefixOf(apiKey);
  if (!apiKey) {
    return {
      present: false,
      keyPrefix,
      model: CLAUDE_MODEL,
      httpStatus: null,
      errorType: null,
      reason: "missing_key",
    };
  }

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: CLAUDE_MODEL,
      max_tokens: 16,
      thinking: { type: "disabled" },
      messages: [{ role: "user", content: "ping" }],
    }),
  });

  const data = (await res.json()) as {
    error?: { type?: string; message?: string };
    content?: Array<{ type?: string; text?: string }>;
  };
  const errorType = data.error?.type ?? null;

  return {
    present: true,
    keyPrefix,
    model: CLAUDE_MODEL,
    httpStatus: res.status,
    errorType,
    reason: res.ok ? "ok" : classifyAnthropicStatus(res.status, errorType),
  };
}

export async function callClaude(system: string, user: string): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY_MISSING");
  }

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: CLAUDE_MODEL,
      max_tokens: 4096,
      thinking: { type: "disabled" },
      system,
      messages: [{ role: "user", content: user }],
    }),
  });

  const data = (await res.json()) as {
    content?: Array<{ type?: string; text?: string }>;
    error?: { type?: string; message?: string };
  };

  if (!res.ok) {
    const detail = data.error?.message ?? res.statusText;
    const reason = classifyAnthropicStatus(res.status, data.error?.type);
    console.error("[callClaude] API error:", res.status, reason, detail);
    throw new Error(`CLAUDE_API_ERROR:${res.status}:${reason}`);
  }

  const text = (data.content ?? [])
    .filter((block) => block.type === "text" || Boolean(block.text))
    .map((block) => block.text?.trim() ?? "")
    .filter(Boolean)
    .join("\n")
    .trim();

  if (!text) {
    console.error("[callClaude] empty response:", { stop: (data as { stop_reason?: string }).stop_reason });
    throw new Error("CLAUDE_EMPTY_RESPONSE");
  }

  return text;
}
