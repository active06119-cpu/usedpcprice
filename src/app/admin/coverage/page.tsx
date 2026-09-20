"use client";

import { useEffect, useState } from "react";

type Row = { id: string; name: string; category: string; samples90: number };
type Cat = { category: string; parts: number; samples: number; thin: number };

const BOT = `당근/번개에서 중고 단품만 가져와.
완본체, 묶음, 교환, 미개봉, 호가 없는 글은 빼.
검색어: RTX 4060, 4070, 4070 Ti, 5070, 5070 Ti, 5060, 3060, 3070, 3080, 3090, 4060 Ti, 4080,
Ryzen 5600, 5600X, 5700X, 7500F, 7600, 7700, i5-12400, 13400, 13600K, 14600K, i7-12700, 14700,
DDR4 16GB, DDR4 32GB, DDR5 16GB, DDR5 32GB, SSD 500GB, 1TB, 2TB.

항목당 아래 형식으로만.
제목
가격
URL
스펙: GPU RTX 4060 / RAM DDR5 16GB / SSD SSD 1TB
`;

export default function CoveragePage() {
  const token = process.env.NEXT_PUBLIC_ADMIN_API_TOKEN ?? "";
  const [thin, setThin] = useState<Row[]>([]);
  const [cats, setCats] = useState<Cat[]>([]);
  const [thinCount, setThinCount] = useState(0);
  const [message, setMessage] = useState("불러오는 중");

  useEffect(() => {
    fetch("/api/admin/coverage", { headers: { "x-admin-token": token } })
      .then((r) => r.json())
      .then((data) => {
        if (!data.ok) {
          setMessage(data.message ?? "불러오기 실패");
          return;
        }
        setThin(data.thin ?? []);
        setCats(data.byCategory ?? []);
        setThinCount(data.thinCount ?? 0);
        setMessage("");
      })
      .catch(() => setMessage("불러오기 실패"));
  }, [token]);

  return (
    <main className="mx-auto max-w-4xl px-4 py-8">
      <h1 className="text-xl font-semibold text-zinc-900">실매물 부족 부품</h1>
      <p className="mt-1 text-sm text-zinc-600">90일 실매물 8건 미만인 GPU·CPU·램·SSD입니다. 이 목록을 그록 봇에 넘기세요.</p>

      {message ? <p className="mt-4 text-sm text-zinc-500">{message}</p> : null}

      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {cats.map((c) => (
          <div key={c.category} className="rounded-xl border border-zinc-200 bg-white p-3">
            <p className="text-xs text-zinc-500">{c.category}</p>
            <p className="mt-1 text-lg font-semibold tabular-nums">{c.samples}</p>
            <p className="text-xs text-zinc-500">부족 {c.thin} / {c.parts}</p>
          </div>
        ))}
      </div>

      <p className="mt-6 text-sm text-zinc-700">부족 {thinCount}개</p>
      <ul className="mt-2 divide-y divide-zinc-100 overflow-hidden rounded-xl border border-zinc-200 bg-white text-sm">
        {thin.map((row) => (
          <li key={row.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
            <span>
              <span className="text-zinc-400">{row.category}</span>{" "}
              <span className="text-zinc-900">{row.name}</span>
            </span>
            <span className="tabular-nums text-zinc-600">{row.samples90}건</span>
          </li>
        ))}
      </ul>

      <section className="mt-8 rounded-xl border border-zinc-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-zinc-800">그록 봇에 넣을 말</h2>
        <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap rounded-lg bg-zinc-50 p-3 text-xs text-zinc-700">{BOT}</pre>
      </section>
    </main>
  );
}
