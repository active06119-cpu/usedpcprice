"use client";

import { useState } from "react";

type AnalyzeResponse = {
  totalFairLow: number;
  totalFairMid: number;
  totalFairHigh: number;
};

export default function NewMarketListingPage() {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priceKrw, setPriceKrw] = useState("");
  const [condition, setCondition] = useState<"NEW" | "LIKE_NEW" | "GOOD" | "FAIR" | "POOR">("GOOD");
  const [location, setLocation] = useState("");
  const [contact, setContact] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [analysis, setAnalysis] = useState<AnalyzeResponse | null>(null);
  const [verified, setVerified] = useState<boolean | null>(null);

  async function onSubmit() {
    if (!title.trim() || !description.trim() || !priceKrw.trim() || !contact.trim()) {
      setMessage("필수 항목을 입력해주세요.");
      return;
    }

    const numericPrice = Number(priceKrw.replace(/,/g, ""));
    if (!Number.isFinite(numericPrice) || numericPrice <= 0) {
      setMessage("가격을 숫자로 입력해주세요.");
      return;
    }

    setLoading(true);
    setMessage("");
    setAnalysis(null);
    setVerified(null);

    try {
      const analyzeText = `${title}\n${description}\n${numericPrice}원`;
      const analyzeRes = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: analyzeText }),
      });
      const analyzeData = (await analyzeRes.json()) as AnalyzeResponse & { error?: string };
      if (!analyzeRes.ok) {
        throw new Error(analyzeData.error ?? "자동 분석에 실패했습니다.");
      }
      setAnalysis(analyzeData);

      const isFairVerified =
        Number.isFinite(analyzeData.totalFairLow) &&
        Number.isFinite(analyzeData.totalFairHigh) &&
        numericPrice >= analyzeData.totalFairLow &&
        numericPrice <= analyzeData.totalFairHigh;
      setVerified(isFairVerified);

      const createRes = await fetch("/api/market/listings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim(),
          priceKrw: numericPrice,
          condition,
          location: location.trim() || null,
          contact: contact.trim(),
          isFairVerified,
          fairPriceMid: analyzeData.totalFairMid ?? null,
        }),
      });

      const createData = (await createRes.json()) as { ok?: boolean; message?: string };
      if (!createRes.ok || !createData.ok) {
        throw new Error(createData.message ?? "등록 실패");
      }

      setMessage("매물이 등록되었습니다.");
      setTitle("");
      setDescription("");
      setPriceKrw("");
      setCondition("GOOD");
      setLocation("");
      setContact("");
    } catch (e) {
      const err = e as Error;
      setMessage(err.message || "처리 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <h1 className="text-2xl font-semibold text-zinc-900">매물 올리기</h1>
      <p className="mt-2 text-sm text-zinc-600">입력한 제목+설명을 자동 분석한 뒤 적정가 인증 여부를 설정합니다.</p>

      <section className="mt-6 space-y-4 rounded-2xl border border-zinc-200 bg-white p-5">
        <div>
          <label className="text-sm font-medium text-zinc-700">제목</label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="mt-1 w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200"
          />
        </div>

        <div>
          <label className="text-sm font-medium text-zinc-700">설명</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={6}
            className="mt-1 w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200"
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="text-sm font-medium text-zinc-700">가격(원)</label>
            <input
              value={priceKrw}
              onChange={(e) => setPriceKrw(e.target.value)}
              className="mt-1 w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200"
            />
          </div>

          <div>
            <label className="text-sm font-medium text-zinc-700">상태</label>
            <select
              value={condition}
              onChange={(e) => setCondition(e.target.value as "NEW" | "LIKE_NEW" | "GOOD" | "FAIR" | "POOR")}
              className="mt-1 w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200"
            >
              <option value="NEW">새상품</option>
              <option value="LIKE_NEW">개봉만</option>
              <option value="GOOD">사용감적음</option>
              <option value="FAIR">사용감있음</option>
              <option value="POOR">불량</option>
            </select>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="text-sm font-medium text-zinc-700">지역</label>
            <input
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              className="mt-1 w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-zinc-700">연락처(오픈채팅/전화)</label>
            <input
              value={contact}
              onChange={(e) => setContact(e.target.value)}
              className="mt-1 w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200"
            />
          </div>
        </div>

        <div className="flex justify-end">
          <button
            type="button"
            onClick={onSubmit}
            disabled={loading}
            className="rounded-xl bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {loading ? "분석 및 등록 중..." : "등록하기"}
          </button>
        </div>

        {analysis ? (
          <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-700">
            <p>
              분석 적정가 범위: ₩{analysis.totalFairLow.toLocaleString("ko-KR")} ~ ₩
              {analysis.totalFairHigh.toLocaleString("ko-KR")}
            </p>
            <p className="mt-1">
              판정:{" "}
              <span className="font-medium">
                {verified ? "✓ 적정가 인증 가능" : "인증 범위 밖"}
              </span>
            </p>
          </div>
        ) : null}

        {message ? <p className="text-sm text-zinc-700">{message}</p> : null}
      </section>
    </main>
  );
}
