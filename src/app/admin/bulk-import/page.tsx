"use client";

import { useState } from "react";

type ParsedRow = {
  rawText: string;
  sourceUrl?: string;
  askingPriceKrw?: number;
  partCandidates: string[];
};

export default function BulkImportPage() {
  const [input, setInput] = useState("");
  const [parsed, setParsed] = useState<ParsedRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function parseListings() {
    try {
      setLoading(true);
      setMessage(null);
      const res = await fetch("/api/admin/parse-listings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rawText: input }),
      });
      const data = (await res.json()) as { ok: boolean; items?: ParsedRow[]; message?: string };
      if (!res.ok || !data.ok || !data.items) {
        setMessage(data.message ?? "파싱에 실패했습니다.");
        return;
      }
      setParsed(data.items);
      setMessage(`파싱 완료: ${data.items.length}개`);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "파싱 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  }

  async function saveListings() {
    try {
      setLoading(true);
      setMessage(null);
      const res = await fetch("/api/admin/save-listings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: parsed }),
      });
      const data = (await res.json()) as { ok: boolean; inserted?: number; message?: string };
      if (!res.ok || !data.ok) {
        setMessage(data.message ?? "저장에 실패했습니다.");
        return;
      }
      setMessage(`저장 완료: ${data.inserted ?? 0}건`);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "저장 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto max-w-5xl p-6">
      <h1 className="text-2xl font-semibold">관리자 대량 등록</h1>
      <p className="mt-2 text-sm text-zinc-600">
        줄바꿈 기준으로 텍스트를 붙여넣고 파싱한 뒤 저장합니다.
      </p>

      <textarea
        className="mt-4 h-56 w-full rounded-md border border-zinc-300 p-3 text-sm"
        placeholder="예) RTX 4070 50만원 / i5-13600K 30만원 ..."
        value={input}
        onChange={(e) => setInput(e.target.value)}
      />

      <div className="mt-3 flex gap-2">
        <button
          type="button"
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm text-white disabled:opacity-60"
          onClick={parseListings}
          disabled={loading || input.trim().length === 0}
        >
          파싱
        </button>
        <button
          type="button"
          className="rounded-md border border-zinc-300 px-4 py-2 text-sm text-zinc-700 disabled:opacity-60"
          onClick={saveListings}
          disabled={loading || parsed.length === 0}
        >
          저장
        </button>
      </div>

      {message ? <p className="mt-3 text-sm text-zinc-700">{message}</p> : null}

      <ul className="mt-6 grid gap-2">
        {parsed.map((row, idx) => (
          <li key={`${row.rawText}-${idx}`} className="rounded-md border border-zinc-200 p-3 text-sm">
            <p className="font-medium">{row.rawText}</p>
            {row.askingPriceKrw ? <p className="text-zinc-600">가격: {row.askingPriceKrw.toLocaleString("ko-KR")}원</p> : null}
            <p className="text-zinc-600">후보: {row.partCandidates.join(", ") || "없음"}</p>
          </li>
        ))}
      </ul>
    </main>
  );
}
