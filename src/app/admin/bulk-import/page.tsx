"use client";

import { useState } from "react";

type ParsedPart = { name: string; category: string };
type ParsedRow = {
  rawText: string;
  title?: string;
  sourceUrl?: string;
  askingPriceKrw?: number;
  parts?: ParsedPart[];
  partCandidates: string[];
};

const PLACEHOLDER = `[가성비 게이밍 PC] 라이젠 5600X / RTX 3070 Ti 정리
디지털기기 · 3일 전
830,000원
CPU: AMD 라이젠 5 5600X
VGA: 갤럭시 RTX 3070 Ti
RAM: DDR4 16GB (8GB x 2)
SSD: NVMe 512GB
https://www.daangn.com/articles/example

---

RTX 4060 단품 팔아요
340,000원
https://www.daangn.com/articles/example2`;

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
        credentials: "include",
        body: JSON.stringify({ rawText: input }),
      });
      const data = (await res.json()) as { ok: boolean; items?: ParsedRow[]; message?: string };
      if (!res.ok || !data.ok || !data.items) {
        setMessage(data.message ?? "파싱에 실패했습니다.");
        return;
      }
      setParsed(data.items);
      setMessage(`파싱 완료: ${data.items.length}개 매물`);
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
        credentials: "include",
        body: JSON.stringify({ items: parsed }),
      });
      const data = (await res.json()) as {
        ok: boolean;
        inserted?: number;
        rejected?: number;
        message?: string;
      };
      if (!res.ok || !data.ok) {
        setMessage(data.message ?? "저장에 실패했습니다.");
        return;
      }
      setMessage(`저장 완료: ${data.inserted ?? 0}건 (걸러짐 ${data.rejected ?? 0}건)`);
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
        당근 글을 그대로 붙여넣으세요. 매물 사이는 <code>---</code> 로 나누면 됩니다. JSON은 넣지 마세요.
      </p>

      <textarea
        className="mt-4 h-72 w-full rounded-md border border-zinc-300 p-3 text-sm"
        placeholder={PLACEHOLDER}
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
          <li key={`${row.title ?? row.rawText}-${idx}`} className="rounded-md border border-zinc-200 p-3 text-sm">
            <p className="font-medium">{row.title ?? row.rawText.slice(0, 80)}</p>
            {row.askingPriceKrw ? <p className="text-zinc-600">가격: {row.askingPriceKrw.toLocaleString("ko-KR")}원</p> : null}
            {row.sourceUrl ? <p className="truncate text-zinc-500">{row.sourceUrl}</p> : null}
            <p className="text-zinc-600">
              스펙: {row.parts?.map((part) => `${part.category} ${part.name}`).join(" / ") || "없음"}
            </p>
          </li>
        ))}
      </ul>
    </main>
  );
}
