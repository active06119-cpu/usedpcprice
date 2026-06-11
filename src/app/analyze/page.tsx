"use client";

import { useMemo, useState } from "react";

import type { AnalyzeResult } from "@/app/api/analyze/route";

type UrlPreviewPart = {
  category: "CPU" | "GPU" | "RAM" | "SSD" | "HDD" | "MAINBOARD" | "PSU" | "CASE" | "ETC";
  name: string;
  price: number | null;
  condition: "새상품" | "사용감적음" | "사용감있음" | "알수없음";
};

type UrlPreview = {
  sourceUrl: string;
  title: string;
  description: string;
  rawText: string;
  source: string;
  totalPrice: number | null;
  soldStatus: "ACTIVE" | "SOLD" | "RESERVED" | "UNKNOWN";
  registeredAt: string | null;
  parts: UrlPreviewPart[];
};

type StreamEvent = {
  pct?: number;
  step?: string;
  message?: string;
  error?: string;
  result?: AnalyzeResult;
};

const STEP_LABELS: Record<string, string> = {
  extract: "부품 추출",
  db: "DB 시세 조회",
  calc: "적정가 계산",
  validate: "가격 검증",
  done: "완료",
};

const krw = (n: number | null) => (typeof n === "number" ? `₩${n.toLocaleString("ko-KR")}` : "—");

async function readAnalyzeStream(
  text: string,
  mode: "used" | "new",
  onEvent: (event: StreamEvent) => void,
): Promise<AnalyzeResult> {
  const res = await fetch("/api/analyze", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, mode }),
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
    onEvent(data);
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

