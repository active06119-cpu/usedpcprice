const ALLOWED_HOSTS = [
  "daangn.com",
  "www.daangn.com",
  "bunjang.co.kr",
  "www.bunjang.co.kr",
  "m.bunjang.co.kr",
  "cafe.naver.com",
];

export function parseMarketSourceUrl(raw: string): URL | null {
  try {
    const url = new URL(raw.trim());
    if (!/^https?:$/i.test(url.protocol)) return null;
    const host = url.hostname.toLowerCase();
    const allowed = ALLOWED_HOSTS.some((item) => host === item || host.endsWith(`.${item}`));
    return allowed ? url : null;
  } catch {
    return null;
  }
}

export function sourceLabel(url: string | null | undefined): string {
  if (!url) return "원문";
  try {
    const host = new URL(url).hostname.toLowerCase();
    if (host.includes("daangn")) return "당근";
    if (host.includes("bunjang")) return "번개장터";
    if (host.includes("naver")) return "네이버";
    return "원문";
  } catch {
    return "원문";
  }
}
