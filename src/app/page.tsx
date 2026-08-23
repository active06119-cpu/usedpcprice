import Link from "next/link";

const CARDS = [
  {
    href: "/calculator",
    emoji: "🖥️",
    title: "PC 계산기",
    desc: "중고 조립PC, 이 가격 적당할까? 사양 넣으면 적정가 판정.",
  },
  {
    href: "/part-price",
    emoji: "🧩",
    title: "부품 계산기",
    desc: "그래픽카드·CPU 등 부품 하나의 중고 시세 조회.",
  },
  {
    href: "/market",
    emoji: "🛒",
    title: "장터",
    desc: "적정가 검증된 중고 매물 둘러보기.",
  },
];

export default function Home() {
  return (
    <main className="mx-auto min-h-screen max-w-2xl px-4 py-16">
      <div className="text-center">
        <h1 className="text-4xl font-bold tracking-tight text-zinc-900">시세로</h1>
        <p className="mt-3 text-lg text-zinc-600">
          중고 컴퓨터, 호구 잡히지 마세요.
          <br />
          사기 전에 적정가부터 확인하세요.
        </p>
      </div>

      <div className="mt-10 grid gap-4">
        {CARDS.map((c) => (
          <Link
            key={c.href}
            href={c.href}
            className="group flex items-center gap-4 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm transition hover:border-emerald-300 hover:shadow-md"
          >
            <span className="text-3xl">{c.emoji}</span>
            <span className="min-w-0 flex-1">
              <span className="block text-lg font-semibold text-zinc-900 group-hover:text-emerald-700">
                {c.title}
              </span>
              <span className="block text-sm text-zinc-600">{c.desc}</span>
            </span>
            <span className="text-zinc-300 group-hover:text-emerald-500">→</span>
          </Link>
        ))}
      </div>

      <p className="mt-10 text-center text-xs text-zinc-400">
        모든 시세는 매입 단가표·신품가 기반 추정이며 참고용입니다.
      </p>
    </main>
  );
}
