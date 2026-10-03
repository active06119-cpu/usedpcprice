const LISTING_HOST = /(?:www\.)?(?:daangn\.com|karrotmarket\.com|bunjang\.co\.kr)/i;

export function extractSourceUrl(text: string): string | null {
  const https = text.match(/https?:\/\/[^\s]+/i);
  const bare = text.match(new RegExp(`${LISTING_HOST.source}\/[^\s]+`, "i"));
  const raw = https?.[0] ?? (bare ? `https://${bare[0]}` : null);
  if (!raw) return null;
  const normalized = normalizeSourceUrl(raw);
  if (!normalized || isGenericMarketplaceUrl(normalized)) return null;
  return normalized;
}

export function isUrlOnlyLine(line: string): boolean {
  return /^(?:https?:\/\/)?(?:www\.)?(?:daangn\.com|karrotmarket\.com|bunjang\.co\.kr)(?:\/\S*)?$/i.test(line.trim());
}

export function isGenericMarketplaceUrl(raw: string): boolean {
  try {
    const url = new URL(/^https?:/i.test(raw) ? raw : `https://${raw}`);
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    if (!/^(daangn\.com|karrotmarket\.com|bunjang\.co\.kr)$/.test(host)) return false;
    const path = url.pathname.replace(/\/+$/, "") || "/";
    return path === "/" || path === "/buy-sell" || path === "/kr" || path === "/kr/buy-sell" || path === "/products";
  } catch {
    return false;
  }
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
