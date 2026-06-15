import Link from "next/link";
import type { ReactNode } from "react";

const NAV = [
  { href: "/admin", label: "시세 관리" },
  { href: "/admin/bulk-import", label: "대량 등록" },
  { href: "/admin/market", label: "마켓 관리" },
] as const;

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-zinc-50">
      <header className="border-b border-zinc-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">Admin</p>
            <h1 className="text-lg font-semibold text-zinc-900">PC시세 관리자</h1>
          </div>
          <nav className="flex flex-wrap gap-2">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-sm text-zinc-700 hover:border-zinc-300 hover:bg-zinc-50"
              >
                {item.label}
              </Link>
            ))}
            <Link
              href="/market"
              className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-sm text-emerald-800 hover:bg-emerald-100"
            >
              공개 마켓 →
            </Link>
          </nav>
        </div>
      </header>
      {children}
    </div>
  );
}
