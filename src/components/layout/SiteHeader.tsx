import Link from "next/link";

import { APP_TITLE, NAV_ITEMS } from "@/lib/constants";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-30 border-b border-stone-200/80 bg-white/90 backdrop-blur-md">
      <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-3 px-3 py-2.5 sm:px-6">
        <Link href="/" className="flex items-center gap-2">
          <span className="grid h-7 w-7 place-items-center rounded-md bg-[#1e3a5f] text-[11px] font-bold tracking-tight text-white">
            PC
          </span>
          <span className="text-sm font-semibold tracking-tight text-stone-900">{APP_TITLE}</span>
        </Link>
        <nav className="flex min-w-0 items-center gap-1 overflow-x-auto text-[13px] text-stone-600 sm:gap-1">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="shrink-0 rounded-md px-2.5 py-1.5 hover:bg-stone-100 hover:text-stone-900"
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
