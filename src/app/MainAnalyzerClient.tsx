"use client";

import { useEffect, useMemo, useState } from "react";

import type { AnalyzeResult, AnalyzedPart } from "@/app/api/analyze/route";

const VERDICT_STYLE: Record<string, string> = {
  CHEAP: "bg-blue-50 border-blue-200 text-blue-800",
  FAIR: "bg-green-50 border-green-200 text-green-800",
  OVERPRICED: "bg-yellow-50 border-yellow-200 text-yellow-800",
  WAY_OVERPRICED: "bg-red-50 border-red-200 text-red-800",
  NO_PRICE: "bg-gray-50 border-gray-200 text-gray-600",
};

const VERDICT_KO: Record<string, string> = {
  CHEAP: "저렴해요",
  FAIR: "적정가",
  OVERPRICED: "약간비쌈",
  WAY_OVERPRICED: "많이 비쌈",
  NO_PRICE: "가격 정보 없음",
};

const VERDICT_HINT: Record<string, string> = {
  CHEAP: "시세보다 저렴합니다. 상태 꼭 확인하세요.",
  FAIR: "적정 가격 범위입니다.",
  OVERPRICED: "흥정 여지가 있습니다.",
  WAY_OVERPRICED: "시세보다 많이 높습니다. 다른 매물도 찾아보세요.",
};

const krw = (n: number | null) => (typeof n === "number" ? `₩${n.toLocaleString("ko-KR")}` : "—");

type HomeStats = {
  analysisCount: number;
  partCount: number;
  snapshotCount: number;
};

const EXAMPLES = [
  {
    label: "게이밍 본체",
    text: "RTX 4070 / i5-13600K / DDR5 32GB / SSD 1TB / 165만원",
  },
  {
    label: "가성비 구성",
    text: "RTX 3060 / Ryzen 5600 / DDR4 16GB / SSD 512GB / 82만원",
  },
  {
    label: "고사양 작업용",
    text: "RTX 4080 SUPER / i7-14700K / DDR5 64GB / SSD 2TB / 285만원",
  },
] as const;

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

function AnalyzeStreamProgress({
  streamPct,
  streamStep,
  streamMessage,
}: {
  streamPct: number;
  streamStep: string;
  streamMessage: string;
}) {
  return (
    <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-4">
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
  );
}

type PriceGaugeModel = {
  low: number;
  mid: number;
  high: number;
  asking: number | null;
  lowPct: number;
  midPct: number;
  highPct: number;
  askPct: number | null;
  markerTone: "cheap" | "fair" | "expensive";
};

const GAUGE_ZONE_COLOR = {
  cheap: "#1D9E75",
  fair: "#EF9F27",
  expensive: "#D85A30",
} as const;

const MARKER_TONE_STYLE = {
  cheap: {
    dot: "bg-green-500",
    line: "bg-green-500",
    tag: "border-green-200 bg-green-50 text-green-800",
  },
  fair: {
    dot: "bg-orange-500",
    line: "bg-orange-500",
    tag: "border-orange-200 bg-orange-50 text-orange-800",
  },
  expensive: {
    dot: "bg-red-500",
    line: "bg-red-500",
    tag: "border-red-200 bg-red-50 text-red-800",
  },
} as const;

function buildPriceGaugeModel(result: AnalyzeResult): PriceGaugeModel | null {
  const low = result.totalFairLow;
  const mid = result.totalFairMid;
  const high = result.totalFairHigh;
  if (high <= 0 || mid <= 0 || low <= 0) return null;

  const asking = result.askingPrice ?? null;
  const scaleMin = Math.min(low * 0.85, asking ?? low * 0.85);
  const scaleMax = Math.max(high * 1.15, asking ?? high * 1.15);
  const span = Math.max(scaleMax - scaleMin, 1);

  const toPct = (price: number) =>
    Math.min(100, Math.max(0, ((price - scaleMin) / span) * 100));

  const lowPct = toPct(low);
  const midPct = toPct(mid);
  const highPct = toPct(high);
  const askPct = asking != null ? toPct(asking) : null;

  let markerTone: PriceGaugeModel["markerTone"] = "fair";
  if (asking != null) {
    if (asking <= low) markerTone = "cheap";
    else if (asking > high) markerTone = "expensive";
  }

  return { low, mid, high, asking, lowPct, midPct, highPct, askPct, markerTone };
}

