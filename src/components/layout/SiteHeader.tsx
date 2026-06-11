import Link from "next/link";

import { APP_TITLE, NAV_ITEMS } from "@/lib/constants";

export function SiteHeader() {
  return (
    <header className="border-b border-zinc-200/80 bg-white/95 backdrop-blur">
      <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-4 px-6 py-4">
        <Link href="/" className="inline-flex items-center gap-2 text-lg font-semibold text-zinc-900">
          <span>{APP_TITLE}</span>
          <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
            베타
          </span>
        </Link>
        <nav className="flex flex-wrap gap-2">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-md px-3 py-2 text-sm text-zinc-700 transition-colors hover:bg-zinc-100"
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
