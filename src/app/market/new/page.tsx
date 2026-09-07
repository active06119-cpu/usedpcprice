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
  if (!finalResult) throw new Error("분석 결과를 받지 못했습니다.");
  return finalResult;
}

function parsePriceInput(raw: string): number | null {
  const numericPrice = Number(raw.replace(/,/g, "").trim());
  return Number.isFinite(numericPrice) && numericPrice > 0 ? numericPrice : null;
}

export default function NewMarketListingPage() {
  const [sourceUrl, setSourceUrl] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priceKrw, setPriceKrw] = useState("");
  const [location, setLocation] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const [registering, setRegistering] = useState(false);
  const [message, setMessage] = useState("");
  const [analysis, setAnalysis] = useState<AnalyzeResult | null>(null);
  const [analyzedPrice, setAnalyzedPrice] = useState<number | null>(null);
  const [agreedToTerms, setAgreedToTerms] = useState(false);

  function validateForm(): number | null {
    if (!sourceUrl.trim() || !title.trim() || !description.trim() || !priceKrw.trim()) {
      setMessage("원문 URL, 제목, 본문, 가격을 입력해주세요.");
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
    try {
      const result = await readAnalyzeStream(`${title.trim()}\n${description.trim()}\n${numericPrice}원`);
      setAnalysis(result);
      setAnalyzedPrice(numericPrice);
      setMessage("분석이 완료되었습니다. 결과를 확인한 뒤 등록해주세요.");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "분석 중 오류가 발생했습니다.");
    } finally {
      setAnalyzing(false);
    }
  }

  async function onRegister() {
    if (!agreedToTerms) {
      setMessage("이용약관 및 개인정보처리방침에 동의해주세요.");
      return;
    }
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
      const createRes = await fetch("/api/market/listings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim(),
          priceKrw: numericPrice,
          condition: "GOOD",
          location: location.trim() || null,
          sourceUrl: sourceUrl.trim(),
          verdict: analysis.verdict,
          isFairVerified: analysis.verdict === "FAIR" || analysis.verdict === "CHEAP",
          fairPriceMid: analysis.totalFairMid,
        }),
      });
      const createData = (await createRes.json()) as { ok?: boolean; message?: string };
      if (!createRes.ok || !createData.ok) throw new Error(createData.message ?? "등록 실패");
      setMessage("매물이 등록되었습니다.");
      setSourceUrl("");
      setTitle("");
      setDescription("");
      setPriceKrw("");
      setLocation("");
      setAnalysis(null);
      setAnalyzedPrice(null);
      setAgreedToTerms(false);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "등록 중 오류가 발생했습니다.");
    } finally {
      setRegistering(false);
    }
  }

  const isFairVerified = analysis?.verdict === "FAIR" || analysis?.verdict === "CHEAP";

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <div className="mb-6 flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-900">원문 매물 올리기</h1>
          <p className="mt-2 text-sm text-zinc-600">
            당근·번개 링크와 글을 넣으면 시세를 붙여 보여 줍니다. 거래는 원문 사이트에서 합니다.
          </p>
        </div>
        <Link href="/market" className="text-sm text-zinc-600 underline hover:text-zinc-900">
          목록으로
        </Link>
      </div>

      <section className="space-y-4 rounded-2xl border border-zinc-200 bg-white p-5">
        <div>
          <label className="text-sm font-medium text-zinc-700">원문 URL</label>
          <input
            value={sourceUrl}
            onChange={(e) => setSourceUrl(e.target.value)}
            placeholder="https://www.daangn.com/... 또는 https://www.bunjang.co.kr/..."
            className="mt-1 w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200"
          />
        </div>
        <div>
          <label className="text-sm font-medium text-zinc-700">제목</label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="mt-1 w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200"
          />
        </div>
        <div>
          <label className="text-sm font-medium text-zinc-700">판매가 (원)</label>
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
            className="mt-1 w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200"
          />
        </div>
        <div>
          <label className="text-sm font-medium text-zinc-700">매물 본문</label>
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
            placeholder="원문 글을 그대로 붙여넣으세요."
            className="mt-1 w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200"
          />
        </div>
        <div>
          <label className="text-sm font-medium text-zinc-700">지역 (선택)</label>
          <input
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            className="mt-1 w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200"
          />
        </div>
        <div className="flex justify-end">
          <button
            type="button"
            onClick={onAnalyze}
            disabled={analyzing || registering}
            className="rounded-xl bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {analyzing ? "분석 중..." : "시세 분석"}
          </button>
        </div>

        {analysis ? (
          <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-4 text-sm text-zinc-700">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-medium ${VERDICT_STYLE[analysis.verdict] ?? VERDICT_STYLE.NO_PRICE}`}>
                {analysis.verdictKo}
              </span>
              {isFairVerified ? (
                <span className="inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">
                  적정가
                </span>
              ) : null}
            </div>
            <p className="mt-3">{analysis.verdictReason}</p>
            <label className="mt-4 flex cursor-pointer items-start gap-2 text-sm">
              <input type="checkbox" checked={agreedToTerms} onChange={(e) => setAgreedToTerms(e.target.checked)} className="mt-0.5" />
              <span>
                <Link href="/terms" className="underline">이용약관</Link>
                {" 및 "}
                <Link href="/privacy" className="underline">개인정보처리방침</Link>
                에 동의합니다
              </span>
            </label>
            <div className="mt-3 flex justify-end">
              <button
                type="button"
                onClick={onRegister}
                disabled={registering || !agreedToTerms}
                className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                {registering ? "등록 중..." : "장터에 올리기"}
              </button>
            </div>
          </div>
        ) : null}

        {message ? <p className="text-sm text-zinc-700">{message}</p> : null}
        <p className="text-xs text-zinc-400">이 사이트는 대금을 보관하지 않습니다. 거래는 원문 매물 페이지에서 진행하세요.</p>
      </section>
    </main>
  );
}
