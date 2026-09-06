import Link from "next/link";

const CARDS = [
  {
    href: "/calculator",
    kicker: "완본체",
    title: "PC 계산기",
    desc: "조립PC 사양과 호가를 넣으면 부품 시세를 합쳐 적정가를 판정합니다.",
  },
  {
    href: "/part-price",
    kicker: "단품",
    title: "부품 계산기",
    desc: "그래픽카드, CPU, 램, SSD 하나의 중고 시세를 조회합니다.",
  },
  {
    href: "/market",
    kicker: "매물",
    title: "장터",
    desc: "시세를 참고해 올려 둔 중고 매물을 둘러봅니다.",
  },
] as const;

export default function Home() {
  return (
    <main className="mx-auto min-h-[calc(100vh-8rem)] max-w-5xl px-4 py-16 sm:px-6">
      <section className="max-w-2xl">
        <p className="text-sm font-medium text-emerald-700">중고 PC 시세</p>
        <h1 className="mt-2 text-4xl font-semibold tracking-tight text-zinc-900 sm:text-5xl">
          사기 전에
          <br />
          적정가부터 확인하세요
        </h1>
        <p className="mt-4 max-w-xl text-base leading-7 text-zinc-600">
          당근·번개 매물 글을 붙여넣으면 부품을 분해하고, 단품 시세를 기준으로 호가가 싼지 비싼지 보여줍니다.
        </p>
      </section>

      <section className="mt-12 grid gap-4 sm:grid-cols-3">
        {CARDS.map((card) => (
          <Link
            key={card.href}
            href={card.href}
            className="group rounded-2xl border border-zinc-200 bg-white p-5 transition hover:border-zinc-300 hover:shadow-sm"
          >
            <p className="text-xs font-medium uppercase tracking-wide text-zinc-400">{card.kicker}</p>
            <h2 className="mt-2 text-lg font-semibold text-zinc-900 group-hover:text-emerald-700">{card.title}</h2>
            <p className="mt-2 text-sm leading-6 text-zinc-600">{card.desc}</p>
          </Link>
        ))}
      </section>

      <p className="mt-14 text-xs text-zinc-400">시세는 참고용입니다. 상태·구성에 따라 실제 거래가와 다를 수 있습니다.</p>
    </main>
  );
}
