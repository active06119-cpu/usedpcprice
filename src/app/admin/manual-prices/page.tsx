"use client";

import { useEffect, useState } from "react";

import { parseManualPriceText } from "@/lib/ingest/manual-price-parser";

type FilteredRow = { line: number; raw: string; reason: string };
type PreviewRow = { name: string; category: string; price: number; line: number };
type DbRow = { id: string; name: string; category: string; price: number; savedAt: string };

type ViewState = {
  applied: boolean;
  validCount: number;
  saved?: number;
  filteredCount: number;
  rows: PreviewRow[];
  filtered: FilteredRow[];
};

const CHUNK = 20;
const krw = (n: number) => `₩${n.toLocaleString("ko-KR")}`;

export default function ManualPricesPage() {
  const adminToken = process.env.NEXT_PUBLIC_ADMIN_API_TOKEN ?? "";
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [result, setResult] = useState<ViewState | null>(null);
  const [todayCount, setTodayCount] = useState<number | null>(null);
  const [totalManual, setTotalManual] = useState<number | null>(null);
  const [dbRows, setDbRows] = useState<DbRow[]>([]);
  const [checkError, setCheckError] = useState<string | null>(null);

  async function checkDb() {
    setChecking(true);
    setCheckError(null);
    try {
      const res = await fetch("/api/admin/manual-prices", {
        headers: { "x-admin-token": adminToken },
        credentials: "include",
      });
      const raw = await res.text();
      const data = JSON.parse(raw) as {
        ok?: boolean;
        todayCount?: number;
        totalManual?: number;
        recent?: DbRow[];
        message?: string;
      };
      if (!res.ok || !data.ok) {
        setCheckError(data.message ?? "DB 확인 실패");
        return;
      }
      setTodayCount(data.todayCount ?? 0);
      setTotalManual(data.totalManual ?? 0);
      setDbRows(data.recent ?? []);
    } catch (e) {
      setCheckError(e instanceof Error ? e.message : "DB 확인 중 오류");
    } finally {
      setChecking(false);
    }
  }

  useEffect(() => {
    void checkDb();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function preview() {
    const parsed = parseManualPriceText(text);
    setResult({
      applied: false,
      validCount: parsed.rows.length,
      filteredCount: parsed.bad.length,
      rows: parsed.rows.slice(0, 200),
      filtered: parsed.bad.slice(0, 100),
    });
    setMessage(`미리보기: 저장 가능 ${parsed.rows.length}건 / 걸러짐 ${parsed.bad.length}건`);
  }

  async function save() {
    const parsed = parseManualPriceText(text);
    setResult({
      applied: false,
      validCount: parsed.rows.length,
      filteredCount: parsed.bad.length,
      rows: parsed.rows.slice(0, 200),
      filtered: parsed.bad.slice(0, 100),
    });
    if (parsed.rows.length === 0) {
      setMessage(`저장할 유효한 줄이 없습니다. (걸러짐 ${parsed.bad.length}건)`);
      return;
    }

    setLoading(true);
    setMessage(null);
    let saved = 0;
    try {
      for (let i = 0; i < parsed.rows.length; i += CHUNK) {
        const chunk = parsed.rows.slice(i, i + CHUNK);
        setMessage(`저장 중... ${Math.min(i + chunk.length, parsed.rows.length)}/${parsed.rows.length}`);
        const res = await fetch("/api/admin/manual-prices", {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-admin-token": adminToken },
          credentials: "include",
          body: JSON.stringify({ apply: true, rows: chunk }),
        });
        const raw = await res.text();
        let data: { ok?: boolean; saved?: number; message?: string };
        try {
          data = JSON.parse(raw);
        } catch {
          setMessage(`서버 저장이 글자 응답만 줬습니다. (${res.status}) ${raw.slice(0, 180)}`);
          return;
        }
        if (!res.ok || !data.ok) {
          setMessage(data.message ?? `저장 실패 (${i + 1}번째 묶음)`);
          return;
        }
        saved += data.saved ?? chunk.length;
      }
      setMessage(`저장 완료: ${saved}건 (걸러짐 ${parsed.bad.length}건)`);
      setResult((prev) => (prev ? { ...prev, applied: true, saved } : prev));
      await checkDb();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "저장 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto max-w-4xl px-4 py-8">
      <h1 className="text-xl font-semibold text-zinc-900">부품 중고가 대량 입력</h1>
      <p className="mt-1 text-sm text-zinc-600">미리보기 후 저장. 실제 DB 값은 아래 확인 칸에 뜨니다.</p>

      <textarea
        className="mt-4 h-64 w-full rounded-lg border border-zinc-300 p-3 font-mono text-sm outline-none focus:border-zinc-500"
        placeholder={"RTX 5060 570,000원 https://www.bunjang.co.kr/products/429640263"}
        value={text}
        onChange={(e) => setText(e.target.value)}
      />

      <div className="mt-3 flex gap-2">
        <button type="button" onClick={preview} disabled={text.trim().length === 0} className="rounded-lg border border-zinc-300 px-4 py-2 text-sm text-zinc-700 disabled:opacity-50">
          미리보기
        </button>
        <button type="button" onClick={save} disabled={loading || text.trim().length === 0} className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
          {loading ? "저장 중..." : "저장"}
        </button>
      </div>

      {message ? <p className="mt-3 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-800">{message}</p> : null}

      <section className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-semibold text-emerald-900">지금 DB에 있는 값</p>
          <button type="button" onClick={checkDb} disabled={checking} className="rounded-lg border border-emerald-300 bg-white px-3 py-1.5 text-xs text-emerald-800 disabled:opacity-50">
            {checking ? "읽는 중..." : "다시 확인"}
          </button>
        </div>
        <p className="mt-1 text-xs text-emerald-800">오늘 {todayCount ?? "—"}건 · 전체 MANUAL {totalManual ?? "—"}건</p>
        {checkError ? <p className="mt-2 text-xs text-red-600">{checkError}</p> : null}
        {dbRows.length === 0 && !checking && !checkError ? (
          <p className="mt-3 text-xs text-emerald-800">아직 MANUAL 시세가 없습니다.</p>
        ) : (
          <ul className="mt-3 space-y-1 text-xs text-zinc-800">
            {dbRows.map((row) => (
              <li key={row.id} className="flex flex-wrap justify-between gap-2 border-b border-emerald-100 py-1">
                <span>{row.name} <span className="text-zinc-500">{row.category}</span></span>
                <span className="tabular-nums">{krw(row.price)} · {new Date(row.savedAt).toLocaleString("ko-KR")}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {result?.filtered && result.filtered.length > 0 ? (
        <div className="mt-4">
          <p className="text-sm font-medium text-amber-800">걸러진 줄 ({result.filteredCount}건)</p>
          <ul className="mt-1 space-y-1 text-xs text-amber-700">
            {result.filtered.map((f) => (
              <li key={`${f.line}-${f.raw}`}>
                {f.line}행: {f.reason} — <span className="text-zinc-500">{f.raw.slice(0, 80)}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {result?.rows && result.rows.length > 0 ? (
        <div className="mt-4 overflow-x-auto">
          <p className="mb-1 text-sm font-medium text-zinc-700">{result.applied ? "저장 요청된" : "저장 예정"} 부품</p>
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
                <tr key={`${r.line}-${r.name}-${r.price}`} className="border-b border-zinc-100">
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
