import Link from "next/link";

import { APP_TITLE, NAV_ITEMS } from "@/lib/constants";

export function SiteHeader() {
  return (
    <header className="border-b border-zinc-200 bg-white">
      <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-4 px-4 py-2.5 sm:px-6">
        <Link href="/" className="text-sm font-bold text-zinc-900">
          {APP_TITLE}
        </Link>
        <nav className="flex items-center gap-4 text-[13px] text-zinc-600">
          {NAV_ITEMS.map((item) => (
            <Link key={item.href} href={item.href} className="hover:text-zinc-900">
              {item.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
