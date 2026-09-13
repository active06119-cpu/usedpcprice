import Link from "next/link";

import { APP_TITLE, NAV_ITEMS } from "@/lib/constants";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-30 border-b border-zinc-200 bg-white">
      <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-3 px-3 py-2 sm:px-6 sm:py-2.5">
        <Link href="/" className="shrink-0 text-sm font-bold text-zinc-900">
          {APP_TITLE}
        </Link>
        <nav className="flex min-w-0 items-center gap-3 overflow-x-auto text-[13px] text-zinc-600 sm:gap-4">
          {NAV_ITEMS.map((item) => (
            <Link key={item.href} href={item.href} className="shrink-0 hover:text-zinc-900">
              {item.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
