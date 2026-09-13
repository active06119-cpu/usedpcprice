import Link from "next/link";

import { getContactInfo } from "@/lib/contact";

export function SiteFooter() {
  const { telegramUsername, telegramUrl } = getContactInfo();

  return (
    <footer className="mt-auto border-t border-zinc-200 bg-white">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-2 px-4 py-4 text-[12px] text-zinc-500 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <p>중고 PC 시세 참고. 거래 중개 아님.</p>
        <nav className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <Link href="/terms" className="hover:text-zinc-800">
            이용약관
          </Link>
          <span aria-hidden>·</span>
          <Link href="/privacy" className="hover:text-zinc-800">
            개인정보처리방침
          </Link>
          {telegramUrl && telegramUsername ? (
            <>
              <span aria-hidden>·</span>
              <a href={telegramUrl} target="_blank" rel="noopener noreferrer" className="hover:text-zinc-800">
                문의
              </a>
            </>
          ) : null}
        </nav>
      </div>
    </footer>
  );
}
