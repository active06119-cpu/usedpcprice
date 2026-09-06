"use client";

import { useState } from "react";

type PreviewPart = { name: string; category: string; price: number };
type PreviewListing = { rawText: string; sourceUrl?: string | null; askingPriceKrw?: number | null };
type Rejected = { raw: string; reason: string };

type ApiResult = {
  ok: boolean;
  applied?: boolean;
  partCount?: number;
  listingCount?: number;
  savedParts?: number;
  savedListings?: number;
  rejectedCount?: number;
  parts?: PreviewPart[];
  listings?: PreviewListing[];
  rejected?: Rejected[];
  message?: string;
};

export default function ImportJsonPage() {
  const [fileName, setFileName] = useState("");
  const [payload, setPayload] = useState<unknown>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [result, setResult] = useState<ApiResult | null>(null);

  async function readFile(file: File) {
    const text = await file.text();
    const parsed = JSON.parse(text) as unknown;
    setFileName(file.name);
    setPayload(parsed);
    setResult(null);
    setMessage(`${file.name} 읽음`);
  }

  async function call(apply: boolean) {
    if (payload == null) return;
    setLoading(true);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/import-json", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ payload, apply }),
      });
      const data = (await res.json()) as ApiResult;
      setResult(data);
      if (!res.ok || !data.ok) {
        setMessage(data.message ?? "실패했습니다.");
        return;
      }
      setMessage(
        apply
          ? `저장 완료: 단품 ${data.savedParts ?? 0}건, 매물 ${data.savedListings ?? 0}건 (걸러짐 ${data.rejectedCount ?? 0}건)`
          : `미리보기: 단품 ${data.partCount ?? 0}건 / 완본체 ${data.listingCount ?? 0}건 / 걸러짐 ${data.rejectedCount ?? 0}건`,
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto max-w-4xl px-4 py-8">
      <h1 className="text-xl font-semibold text-zinc-900">JSON 가져오기</h1>
      <p className="mt-1 text-sm text-zinc-600">
        그롭 봇이 내준 <code>parts.json</code> / <code>listings.json</code> 을 올립니다.
        단품은 시세, 완본체는 매물 원문으로 분리 저장됩니다.
      </p>

      <label className="mt-4 flex cursor-pointer flex-col items-center rounded-lg border border-dashed border-zinc-300 bg-white px-4 py-10 text-sm text-zinc-600 hover:border-zinc-400">
        <span>{fileName || "JSON 파일 선택"}</span>
        <input
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (!file) return;
            readFile(file).catch((error) => {
              setMessage(error instanceof Error ? error.message : "JSON을 읽지 못했습니다.");
              setPayload(null);
            });
          }}
        />
      </label>

      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={() => call(false)}
          disabled={loading || payload == null}
          className="rounded-lg border border-zinc-300 px-4 py-2 text-sm text-zinc-700 disabled:opacity-50"
        >
          미리보기
        </button>
        <button
          type="button"
          onClick={() => call(true)}
          disabled={loading || payload == null}
          className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          저장
        </button>
      </div>

      {message ? (
        <p className="mt-3 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-800">{message}</p>
      ) : null}

      {result?.rejected && result.rejected.length > 0 ? (
        <ul className="mt-4 space-y-1 text-xs text-amber-700">
          {result.rejected.map((row, idx) => (
            <li key={`${row.reason}-${idx}`}>
              {row.reason} — {row.raw.slice(0, 80)}
            </li>
          ))}
        </ul>
      ) : null}

      {result?.parts && result.parts.length > 0 ? (
        <div className="mt-6">
          <h2 className="text-sm font-medium text-zinc-800">단품 시세</h2>
          <ul className="mt-2 space-y-1 text-sm text-zinc-700">
            {result.parts.map((row) => (
              <li key={`${row.name}-${row.price}`}>
                {row.name} / {row.category} / ₩{row.price.toLocaleString("ko-KR")}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {result?.listings && result.listings.length > 0 ? (
        <div className="mt-6">
          <h2 className="text-sm font-medium text-zinc-800">완본체 매물</h2>
          <ul className="mt-2 space-y-1 text-sm text-zinc-700">
            {result.listings.map((row, idx) => (
              <li key={`${row.rawText}-${idx}`}>
                {row.rawText.slice(0, 80)}
                {row.askingPriceKrw ? ` / ₩${row.askingPriceKrw.toLocaleString("ko-KR")}` : ""}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </main>
  );
}
