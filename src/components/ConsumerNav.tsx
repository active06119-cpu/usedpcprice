import Link from "next/link";

const TABS = [
  { href: "/calculator", label: "PC 계산기" },
  { href: "/part-price", label: "부품 계산기" },
  { href: "/market", label: "장터" },
];

export function ConsumerNav({ active }: { active?: string }) {
  return (
    <nav className="mx-auto mb-6 flex max-w-2xl items-center justify-center gap-1 text-sm">
      <Link href="/" className="mr-2 font-bold text-emerald-700">
        시세로
      </Link>
      {TABS.map((t) => (
        <Link
          key={t.href}
          href={t.href}
          className={`rounded-full px-3 py-1.5 ${
            active === t.href
              ? "bg-emerald-600 font-medium text-white"
              : "text-zinc-600 hover:bg-zinc-100"
          }`}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
