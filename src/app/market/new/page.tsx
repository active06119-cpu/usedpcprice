"use client";

import Link from "next/link";
import { useState } from "react";

import type { AnalyzeResult } from "@/app/api/analyze/route";

const VERDICT_STYLE: Record<string, string> = {
  CHEAP: "bg-blue-50 border-blue-200 text-blue-800",
  FAIR: "bg-green-50 border-green-200 text-green-800",
  OVERPRICED: "bg-yellow-50 border-yellow-200 text-yellow-800",
  WAY_OVERPRICED: "bg-red-50 border-red-200 text-red-800",
  NO_PRICE: "bg-gray-50 border-gray-200 text-gray-600",
};

const krw = (n: number | null | undefined) =>
  typeof n === "number" && Number.isFinite(n) ? `₩${n.toLocaleString("ko-KR")}` : "—";

type StreamEvent = {
  pct?: number;
  step?: string;
  message?: string;
  error?: string;
  result?: AnalyzeResult;
};

async function readAnalyzeStream(text: string): Promise<AnalyzeResult> {
  const res = await fetch("/api/analyze", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, mode: "used" }),
  });

  if (!res.body) {
    throw new Error("스트리밍 응답을 받지 못했습니다.");
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let finalResult: AnalyzeResult | null = null;

  const handleLine = (line: string) => {
    if (!line.trim()) return;
    const data = JSON.parse(line) as StreamEvent;
    if (data.error) throw new Error(data.error);
    if (data.result) finalResult = data.result;
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) handleLine(line);
  }

  if (buffer.trim()) handleLine(buffer);

  if (!finalResult) {
    throw new Error("분석 결과를 받지 못했습니다.");
  }

  return finalResult;
}

function parsePriceInput(raw: string): number | null {
  const numericPrice = Number(raw.replace(/,/g, "").trim());
  return Number.isFinite(numericPrice) && numericPrice > 0 ? numericPrice : null;
}

function buildAnalyzeText(title: string, description: string, priceKrw: number): string {
  return `${title.trim()}\n${description.trim()}\n${priceKrw.toLocaleString("ko-KR")}원\n${priceKrw}원`;
}

