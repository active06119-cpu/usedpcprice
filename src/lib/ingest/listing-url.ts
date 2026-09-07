export function extractSourceUrl(text: string): string | null {
  const match = text.match(/https?:\/\/[^\s]+/i);
  if (!match) return null;
  return normalizeSourceUrl(match[0]);
}

export function normalizeSourceUrl(raw: string): string | null {
  try {
    const url = new URL(raw.replace(/[),.;]+$/g, ""));
    if (!/^https?:$/i.test(url.protocol)) return null;
    url.hash = "";
    for (const key of ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "fbclid", "gclid"]) {
      url.searchParams.delete(key);
    }
    url.pathname = url.pathname.replace(/\/+$/, "") || "/";
    url.hostname = url.hostname.toLowerCase().replace(/^www\./, "");
    return url.toString();
  } catch {
    return null;
  }
}
