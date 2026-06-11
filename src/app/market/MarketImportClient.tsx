"use client";

import { useState } from "react";

type ImportResponse = {
  ok: boolean;
  skipped?: boolean;
  message?: string;
  inserted?: number;
  listedAt?: string | null;
  saleStatus?: string;
};

export function MarketImportClient() {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ImportResponse | null>(null);

  async function onSubmit() {
    if (!url.trim()) return;
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch("/api/market/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim() }),
      });
      const data = (await res.json()) as ImportResponse;
      setResult(data);
    } catch {
      setResult({ ok: false, message: "요청 처리 중 오류가 발생했습니다." });
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="mt-6 rounded-2xl border border-zinc-200 bg-white p-5">
      <label className="text-sm font-medium text-zinc-700" htmlFor="market-url">
        매물 URL
      </label>
      <div className="mt-2 flex gap-2">
        <input
          id="market-url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://..."
          className="flex-1 rounded-xl border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200"
        />
        <button
          type="button"
          onClick={onSubmit}
          disabled={loading}
          className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
        >
          {loading ? "처리 중..." : "크롤링+파싱+저장"}
        </button>
      </div>

      {result ? (
        <div
          className={`mt-4 rounded-xl border px-4 py-3 text-sm ${
            result.ok ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-red-200 bg-red-50 text-red-700"
          }`}
        >
          {result.ok ? (
            <div className="space-y-1">
              <p>{result.skipped ? "중복 URL로 스킵되었습니다." : `${result.inserted ?? 0}개 부품이 저장되었습니다.`}</p>
              <p className="text-xs">
                판매상태: {result.saleStatus ?? "UNKNOWN"} / 등록일:{" "}
                {result.listedAt ? new Date(result.listedAt).toLocaleString("ko-KR") : "알수없음"}
              </p>
            </div>
          ) : (
            <p>{result.message ?? "실패했습니다."}</p>
          )}
        </div>
      ) : null}
    </section>
  );
}