export default function AnalyzePage() {
  const [url, setUrl] = useState("");
  const [text, setText] = useState("");
  const [priceMode, setPriceMode] = useState<"used" | "new">("used");
  const [loading, setLoading] = useState(false);
  const [textLoading, setTextLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [textError, setTextError] = useState("");
  const [preview, setPreview] = useState<UrlPreview | null>(null);
  const [streamPct, setStreamPct] = useState(0);
  const [streamStep, setStreamStep] = useState("");
  const [streamMessage, setStreamMessage] = useState("");
  const [textResult, setTextResult] = useState<AnalyzeResult | null>(null);

  const totalFairMid = useMemo(
    () => preview?.parts.reduce((sum, part) => sum + (part.price ?? 0), 0) ?? 0,
    [preview],
  );

  const verdict = useMemo(() => {
    if (!preview) return "—";
    const asking = preview.totalPrice;
    if (!asking || totalFairMid <= 0) return "적정가";
    const ratio = asking / totalFairMid;
    if (ratio <= 1.05) return "적정가";
    if (ratio <= 1.2) return "약간비쌈";
    return "많이비쌈";
  }, [preview, totalFairMid]);

  async function analyzeText() {
    if (!text.trim()) return;
    setTextLoading(true);
    setTextError("");
    setTextResult(null);
    setStreamPct(0);
    setStreamStep("");
    setStreamMessage("");

    try {
      const result = await readAnalyzeStream(text.trim(), priceMode, (event) => {
        if (typeof event.pct === "number") setStreamPct(event.pct);
        if (event.step) setStreamStep(event.step);
        if (event.message) setStreamMessage(event.message);
      });
      setTextResult(result);
    } catch (e) {
      const err = e as Error;
      if (err.message.includes("인식된 부품이 없습니다")) {
        setTextError("인식된 부품이 없습니다. 부품명과 가격을 포함해 입력해주세요.");
      } else if (err.message.includes("부품 추출 실패")) {
        setTextError("매물 본문을 더 자세히 입력해주세요.");
      } else {
        setTextError(err.message || "분석에 실패했습니다.");
      }
    } finally {
      setTextLoading(false);
    }
  }

  async function analyzeUrl() {
    if (!url.trim()) return;
    setLoading(true);
    setMessage("");
    setPreview(null);
    try {
      const res = await fetch("/api/admin/url-analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? "URL 분석 실패");
      if (data.skipped) {
        setMessage(data.message ?? "이미 등록된 URL입니다.");
        return;
      }
      setPreview(data.preview as UrlPreview);
      setMessage("분석 완료");
    } catch (e) {
      const err = e as Error;
      setMessage(err.message || "URL 분석에 실패했습니다.");
    } finally {
      setLoading(false);
    }
  }

  async function saveToDb() {
    if (!preview) return;
    setSaving(true);
    setMessage("");
    try {
      const res = await fetch("/api/admin/url-save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(preview),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? "DB 저장 실패");
      if (data.skipped) {
        setMessage(data.message ?? "이미 등록된 URL입니다.");
      } else {
        setMessage(`${data.inserted ?? 0}개 부품 저장 완료`);
      }
    } catch (e) {
      const err = e as Error;
      setMessage(err.message || "DB 저장에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <h1 className="text-2xl font-semibold text-zinc-900">매물 분석</h1>
      <p className="mt-2 text-sm text-zinc-600">
        매물 텍스트 또는 URL을 입력하면 부품별 가격을 분석합니다.
      </p>

      <section className="mt-6 rounded-2xl border border-zinc-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-zinc-800">텍스트 분석</h2>
        <div className="mt-3 flex rounded-xl border border-zinc-200 bg-zinc-50 p-1">
          <button
            type="button"
            onClick={() => setPriceMode("used")}
            className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium ${
              priceMode === "used" ? "bg-zinc-900 text-white" : "text-zinc-600"
            }`}
          >
            중고
          </button>
          <button
            type="button"
            onClick={() => setPriceMode("new")}
            className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium ${
              priceMode === "new" ? "bg-zinc-900 text-white" : "text-zinc-600"
            }`}
          >
            신품
          </button>
        </div>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          disabled={textLoading}
          placeholder="매물 본문을 붙여넣으세요. 예) RTX 4070 / i5-13600K / DDR5 32GB / 130만원"
          className="mt-3 h-40 w-full resize-y rounded-xl border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 disabled:bg-zinc-50"
        />
        <div className="mt-3 flex justify-end">
          <button
            type="button"
            onClick={analyzeText}
            disabled={textLoading || !text.trim()}
            className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {textLoading ? "분석 중..." : "분석하기"}
          </button>
        </div>

        {textLoading ? (
          <div className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50/50 p-4">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium text-emerald-900">
                {STEP_LABELS[streamStep] ?? "분석"} {streamMessage ? `· ${streamMessage}` : ""}
              </span>
              <span className="font-semibold text-emerald-700">{streamPct}%</span>
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-emerald-100">
              <div
                className="h-full rounded-full bg-emerald-500 transition-all duration-300"
                style={{ width: `${streamPct}%` }}
              />
            </div>
            <div className="mt-3 grid grid-cols-4 gap-2 text-[11px] text-zinc-500">
              {(["extract", "db", "calc", "validate"] as const).map((step) => (
                <div
                  key={step}
                  className={`rounded-lg px-2 py-1 text-center ${
                    streamStep === step
                      ? "bg-emerald-100 font-medium text-emerald-800"
                      : streamPct >= (step === "extract" ? 25 : step === "db" ? 60 : step === "calc" ? 85 : 100)
                        ? "text-emerald-700"
                        : "text-zinc-400"
                  }`}
                >
                  {STEP_LABELS[step]}
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {textError ? <p className="mt-3 text-sm text-red-600">{textError}</p> : null}
      </section>

      {textResult && !textLoading ? (
        <section className="mt-6 space-y-4">
          <div className="rounded-2xl border border-zinc-200 bg-white p-4">
            <p className="text-sm font-medium text-zinc-900">{textResult.verdictKo}</p>
            <p className="mt-1 text-xs text-zinc-600">{textResult.verdictReason}</p>
            <p className="mt-3 text-sm text-zinc-700">
              적정가 합산:{" "}
              <span className="font-semibold text-zinc-900">{krw(textResult.totalFairMid)}</span>
              {textResult.askingPrice ? (
                <span className="ml-3 text-zinc-500">
                  요청가 {krw(textResult.askingPrice)}
                </span>
              ) : null}
            </p>
          </div>

          <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white">
            <div className="border-b border-zinc-200 bg-zinc-50 px-4 py-3 text-sm font-medium text-zinc-700">
              부품별 내역
            </div>
            <table className="w-full text-sm">
              <thead className="bg-zinc-50 text-zinc-600">
                <tr>
                  <th className="px-4 py-2 text-left font-medium">부품명</th>
                  <th className="px-4 py-2 text-center font-medium">카테고리</th>
                  <th className="px-4 py-2 text-right font-medium">적정가</th>
                  <th className="px-4 py-2 text-center font-medium">출처</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {textResult.parts.map((part, idx) => (
                  <tr key={`${part.partName}-${idx}`}>
                    <td className="px-4 py-2 text-zinc-800">{part.partName}</td>
                    <td className="px-4 py-2 text-center text-zinc-600">{part.category}</td>
                    <td className="px-4 py-2 text-right font-medium text-zinc-900">
                      {krw(part.usedMid)}
                    </td>
                    <td className="px-4 py-2 text-center text-zinc-600">{part.priceSourceLabel}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {textResult.warnings.length > 0 ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900 space-y-1">
              {textResult.warnings.map((warning) => (
                <p key={warning}>{warning}</p>
              ))}
            </div>
          ) : null}
        </section>
      ) : null}

      <section className="mt-8 rounded-2xl border border-zinc-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-zinc-800">URL 분석</h2>
        <div className="mt-3 flex gap-2">
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://..."
            className="flex-1 rounded-xl border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200"
          />
          <button
            onClick={analyzeUrl}
            disabled={loading}
            className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {loading ? "분석 중..." : "분석"}
          </button>
        </div>
        {message ? <p className="mt-2 text-xs text-zinc-600">{message}</p> : null}
      </section>

      {preview ? (
        <section className="mt-6 space-y-4">
          <div className="rounded-2xl border border-zinc-200 bg-white p-4">
            <p className="text-sm font-medium text-zinc-900">{preview.title}</p>
            <p className="mt-1 text-xs text-zinc-500">
              출처: {preview.source} · 판매상태: {preview.soldStatus} · 등록일:{" "}
              {preview.registeredAt ? new Date(preview.registeredAt).toLocaleString("ko-KR") : "알수없음"}
            </p>
          </div>

          <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white">
            <div className="border-b border-zinc-200 bg-zinc-50 px-4 py-3 text-sm font-medium text-zinc-700">
              URL 분석 결과
            </div>
            <table className="w-full text-sm">
              <thead className="bg-zinc-50 text-zinc-600">
                <tr>
                  <th className="px-4 py-2 text-left font-medium">부품명</th>
                  <th className="px-4 py-2 text-center font-medium">카테고리</th>
                  <th className="px-4 py-2 text-right font-medium">적정가</th>
                  <th className="px-4 py-2 text-center font-medium">상태</th>
                  <th className="px-4 py-2 text-center font-medium">출처</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {preview.parts.map((part, idx) => (
                  <tr key={`${part.name}-${idx}`}>
                    <td className="px-4 py-2 text-zinc-800">{part.name}</td>
                    <td className="px-4 py-2 text-center text-zinc-600">{part.category}</td>
                    <td className="px-4 py-2 text-right font-medium text-zinc-900">{krw(part.price)}</td>
                    <td className="px-4 py-2 text-center text-zinc-600">{part.condition}</td>
                    <td className="px-4 py-2 text-center text-zinc-600">{preview.source}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="rounded-2xl border border-zinc-200 bg-white p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm text-zinc-700">
                총 적정가 합산: <span className="font-semibold text-zinc-900">{krw(totalFairMid)}</span>
              </p>
              <div
                className={`inline-flex rounded-full border px-3 py-1 text-sm font-medium ${
                  verdict === "적정가"
                    ? "border-green-200 bg-green-50 text-green-700"
                    : verdict === "약간비쌈"
                      ? "border-yellow-200 bg-yellow-50 text-yellow-700"
                      : "border-red-200 bg-red-50 text-red-700"
                }`}
              >
                {verdict}
              </div>
            </div>

            <div className="mt-4 flex justify-end">
              <button
                onClick={saveToDb}
                disabled={saving}
                className="rounded-xl bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                {saving ? "저장 중..." : "DB 저장"}
              </button>
            </div>
          </div>
        </section>
      ) : null}
    </main>
  );
}
