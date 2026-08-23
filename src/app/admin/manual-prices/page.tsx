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

const PLACEHOLDER = `엑셀에서 복사해서 붙여넣거나, 직접 입력하세요. 한 줄에 부품 하나:

RTX 4070 SUPER	GPU	620000
i5-13600K	CPU	230000
Samsung 980 PRO 1TB	SSD	110000

(탭·콤마 둘 다 인식 / 카테고리는 GPU·CPU·RAM·SSD·HDD·MOTHERBOARD·PSU·CASE·COOLER·MONITOR 또는 그래픽카드·씨피유 등 한글도 가능)`;

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
      const data = (await res.json()) as ApiResult;
      if (!res.ok || !data.ok) {
        setMessage(data.message ?? "실패했습니다.");
        setResult(data.filtered ? data : null);
        return;
      }
      setResult(data);
      setMessage(
        apply
          ? `✅ 저장 완료: ${data.saved ?? 0}건 (걸러짐 ${data.filteredCount ?? 0}건)`
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
        인기 부품의 중고 시세를 직접 넣습니다. 붙여넣기 → 미리보기 → 저장. (MANUAL 소스로 시세에 바로 반영)
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
