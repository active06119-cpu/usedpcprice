import Link from "next/link";

import { getContactInfo } from "@/lib/contact";

export function SiteFooter() {
  const { telegramUsername, telegramUrl } = getContactInfo();

  return (
    <footer className="mt-auto border-t border-zinc-200 bg-white">
      <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-3 px-6 py-5 text-sm text-zinc-500">
        <p>© {new Date().getFullYear()} PC시세</p>
        <nav className="flex flex-wrap items-center gap-2">
          <Link href="/terms" className="hover:text-zinc-700">
            이용약관
          </Link>
          <span aria-hidden>·</span>
          <Link href="/privacy" className="hover:text-zinc-700">
            개인정보처리방침
          </Link>
          {telegramUrl && telegramUsername ? (
            <>
              <span aria-hidden>·</span>
              <a
                href={telegramUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-zinc-700"
              >
                문의 (텔레그램)
              </a>
            </>
          ) : null}
        </nav>
      </div>
    </footer>
  );
}
