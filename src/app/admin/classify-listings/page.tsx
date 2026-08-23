"use client";

import { useState } from "react";

type Classified = {
  title: string;
  priceKrw: number | null;
  type: "SINGLE_PART" | "WHOLE_PC" | "SKIP";
  category?: string;
  name?: string;
  reason?: string;
};

type ApiResult = {
  ok: boolean;
  applied?: boolean;
  saved?: number;
  counts?: { single: number; saveable: number; wholePc: number; skip: number };
  listings?: Classified[];
  message?: string;
};

const krw = (n: number | null | undefined) =>
  typeof n === "number" ? `₩${n.toLocaleString("ko-KR")}` : "—";

export default function ClassifyListingsPage() {
  const adminToken = process.env.NEXT_PUBLIC_ADMIN_API_TOKEN ?? "";
  const [image, setImage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [result, setResult] = useState<ApiResult | null>(null);

  function readFile(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      setImage(typeof reader.result === "string" ? reader.result : null);
      setResult(null);
      setMessage(null);
    };
    reader.readAsDataURL(file);
  }

  function onPaste(e: React.ClipboardEvent) {
    const item = Array.from(e.clipboardData.items).find((i) => i.type.startsWith("image/"));
    const file = item?.getAsFile();
    if (file) readFile(file);
  }

  async function call(apply: boolean) {
    if (!image) return;
    setLoading(true);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/classify-listings", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-admin-token": adminToken },
        body: JSON.stringify({ image, apply }),
      });
      const data = (await res.json()) as ApiResult;
      if (!res.ok || !data.ok) {
        setMessage(data.message ?? "실패했습니다.");
        return;
      }
      setResult(data);
      const c = data.counts;
      setMessage(
        apply
          ? `✅ 가격표 저장 ${data.saved ?? 0}건 (단품 ${c?.saveable}, 통짜PC ${c?.wholePc}, 스킵 ${c?.skip})`
          : `분석 완료: 단품 ${c?.saveable}건 저장 예정 / 통짜PC ${c?.wholePc} / 스킵 ${c?.skip}`,
      );
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  }

  const badge = (t: Classified["type"]) =>
    t === "SINGLE_PART"
      ? "bg-emerald-50 text-emerald-700 border-emerald-200"
      : t === "WHOLE_PC"
        ? "bg-blue-50 text-blue-700 border-blue-200"
        : "bg-zinc-100 text-zinc-500 border-zinc-200";
  const label = (t: Classified["type"]) =>
    t === "SINGLE_PART" ? "단품→저장" : t === "WHOLE_PC" ? "통짜PC" : "스킵";

  return (
    <main className="mx-auto max-w-4xl px-4 py-8" onPaste={onPaste}>
      <h1 className="text-xl font-semibold text-zinc-900">캡처 분류 → 단품 시세 수집</h1>
      <p className="mt-1 text-sm text-zinc-600">
        당근/번개 검색결과를 캡처해서 붙여넣으면(Ctrl+V) AI가 분류합니다. 단품만 가격표에 저장, 통짜PC·구매글은 자동 제외.
      </p>

      <label className="mt-4 flex h-40 cursor-pointer items-center justify-center rounded-lg border-2 border-dashed border-zinc-300 text-sm text-zinc-500 hover:border-zinc-400">
        {image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={image} alt="캡처" className="max-h-36 rounded" />
        ) : (
          <span>여기에 캡처 이미지를 붙여넣기(Ctrl+V) 하거나 클릭해서 파일 선택</span>
        )}
        <input
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => e.target.files?.[0] && readFile(e.target.files[0])}
        />
      </label>

      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={() => call(false)}
          disabled={loading || !image}
          className="rounded-lg border border-zinc-300 px-4 py-2 text-sm text-zinc-700 disabled:opacity-50"
        >
          {loading ? "분석 중..." : "분석 (미리보기)"}
        </button>
        <button
          type="button"
          onClick={() => call(true)}
          disabled={loading || !image}
          className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          단품 가격표에 저장
        </button>
      </div>

      {message ? (
        <p className="mt-3 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-800">{message}</p>
      ) : null}

      {result?.listings && result.listings.length > 0 ? (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-200 text-left text-xs text-zinc-500">
                <th className="py-1 pr-3">매물</th>
                <th className="py-1 pr-3">가격</th>
                <th className="py-1 pr-3">분류</th>
                <th className="py-1">부품/사유</th>
              </tr>
            </thead>
            <tbody>
              {result.listings.map((l, i) => (
                <tr key={i} className="border-b border-zinc-100">
                  <td className="py-1.5 pr-3">{l.title}</td>
                  <td className="py-1.5 pr-3 whitespace-nowrap">{krw(l.priceKrw)}</td>
                  <td className="py-1.5 pr-3">
                    <span className={`rounded-full border px-2 py-0.5 text-[11px] ${badge(l.type)}`}>
                      {label(l.type)}
                    </span>
                  </td>
                  <td className="py-1.5 text-zinc-600">
                    {l.type === "SINGLE_PART" ? `${l.name} (${l.category})` : l.reason}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </main>
  );
}