export default function NewMarketListingPage() {
  const [sourceUrl, setSourceUrl] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priceKrw, setPriceKrw] = useState("");
  const [location, setLocation] = useState("");
  const [contact, setContact] = useState("");

  const [analyzing, setAnalyzing] = useState(false);
  const [registering, setRegistering] = useState(false);
  const [streamMessage, setStreamMessage] = useState("");
  const [message, setMessage] = useState("");
  const [analysis, setAnalysis] = useState<AnalyzeResult | null>(null);
  const [analyzedPrice, setAnalyzedPrice] = useState<number | null>(null);

  function validateForm(): number | null {
    if (!sourceUrl.trim() || !title.trim() || !description.trim() || !priceKrw.trim() || !contact.trim()) {
      setMessage("필수 항목을 모두 입력해주세요.");
      return null;
    }

    try {
      const url = new URL(sourceUrl.trim());
      if (!["http:", "https:"].includes(url.protocol)) {
        setMessage("원본 URL은 http 또는 https로 시작해야 합니다.");
        return null;
      }
    } catch {
      setMessage("원본 URL 형식이 올바르지 않습니다.");
      return null;
    }

    const numericPrice = parsePriceInput(priceKrw);
    if (!numericPrice) {
      setMessage("판매가를 올바른 숫자로 입력해주세요.");
      return null;
    }

    return numericPrice;
  }

  async function onAnalyze() {
    const numericPrice = validateForm();
    if (!numericPrice) return;

    setAnalyzing(true);
    setMessage("");
    setAnalysis(null);
    setAnalyzedPrice(null);
    setStreamMessage("분석 준비 중...");

    try {
      const result = await readAnalyzeStream(buildAnalyzeText(title, description, numericPrice));
      setAnalysis(result);
      setAnalyzedPrice(numericPrice);
      setMessage("분석이 완료되었습니다. 결과를 확인한 뒤 등록해주세요.");
    } catch (e) {
      const err = e as Error;
      setMessage(err.message || "분석 중 오류가 발생했습니다.");
    } finally {
      setAnalyzing(false);
      setStreamMessage("");
    }
  }

  async function onRegister() {
    if (!analysis || analyzedPrice === null) {
      setMessage("먼저 분석을 실행해주세요.");
      return;
    }

    const numericPrice = validateForm();
    if (!numericPrice) return;

    if (numericPrice !== analyzedPrice) {
      setMessage("판매가가 변경되었습니다. 다시 분석해주세요.");
      setAnalysis(null);
      setAnalyzedPrice(null);
      return;
    }

    setRegistering(true);
    setMessage("");

    try {
      const isFairVerified = analysis.verdict === "FAIR" || analysis.verdict === "CHEAP";

      const createRes = await fetch("/api/market/listings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim(),
          priceKrw: numericPrice,
          condition: "GOOD",
          location: location.trim() || null,
          contact: contact.trim(),
          sourceUrl: sourceUrl.trim(),
          verdict: analysis.verdict,
          isFairVerified,
          fairPriceMid: analysis.totalFairMid,
        }),
      });

      const raw = await createRes.text();
      let createData: { ok?: boolean; message?: string };
      try {
        createData = JSON.parse(raw) as { ok?: boolean; message?: string };
      } catch {
        throw new Error("등록 응답을 해석하지 못했습니다.");
      }
      if (!createRes.ok || !createData.ok) {
        throw new Error(createData.message ?? "등록 실패");
      }

      setMessage("매물이 등록되었습니다.");
      setSourceUrl("");
      setTitle("");
      setDescription("");
      setPriceKrw("");
      setLocation("");
      setContact("");
      setAnalysis(null);
      setAnalyzedPrice(null);
    } catch (e) {
      const err = e as Error;
      setMessage(err.message || "등록 중 오류가 발생했습니다.");
    } finally {
      setRegistering(false);
    }
  }

  const isFairVerified =
    analysis?.verdict === "FAIR" || analysis?.verdict === "CHEAP";

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <div className="mb-6 flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-900">매물 올리기</h1>
          <p className="mt-2 text-sm text-zinc-600">
            원본 링크와 매물 본문으로 적정가를 분석한 뒤 마켓에 등록합니다.
          </p>
        </div>
        <Link href="/market" className="text-sm text-zinc-600 underline hover:text-zinc-900">
          목록으로
        </Link>
      </div>

      <section className="space-y-4 rounded-2xl border border-zinc-200 bg-white p-5">
        <div>
          <label className="text-sm font-medium text-zinc-700">
            원본 URL <span className="text-red-500">*</span>
          </label>
          <input
            value={sourceUrl}
            onChange={(e) => setSourceUrl(e.target.value)}
            placeholder="당근/번개장터/중고나라 링크"
            className="mt-1 w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200"
          />
        </div>

        <div>
          <label className="text-sm font-medium text-zinc-700">
            제목 <span className="text-red-500">*</span>
          </label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="mt-1 w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200"
          />
        </div>

        <div>
          <label className="text-sm font-medium text-zinc-700">
            판매가 (원) <span className="text-red-500">*</span>
          </label>
          <input
            value={priceKrw}
            onChange={(e) => {
              setPriceKrw(e.target.value);
              if (analysis) {
                setAnalysis(null);
                setAnalyzedPrice(null);
              }
            }}
            inputMode="numeric"
            placeholder="1200000"
            className="mt-1 w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200"
          />
        </div>

        <div>
          <label className="text-sm font-medium text-zinc-700">
            매물 본문 <span className="text-red-500">*</span>
          </label>
          <textarea
            value={description}
            onChange={(e) => {
              setDescription(e.target.value);
              if (analysis) {
                setAnalysis(null);
                setAnalyzedPrice(null);
              }
            }}
            rows={8}
            placeholder="원본 매물 설명을 그대로 붙여넣어주세요."
            className="mt-1 w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200"
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="text-sm font-medium text-zinc-700">지역 (선택)</label>
            <input
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="예: 창원 의창구"
              className="mt-1 w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-zinc-700">
              연락처 <span className="text-red-500">*</span>
            </label>
            <input
              value={contact}
              onChange={(e) => setContact(e.target.value)}
              placeholder="카카오 오픈채팅 링크 또는 전화번호"
              className="mt-1 w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200"
            />
          </div>
        </div>

        <div className="flex flex-wrap justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onAnalyze}
            disabled={analyzing || registering}
            className="rounded-xl bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {analyzing ? "분석 중..." : "분석 + 등록하기"}
          </button>
        </div>

        {analyzing && streamMessage ? (
          <p className="text-sm text-emerald-700">{streamMessage}</p>
        ) : null}

        {analysis ? (
          <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-4 text-sm text-zinc-700">
            <p className="font-medium text-zinc-900">분석 미리보기</p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span
                className={`inline-flex rounded-full border px-3 py-1 text-xs font-medium ${
                  VERDICT_STYLE[analysis.verdict] ?? VERDICT_STYLE.NO_PRICE
                }`}
              >
                {analysis.verdictKo}
              </span>
              {isFairVerified ? (
                <span className="inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">
                  ✓ 적정가 인증 가능
                </span>
              ) : null}
            </div>
            <p className="mt-3">{analysis.verdictReason}</p>
            <div className="mt-3 grid gap-2 sm:grid-cols-3">
              <div className="rounded-lg bg-white px-3 py-2">
                <div className="text-xs text-zinc-500">하한가</div>
                <div className="font-semibold text-zinc-900">{krw(analysis.totalFairLow)}</div>
              </div>
              <div className="rounded-lg bg-white px-3 py-2">
                <div className="text-xs text-zinc-500">적정가</div>
                <div className="font-semibold text-emerald-800">{krw(analysis.totalFairMid)}</div>
              </div>
              <div className="rounded-lg bg-white px-3 py-2">
                <div className="text-xs text-zinc-500">상한가</div>
                <div className="font-semibold text-zinc-900">{krw(analysis.totalFairHigh)}</div>
              </div>
            </div>
            {analysis.warnings.length > 0 ? (
              <ul className="mt-3 space-y-1 text-xs text-amber-800">
                {analysis.warnings.map((warning) => (
                  <li key={warning}>• {warning}</li>
                ))}
              </ul>
            ) : null}
            <div className="mt-4 flex justify-end">
              <button
                type="button"
                onClick={onRegister}
                disabled={registering || analyzing}
                className="rounded-xl border border-emerald-300 bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                {registering ? "등록 중..." : "이 가격으로 등록"}
              </button>
            </div>
          </div>
        ) : null}

        {message ? (
          <p className={`text-sm ${message.includes("완료") || message.includes("등록") ? "text-emerald-700" : "text-zinc-700"}`}>
            {message}
          </p>
        ) : null}
      </section>
    </main>
  );
}
