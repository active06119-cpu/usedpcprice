import Link from "next/link";

const cards = [
  {
    title: "판매자 시세 추정",
    description: "내 PC 스펙을 입력해 빠른 판매가, 권장가, 상단 범위를 확인합니다.",
    href: "/seller",
  },
  {
    title: "구매자 판매글 분석",
    description: "중고 판매글 텍스트를 붙여 넣어 적정 가격인지 빠르게 판별합니다.",
    href: "/buyer",
  },
  {
    title: "단일 부품 추정",
    description: "GPU, CPU, RAM, SSD 같은 단일 부품 시세를 간단히 계산합니다.",
    href: "/part",
  },
  {
    title: "결과 페이지 예시",
    description: "가격 배지, 근거, 경고, 기여도 패널을 확인합니다.",
    href: "/results",
  },
];

export function FeatureCards() {
  return (
    <section className="grid gap-4 md:grid-cols-2">
      {cards.map((card) => (
        <Link
          key={card.href}
          href={card.href}
          className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:shadow"
        >
          <h2 className="text-lg font-semibold text-zinc-900">{card.title}</h2>
          <p className="mt-2 text-sm text-zinc-600">{card.description}</p>
          <p className="mt-4 text-sm font-medium text-zinc-900">페이지 이동 →</p>
        </Link>
      ))}
    </section>
  );
}
