import Link from "next/link";

const CARDS = [
  {
    href: "/calculator",
    kicker: "완본체",
    title: "PC 계산기",
    desc: "사양과 호가를 넣으면 부품 시세를 합쳐 싼지 비싼지 알려줍니다.",
    cta: "시세 확인",
  },
  {
    href: "/part-price",
    kicker: "단품",
    title: "부품 계산기",
    desc: "그래픽카드, CPU, 램, SSD 하나의 중고가를 바로 봅니다.",
    cta: "부품 조회",
  },
  {
    href: "/market",
    kicker: "장터",
    title: "원문 매물",
    desc: "시세가 붙은 당근·번개 글을 모아 둡니다. 거래는 원문에서 합니다.",
    cta: "매물 보기",
  },
] as const;

export default function Home() {
  return (
    <main className="mx-auto max-w-3xl py-10 sm:py-14">
      <section>
        <h1 className="text-3xl font-semibold tracking-tight text-zinc-900 sm:text-4xl">
          중고 PC, 사기 전에 시세부터
        </h1>
        <p className="mt-3 max-w-xl text-[15px] leading-7 text-zinc-600">
          매물 글을 붙여넣으면 부품을 분해하고 단품 시세로 호가를 비교합니다.
          장터는 원문 링크만 모읍니다.
        </p>
        <div className="mt-6 flex flex-wrap gap-2">
          <Link
            href="/calculator"
            className="rounded-full bg-zinc-900 px-4 py-2 text-sm font-medium text-white"
          >
            PC 시세 확인
          </Link>
          <Link
            href="/market"
            className="rounded-full border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700"
          >
            장터 둘러보기
          </Link>
        </div>
      </section>

      <section className="mt-10 grid gap-3 sm:grid-cols-3">
        {CARDS.map((card) => (
          <Link
            key={card.href}
            href={card.href}
            className="rounded-2xl border border-zinc-200 bg-white p-4 transition hover:border-zinc-300 hover:shadow-sm"
          >
            <p className="text-xs font-medium text-zinc-400">{card.kicker}</p>
            <h2 className="mt-1 text-base font-semibold text-zinc-900">{card.title}</h2>
            <p className="mt-2 text-sm leading-6 text-zinc-600">{card.desc}</p>
            <p className="mt-3 text-sm font-medium text-emerald-700">{card.cta} →</p>
          </Link>
        ))}
      </section>
    </main>
  );
}
