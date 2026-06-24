import type { Metadata } from "next";
import Link from "next/link";

import { getContactInfo } from "@/lib/contact";

export const metadata: Metadata = {
  title: "개인정보처리방침 | PC시세",
  description: "PC시세 개인정보처리방침",
};

export default function PrivacyPage() {
  const { email, telegramUsername, telegramUrl } = getContactInfo();

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <h1 className="text-2xl font-semibold text-zinc-900">개인정보처리방침</h1>
      <p className="mt-2 text-sm text-zinc-500">최종 업데이트: 2026년 6월</p>

      <ul className="mt-8 list-disc space-y-4 pl-5 text-sm leading-relaxed text-zinc-700">
        <li>
          <strong>수집 항목</strong>: 마켓 게시 시 입력한 연락처, 지역 정보
        </li>
        <li>
          <strong>수집 목적</strong>: 매물 게시 서비스 제공
        </li>
        <li>
          <strong>보유 기간</strong>: 게시글 삭제 시까지
        </li>
        <li>
          <strong>제3자 제공</strong>: 없음
        </li>
        <li>
          <strong>문의</strong>:{" "}
          {email ? (
            <a href={`mailto:${email}`} className="text-teal-600 hover:text-teal-700">
              {email}
            </a>
          ) : null}
          {email && telegramUrl ? " · " : null}
          {telegramUrl && telegramUsername ? (
            <a
              href={telegramUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-teal-600 hover:text-teal-700"
            >
              텔레그램 @{telegramUsername}
            </a>
          ) : null}
          {!email && !telegramUrl ? "[이메일 또는 텔레그램 추가 필요]" : null}
        </li>
      </ul>

      <p className="mt-10 text-sm text-zinc-500">
        <Link href="/terms" className="text-teal-600 hover:text-teal-700">
          이용약관
        </Link>
        {" · "}
        <Link href="/" className="text-teal-600 hover:text-teal-700">
          홈으로
        </Link>
      </p>
    </main>
  );
}