function PriceRangeGauge({
  gauge,
  fairMidLabel,
  sampleSize,
}: {
  gauge: PriceGaugeModel;
  fairMidLabel: string;
  sampleSize: number;
}) {
  const marker = MARKER_TONE_STYLE[gauge.markerTone];
  const ticks = [
    { pct: gauge.lowPct, label: "하한가", price: gauge.low },
    { pct: gauge.midPct, label: fairMidLabel, price: gauge.mid },
    { pct: gauge.highPct, label: "상한가", price: gauge.high },
  ] as const;

  return (
    <div className="mt-4">
      <div className="relative pt-9">
        {gauge.askPct != null && gauge.asking != null ? (
          <div
            className="absolute top-0 z-20 flex -translate-x-1/2 flex-col items-center"
            style={{ left: `${gauge.askPct}%` }}
          >
            <span
              className={`whitespace-nowrap rounded-full border px-2.5 py-0.5 text-[11px] font-semibold shadow-sm ${marker.tag}`}
            >
              요청가 {krw(gauge.asking)}
            </span>
            <div className={`mt-1 h-5 w-px ${marker.line}`} />
          </div>
        ) : null}

        <div className="relative h-3 overflow-hidden rounded-full">
          <div className="absolute inset-0 flex">
            <div
              className="h-full"
              style={{ width: `${gauge.lowPct}%`, backgroundColor: GAUGE_ZONE_COLOR.cheap }}
            />
            <div
              className="h-full"
              style={{
                width: `${Math.max(0, gauge.highPct - gauge.lowPct)}%`,
                backgroundColor: GAUGE_ZONE_COLOR.fair,
              }}
            />
            <div className="h-full flex-1" style={{ backgroundColor: GAUGE_ZONE_COLOR.expensive }} />
          </div>

          {ticks.map((tick) => (
            <div
              key={tick.label}
              className="absolute top-0 bottom-0 z-10 w-px -translate-x-1/2 bg-zinc-700/35"
              style={{ left: `${tick.pct}%` }}
            />
          ))}

          {gauge.askPct != null ? (
            <div
              className={`absolute top-1/2 z-20 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow ${marker.dot}`}
              style={{ left: `${gauge.askPct}%` }}
            />
          ) : null}
        </div>
      </div>

      <div className="relative mt-2 h-11 text-[11px] text-zinc-600">
        {ticks.map((tick) => (
          <div
            key={`${tick.label}-label`}
            className="absolute -translate-x-1/2 text-center"
            style={{ left: `${tick.pct}%` }}
          >
            <div className="font-medium text-zinc-500">{tick.label}</div>
            <div className="mt-0.5 font-semibold text-zinc-800">{krw(tick.price)}</div>
          </div>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-zinc-100 pt-3 text-xs text-zinc-600">
        <div className="flex flex-wrap items-center gap-4">
          <span className="inline-flex items-center gap-1.5">
            <span
              className="h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: GAUGE_ZONE_COLOR.cheap }}
            />
            저렴
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span
              className="h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: GAUGE_ZONE_COLOR.fair }}
            />
            적정
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span
              className="h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: GAUGE_ZONE_COLOR.expensive }}
            />
            비쌈
          </span>
        </div>
        <span className={sampleSize < 5 ? "text-orange-600" : ""}>
          실거래 {sampleSize}건 기준
          {sampleSize < 5 ? " (참고용)" : ""}
        </span>
      </div>
    </div>
  );
}

export function MainAnalyzerClient() {
  const [text, setText] = useState("");
  const [priceMode, setPriceMode] = useState<"used" | "new">("used");
  const [result, setResult] = useState<AnalyzeResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [streamPct, setStreamPct] = useState(0);
  const [streamStep, setStreamStep] = useState("");
  const [streamMessage, setStreamMessage] = useState("");
  const [error, setError] = useState("");
  const [showInputExampleHint, setShowInputExampleHint] = useState(false);
  const [shareLoading, setShareLoading] = useState(false);
  const [toastMessage, setToastMessage] = useState("");
  const [shareUrl, setShareUrl] = useState("");
  const [showPriceReport, setShowPriceReport] = useState(false);
  const [reportMessage, setReportMessage] = useState("");
  const [reportLoading, setReportLoading] = useState(false);
  const [stats, setStats] = useState<HomeStats>({
    analysisCount: 0,
    partCount: 0,
    snapshotCount: 0,
  });
  const [statsLoading, setStatsLoading] = useState(true);

  async function refreshStats() {
    try {
      const res = await fetch("/api/stats", { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as Partial<HomeStats>;
      setStats({
        analysisCount: data.analysisCount ?? 0,
        partCount: data.partCount ?? 0,
        snapshotCount: data.snapshotCount ?? 0,
      });
    } catch {
      // ignore
    }
  }

  useEffect(() => {
    let cancelled = false;
    async function loadStats() {
      try {
        const res = await fetch("/api/stats", { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as Partial<HomeStats>;
        if (!cancelled) {
          setStats({
            analysisCount: data.analysisCount ?? 0,
            partCount: data.partCount ?? 0,
            snapshotCount: data.snapshotCount ?? 0,
          });
          setStatsLoading(false);
        }
      } catch {
        if (!cancelled) setStatsLoading(false);
      }
    }
    void loadStats();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!result) return;
    void refreshStats();
  }, [result]);

  useEffect(() => {
    function onStatsRefresh() {
      void refreshStats();
    }
    function onStorage(e: StorageEvent) {
      if (e.key === "stats:refresh") {
        void refreshStats();
      }
    }
    function onVisibility() {
      if (document.visibilityState === "visible") {
        void refreshStats();
      }
    }
    window.addEventListener("stats:refresh", onStatsRefresh as EventListener);
    window.addEventListener("storage", onStorage);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("stats:refresh", onStatsRefresh as EventListener);
      window.removeEventListener("storage", onStorage);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  useEffect(() => {
    if (/미개봉|신품|새제품/.test(text)) {
      setPriceMode("new");
    }
  }, [text]);

  async function analyze() {
    if (!text.trim()) return;
    setLoading(true);
    setError("");
    setResult(null);
    setShowInputExampleHint(false);
    setStreamPct(0);
    setStreamStep("");
    setStreamMessage("");

    try {
      const data = await readAnalyzeStream(text.trim(), priceMode === "new" ? "new" : "used", (event) => {
        if (typeof event.pct === "number") setStreamPct(event.pct);
        if (event.step) setStreamStep(event.step);
        if (event.message) setStreamMessage(event.message);
      });

      if (!data.parts || data.parts.length === 0) {
        setShowInputExampleHint(true);
        return;
      }

      setResult(data);
      setStreamPct(100);
    } catch (e) {
      const err = e as Error;
      if (err.message.includes("인식된 부품이 없습니다")) {
        setShowInputExampleHint(true);
      } else if (err.message.includes("부품 추출 실패")) {
        setError("매물 본문을 더 자세히 입력해주세요. 부품명과 가격이 포함되면 더 정확해요.");
      } else {
        setError(err.message || "잠시 후 다시 시도해주세요.");
      }
    } finally {
      setLoading(false);
    }
  }

  const priceGauge = useMemo(
    () => (result ? buildPriceGaugeModel(result) : null),
    [result],
  );

  const newModeCoverage = useMemo(() => {
    if (!result || result.analysisMode !== "new") return null;
    const totalParts = result.parts.length;
    const pricedParts = result.parts.filter(
      (part) => part.usedMid !== null && part.usedMid > 0,
    ).length;
    const missingParts = totalParts - pricedParts;
    return {
      totalParts,
      pricedParts,
      showMissingMajorityWarning:
        totalParts > 0 && missingParts / totalParts >= 0.5,
    };
  }, [result]);

  const showAiOnlyDisclaimer = useMemo(() => {
    if (!result) return false;
    const pricedParts = result.parts.filter((part) => part.usedMid != null && part.usedMid > 0);
    if (pricedParts.length === 0) return false;
    const hasRealData = pricedParts.some(
      (part) => part.priceSource === "db" || part.priceSource === "new",
    );
    return !hasRealData;
  }, [result]);

  const showIncompletePcHint = useMemo(() => {
    if (!result) return false;
    if (result.parts.length > 3) return false;
    const categories = new Set(
      result.parts.map((part) => String(part.category).toUpperCase()),
    );
    const hasSystemPart =
      categories.has("MOTHERBOARD") || categories.has("PSU") || categories.has("CASE");
    return !hasSystemPart;
  }, [result]);

  async function reportPrice(
    partName: string,
    reportedPrice: number,
    reason: "too_high" | "too_low",
  ) {
    setReportLoading(true);
    setReportMessage("");
    try {
      const res = await fetch("/api/report-price", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ partName, reportedPrice, reason }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? "신고 실패");
      setReportMessage("신고가 접수됐습니다. 검토 후 반영할게요.");
    } catch (e: unknown) {
      setReportMessage(e instanceof Error ? e.message : "신고 중 오류가 발생했습니다.");
    } finally {
      setReportLoading(false);
    }
  }

  async function shareResult() {
    if (!result) return;
    setShareLoading(true);
    setToastMessage("");
    setShareUrl("");
    try {
      const res = await fetch("/api/results/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ result, sourceText: text }),
      });
      const data = (await res.json()) as { ok?: boolean; id?: string; message?: string };
      if (!res.ok || !data.ok || !data.id) {
        throw new Error(data.message ?? "SAVE_FAILED");
      }

      const nextShareUrl = `${window.location.origin}/results/${data.id}`;
      setShareUrl(nextShareUrl);
      try {
        await navigator.clipboard.writeText(nextShareUrl);
        setToastMessage("링크 복사됨!");
      } catch {
        setToastMessage("링크 생성됨 (아래 링크를 복사하세요)");
      }
      window.setTimeout(() => setToastMessage(""), 2200);
    } catch (e) {
      const err = e as Error;
      setToastMessage(err.message || "공유 링크 생성 실패");
      window.setTimeout(() => setToastMessage(""), 2200);
    } finally {
      setShareLoading(false);
    }
  }

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <section className="rounded-3xl border border-zinc-200 bg-gradient-to-b from-white to-zinc-50 p-7">
        <p className="text-xs font-semibold tracking-wide text-emerald-600">중고 PC 적정가 계산기</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-zinc-900 sm:text-4xl">
          사기 전에 한 번, 팔기 전에 한 번
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-600">
          번개장터·당근·중고나라 매물 본문을 그대로 붙여넣으면 부품 단위로 분해해 시세를 계산합니다.
          요청가가 있으면 저렴/적정/비쌈 판정까지 바로 확인할 수 있어요.
        </p>
        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-zinc-200 bg-white px-4 py-3">
            <p className="text-xs text-zinc-500">분석된 매물 수</p>
            <p className="mt-1 text-xl font-semibold text-zinc-900">
              {statsLoading ? "..." : stats.analysisCount.toLocaleString("ko-KR")}
            </p>
          </div>
          <div className="rounded-xl border border-zinc-200 bg-white px-4 py-3">
            <p className="text-xs text-zinc-500">등록 부품 수</p>
            <p className="mt-1 text-xl font-semibold text-zinc-900">
              {statsLoading ? "..." : stats.partCount.toLocaleString("ko-KR")}
            </p>
          </div>
          <div className="rounded-xl border border-zinc-200 bg-white px-4 py-3">
            <p className="text-xs text-zinc-500">실거래 건수</p>
            <p className="mt-1 text-xl font-semibold text-zinc-900">
              {statsLoading ? "..." : stats.snapshotCount.toLocaleString("ko-KR")}
            </p>
          </div>
        </div>
      </section>

      <section className="mt-6 grid gap-4 lg:grid-cols-[1fr_320px]">
        <div className="space-y-3">
          <div className="flex rounded-xl border border-zinc-200 bg-white p-1">
            <button
              type="button"
              onClick={() => setPriceMode("used")}
              className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium transition ${
                priceMode === "used"
                  ? "bg-zinc-900 text-white"
                  : "text-zinc-600 hover:bg-zinc-50"
              }`}
            >
              🔄 중고 매물 분석
            </button>
            <button
              type="button"
              onClick={() => setPriceMode("new")}
              className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium transition ${
                priceMode === "new"
                  ? "bg-zinc-900 text-white"
                  : "text-zinc-600 hover:bg-zinc-50"
              }`}
            >
              🆕 신품 매물 분석
            </button>
          </div>

          <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
          <textarea
            className="h-72 w-full resize-y border-0 p-5 text-sm font-mono outline-none ring-0 ring-offset-0 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-500/40 disabled:cursor-not-allowed disabled:bg-zinc-50 disabled:text-zinc-400"
            placeholder="매물 글 또는 내 PC 스펙을 붙여넣으세요 여러 개는 --- 로 구분"
            value={text}
            onChange={(e) => setText(e.target.value)}
            disabled={loading}
          />
          <div className="flex items-center justify-between gap-3 border-t border-zinc-200 bg-zinc-50 px-5 py-3">
            <p className="text-xs text-zinc-500">힌트: 모델명 + 용량 + 요청가를 같이 적으면 정확도가 올라갑니다.</p>
            <button
              type="button"
              onClick={analyze}
              disabled={loading || text.trim().length === 0}
              className="rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-emerald-700 disabled:opacity-40"
            >
              {loading ? (
                <span className="inline-flex items-center gap-2">
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                  분석 중...
                </span>
              ) : (
                "분석하기"
              )}
            </button>
          </div>
        </div>
        </div>

        <aside className="rounded-2xl border border-zinc-200 bg-white p-5">
          <div className="text-sm font-semibold text-zinc-800">최근 분석 예시</div>
          <div className="mt-3 flex flex-wrap gap-2">
            {EXAMPLES.map((example) => (
              <button
                key={example.label}
                type="button"
                onClick={() => setText(example.text)}
                className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700 transition hover:bg-emerald-100"
              >
                {example.label}
              </button>
            ))}
          </div>

          <div className="mt-4 rounded-xl border border-zinc-200 bg-zinc-50 p-4">
            <p className="text-xs text-zinc-500">결과 미리보기</p>
            <p className="mt-2 line-clamp-2 text-sm font-semibold text-zinc-900">
              최신 분석 샘플
            </p>
            <p className="mt-1 text-xs text-zinc-600">
              분석 누적 {statsLoading ? "..." : stats.analysisCount.toLocaleString("ko-KR")}건 기준
            </p>
            <div className="mt-3 inline-flex rounded-full border border-zinc-200 bg-white px-2.5 py-1 text-xs font-medium text-zinc-700">
              서비스 운영 중
            </div>
          </div>
        </aside>
      </section>

      {error ? (
        <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      {showInputExampleHint ? (
        <div className="mt-4 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
          <p className="font-medium">인식된 부품이 없어요. 아래처럼 입력해보세요.</p>
          <p className="mt-1 text-xs text-blue-700">
            예) RTX 4070 / i5-13600K / DDR4 32GB / SSD 1TB / 130만원
          </p>
        </div>
      ) : null}

      {loading ? (
        <div className="mt-8">
          <AnalyzeStreamProgress
            streamPct={streamPct}
            streamStep={streamStep}
            streamMessage={streamMessage}
          />
        </div>
      ) : null}

      {result && !loading ? (
        <section className="mt-8 space-y-5">
          {newModeCoverage?.showMissingMajorityWarning ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              <p className="font-medium">
                ⚠️ 주요 부품의 신품가 정보가 없습니다.
              </p>
              <p className="mt-1">
                구형/단종 부품이 포함된 경우 중고 매물 분석을 이용해주세요.
              </p>
            </div>
          ) : null}
          {/* 1) 판정 배지 */}
          <div className="rounded-2xl border border-zinc-200 bg-white p-4">
            <p className="text-sm font-semibold text-zinc-800">
              {result.analysisModeLabel ??
                (result.analysisMode === "new" ? "신품가 기준" : "중고 시세 기준")}
            </p>
            {result.askingPrice ? (
              <>
                <div
                  className={`mt-2 inline-flex items-center rounded-full border px-3 py-1 text-sm font-medium ${VERDICT_STYLE[result.verdict]}`}
                >
                  {VERDICT_KO[result.verdict]}
                </div>
                {VERDICT_HINT[result.verdict] ? (
                  <p className="mt-2 text-sm text-zinc-600">{VERDICT_HINT[result.verdict]}</p>
                ) : null}
              </>
            ) : (
              <p className="text-sm text-zinc-700">
                적정 판매가: <span className="font-semibold text-zinc-900">{krw(result.totalFairMid)}</span>
              </p>
            )}
          </div>

          {/* 2) 가격 범위 카드 */}
          <div className="rounded-2xl border border-zinc-200 bg-white p-4">
            <div className="text-sm font-medium text-zinc-700">가격 범위</div>
            <div className="mt-3 grid grid-cols-3 gap-3 text-sm">
              <div className="rounded-lg bg-zinc-50 p-3">
                <div className="text-xs text-zinc-500">하한가</div>
                <div className="mt-1 font-semibold text-zinc-900">{krw(result.totalFairLow)}</div>
                {result.parts.some((part) => part.buyoutBasedLow) ? (
                  <div className="mt-1 text-[11px] text-zinc-400">업체 매입가 기준</div>
                ) : null}
              </div>
              <div className="rounded-lg bg-green-50 p-3">
                <div className="text-xs text-green-700">
                  {result.analysisMode === "new" ? "신품 최저가" : "적정가"}
                </div>
                <div className="mt-1 font-semibold text-green-800">
                  {krw(result.totalFairMid)}
                  {newModeCoverage ? (
                    <span className="ml-2 text-xs font-normal text-green-700">
                      ({newModeCoverage.totalParts}개 부품 중 {newModeCoverage.pricedParts}개만 포함)
                    </span>
                  ) : null}
                </div>
              </div>
              <div className="rounded-lg bg-zinc-50 p-3">
                <div className="text-xs text-zinc-500">상한가</div>
                <div className="mt-1 font-semibold text-zinc-900">{krw(result.totalFairHigh)}</div>
              </div>
            </div>

            {priceGauge ? (
              <PriceRangeGauge
                gauge={priceGauge}
                fairMidLabel={result.analysisMode === "new" ? "신품 최저가" : "적정가"}
                sampleSize={result.totalSampleSize}
              />
            ) : null}
          </div>

          {/* 3) 부품별 내역 테이블 */}
          <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white">
            <div className="border-b border-zinc-200 bg-zinc-50 px-4 py-3 text-sm font-medium text-zinc-700">
              부품별 내역
            </div>
            <table className="w-full text-sm">
              <thead className="bg-zinc-50 text-zinc-600">
                <tr>
                  <th className="px-4 py-2 text-left font-medium">부품명</th>
                  <th className="px-4 py-2 text-right font-medium">
                    {result.analysisMode === "new" ? "신품 최저가" : "중고적정가"}
                  </th>
                  {result.analysisMode === "used" ? (
                    <>
                      <th className="px-4 py-2 text-right font-medium">신품가</th>
                      <th className="px-4 py-2 text-right font-medium">감가율</th>
                    </>
                  ) : null}
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {result.parts.map((part: AnalyzedPart, idx: number) => (
                  <tr key={`${part.partName}-${idx}`}>
                    <td className="px-4 py-2 text-zinc-800">
                      <div>{part.partName}</div>
                      {part.category === "SSD" && (
                        <div className="mt-0.5 text-[11px] text-zinc-400">브랜드에 따라 ±50% 차이 가능</div>
                      )}
                      {part.buyoutBasedLow && (
                        <div className="mt-0.5 text-[11px] text-zinc-400">하한: 업체 매입가 기준</div>
                      )}
                    </td>
                    <td className="px-4 py-2 text-right font-medium text-zinc-900">
                      {result.analysisMode === "new" && !part.usedMid ? (
                        <span className="text-xs font-normal text-orange-600">신품가 정보 없음</span>
                      ) : (
                        krw(part.usedMid)
                      )}
                    </td>
                    {result.analysisMode === "used" ? (
                      <>
                        <td className="px-4 py-2 text-right text-zinc-700">{krw(part.newPrice)}</td>
                        <td className="px-4 py-2">
                          {part.newPrice && part.usedMid ? (
                            <div className="flex items-center justify-end gap-2">
                              <span className="font-mono text-xs text-zinc-700">
                                {`${"█".repeat(
                                  Math.max(1, Math.min(10, Math.round((part.usedMid / part.newPrice) * 10))),
                                )}${"░".repeat(
                                  10 - Math.max(1, Math.min(10, Math.round((part.usedMid / part.newPrice) * 10))),
                                )}`}
                              </span>
                              <span className="text-xs text-zinc-600">
                                -{Math.max(0, Math.round((1 - part.usedMid / part.newPrice) * 100))}%
                              </span>
                            </div>
                          ) : (
                            <div className="text-right text-zinc-700">—</div>
                          )}
                        </td>
                      </>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="border-t border-zinc-200 bg-zinc-50 px-4 py-3 text-sm">
              {result.analysisMode === "new" ? "신품 최저가" : "합산 적정가"} 합계:{" "}
              <span className="font-semibold text-zinc-900">{krw(result.totalFairMid)}</span>
              {newModeCoverage ? (
                <span className="ml-2 text-xs text-zinc-500">
                  ({newModeCoverage.totalParts}개 부품 중 {newModeCoverage.pricedParts}개만 포함)
                </span>
              ) : null}
            </div>
          </div>

          {/* 5) 추가 기능 2x2 그리드 */}
          <div className="grid gap-3 md:grid-cols-2">
            {[
              { title: "가격 알림", desc: "원하는 가격대 도달 시 알림" },
              { title: "결과 공유", desc: "링크로 분석 결과 공유" },
              { title: "분석 히스토리", desc: "최근 분석 목록 다시 보기" },
              { title: "신품 최저가", desc: "신품 최저가 채널 비교" },
            ].map((feature) => (
              <div key={feature.title} className="rounded-2xl border border-zinc-200 bg-white p-4">
                <div className="text-sm font-medium text-zinc-800">{feature.title}</div>
                <div className="mt-1 text-xs text-zinc-500">{feature.desc}</div>
              </div>
            ))}
          </div>

          {showAiOnlyDisclaimer ? (
            <p className="text-xs text-zinc-500">
              참고용 가격입니다 · 실제 거래가와 다를 수 있어요
            </p>
          ) : null}

          {result.warnings.length > 0 ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900 space-y-1">
              {result.warnings.map((warning) => (
                <p key={warning}>{warning}</p>
              ))}
            </div>
          ) : null}

          <div className="rounded-2xl border border-zinc-200 bg-white p-4">
            <button
              type="button"
              onClick={() => setShowPriceReport((open) => !open)}
              className="text-sm font-medium text-zinc-800"
            >
              💬 이 가격이 이상해요
            </button>
            {showPriceReport ? (
              <div className="mt-3 space-y-2">
                {result.parts
                  .filter((part) => part.usedMid && part.usedMid > 0)
                  .map((part) => (
                    <div
                      key={`${part.partName}-${part.category}`}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-zinc-50 px-3 py-2 text-sm"
                    >
                      <span className="text-zinc-700">
                        {part.partName}{" "}
                        <span className="text-zinc-500">{krw(part.usedMid)}</span>
                      </span>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          disabled={reportLoading}
                          onClick={() =>
                            reportPrice(part.partName, part.usedMid ?? 0, "too_high")
                          }
                          className="rounded-lg border border-zinc-300 bg-white px-2 py-1 text-xs text-zinc-700 disabled:opacity-50"
                        >
                          너무 비싸요
                        </button>
                        <button
                          type="button"
                          disabled={reportLoading}
                          onClick={() =>
                            reportPrice(part.partName, part.usedMid ?? 0, "too_low")
                          }
                          className="rounded-lg border border-zinc-300 bg-white px-2 py-1 text-xs text-zinc-700 disabled:opacity-50"
                        >
                          너무 싸요
                        </button>
                      </div>
                    </div>
                  ))}
                {reportMessage ? (
                  <p className="text-xs text-zinc-600">{reportMessage}</p>
                ) : null}
              </div>
            ) : null}
          </div>

          {showIncompletePcHint ? (
            <p className="text-xs leading-relaxed text-zinc-500">
              💡 메인보드·파워·케이스가 포함된 완성 PC라면
              <br />
              실제 거래가는 적정가보다 높을 수 있습니다.
            </p>
          ) : null}

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={shareResult}
              disabled={shareLoading}
              className="rounded-xl border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-800 transition hover:bg-zinc-50 disabled:opacity-50"
            >
              {shareLoading ? "공유 링크 생성 중..." : "결과 공유"}
            </button>
            {toastMessage ? (
              <div className="rounded-lg bg-zinc-900 px-3 py-1.5 text-xs text-white">{toastMessage}</div>
            ) : null}
          </div>
          {shareUrl ? (
            <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-700">
              공유 링크:{" "}
              <a className="underline break-all" href={shareUrl}>
                {shareUrl}
              </a>
            </div>
          ) : null}

          <p className="text-center text-[11px] leading-relaxed text-zinc-400">
            본 서비스의 가격은 참고용입니다.
            <br />
            실제 거래가와 다를 수 있으며 중요한 거래 전
            <br />
            반드시 직접 시세를 확인하세요.
          </p>
        </section>
      ) : null}
    </main>
  );
}
