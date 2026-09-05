// Anthropic Messages API 호출. 분석 파이프라인 전용.

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
      model: "claude-sonnet-5",
      max_tokens: 4096,
      system,
      messages: [{ role: "user", content: user }],
    }),
  });

  const data = (await res.json()) as {
    content?: Array<{ text?: string }>;
    error?: { type?: string; message?: string };
  };

  if (!res.ok) {
    const detail = data.error?.message ?? res.statusText;
    console.error("[callClaude] API error:", res.status, detail);
    throw new Error(`CLAUDE_API_ERROR:${res.status}:${detail}`);
  }

  const text = data.content?.[0]?.text?.trim() ?? "";
  if (!text) {
    console.error("[callClaude] empty response:", data);
    throw new Error("CLAUDE_EMPTY_RESPONSE");
  }

  return text;
}
