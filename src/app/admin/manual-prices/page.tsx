"use client";

import { useState } from "react";

type FilteredRow = { line: number; raw: string; reason: string };
type PreviewRow = { name: string; category: string; price: number; line: number };

type ApiResult = {
  ok: boolean;
  applied?: boolean;
  validCount?: number;
  saved?: number;
  filteredCount?: number;
  rows?: PreviewRow[];
  filtered?: FilteredRow[];
  message?: string;
};

const PLACEHOLDER = `당근/번개 글을 그대로 붙여넣으세요. 한 줄이거나 제목/가격/URL이 나늀 있어도 됩니다.

삼성 DDR4 8GB 5만원 https://www.daangn.com/...
삼성 SSD 980 500GB
15만원
https://www.daangn.com/...`;

export default function ManualPricesPage() {
  const adminToken = process.env.NEXT_PUBLIC_ADMIN_API_TOKEN ?? "";
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [result, setResult] = useState<ApiResult | null>(null);

  async function call(apply: boolean) {
    setLoading(true);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/manual-prices", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-admin-token": adminToken },
        body: JSON.stringify({ text, apply }),
      });
      const raw = await res.text();
      let data: ApiResult;
      try {
        data = JSON.parse(raw) as ApiResult;
      } catch {
        setResult(null);
        setMessage(
          `서버가 JSON 대신 오류 문구를 보냈습니다. (${res.status}) ${raw.slice(0, 160)}`,
        );
        return;
      }
      if (!res.ok || !data.ok) {
        setMessage(data.message ?? "실패했습니다.");
        setResult(data.filtered ? data : null);
        return;
      }
      setResult(data);
      setMessage(
        apply
          ? `저장 완료: ${data.saved ?? 0}건 (걸러짐 ${data.filteredCount ?? 0}건)`
          : `미리보기: 저장 가능 ${data.validCount ?? 0}건 / 걸러짐 ${data.filteredCount ?? 0}건`,
      );
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  }

  const krw = (n: number) => `₩${n.toLocaleString("ko-KR")}`;

  return (
    <main className="mx-auto max-w-4xl px-4 py-8">
      <h1 className="text-xl font-semibold text-zinc-900">부품 중고가 대량 입력</h1>
      <p className="mt-1 text-sm text-zinc-600">
        붙여넣기 → 미리보기 → 저장. 단품 시세에만 듣갑니다.
      </p>

      <textarea
        className="mt-4 h-72 w-full rounded-lg border border-zinc-300 p-3 font-mono text-sm outline-none focus:border-zinc-500"
        placeholder={PLACEHOLDER}
        value={text}
        onChange={(e) => setText(e.target.value)}
      />

      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={() => call(false)}
          disabled={loading || text.trim().length === 0}
          className="rounded-lg border border-zinc-300 px-4 py-2 text-sm text-zinc-700 disabled:opacity-50"
        >
          {loading ? "처리 중..." : "미리보기"}
        </button>
        <button
          type="button"
          onClick={() => call(true)}
          disabled={loading || text.trim().length === 0}
          className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          저장
        </button>
      </div>

      {message ? (
        <p className="mt-3 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-800">
          {message}
        </p>
      ) : null}

      {result?.filtered && result.filtered.length > 0 ? (
        <div className="mt-4">
          <p className="text-sm font-medium text-amber-800">걸러진 줄 ({result.filteredCount}건)</p>
          <ul className="mt-1 space-y-1 text-xs text-amber-700">
            {result.filtered.map((f) => (
              <li key={f.line}>
                {f.line}행: {f.reason} — <span className="text-zinc-500">{f.raw.slice(0, 60)}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {result?.rows && result.rows.length > 0 ? (
        <div className="mt-4 overflow-x-auto">
          <p className="mb-1 text-sm font-medium text-zinc-700">
            {result.applied ? "저장된" : "저장 예정"} 부품
          </p>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-200 text-left text-xs text-zinc-500">
                <th className="py-1 pr-4">부품명</th>
                <th className="py-1 pr-4">카테고리</th>
                <th className="py-1">중고가</th>
              </tr>
            </thead>
            <tbody>
              {result.rows.map((r) => (
                <tr key={`${r.line}-${r.name}`} className="border-b border-zinc-100">
                  <td className="py-1 pr-4">{r.name}</td>
                  <td className="py-1 pr-4 text-zinc-600">{r.category}</td>
                  <td className="py-1 font-medium">{krw(r.price)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </main>
  );
}
