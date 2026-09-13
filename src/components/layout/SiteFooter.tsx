import Link from "next/link";

import { getContactInfo } from "@/lib/contact";

export function SiteFooter() {
  const { telegramUsername, telegramUrl } = getContactInfo();

  return (
    <footer className="mt-auto border-t border-stone-200 bg-white">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-2 px-4 py-5 text-[12px] text-stone-500 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <p>
          <span className="font-medium text-stone-700">PC시세</span>
          <span className="mx-2 text-stone-300">|</span>
          중고 PC 참고 시세 · 거래 중개 아님
        </p>
        <nav className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <Link href="/terms" className="hover:text-stone-800">
            이용약관
          </Link>
          <Link href="/privacy" className="hover:text-stone-800">
            개인정보
          </Link>
          {telegramUrl && telegramUsername ? (
            <a href={telegramUrl} target="_blank" rel="noopener noreferrer" className="hover:text-stone-800">
              문의
            </a>
          ) : null}
        </nav>
      </div>
    </footer>
  );
}
