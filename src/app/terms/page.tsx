import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "이용약관 | PC시세",
  description: "PC시세 서비스 이용약관",
};

export default function TermsPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <h1 className="text-2xl font-semibold text-zinc-900">이용약관</h1>
      <p className="mt-2 text-sm text-zinc-500">최종 업데이트: 2026년 6월</p>

      <ul className="mt-8 list-disc space-y-4 pl-5 text-sm leading-relaxed text-zinc-700">
        <li>
          본 서비스(PC시세)는 중고 PC 시세 참고 정보를 제공합니다.
        </li>
        <li>
          제공되는 가격은 AI 및 실거래 데이터 기반 추정치이며 실제 거래가와 다를 수
          있습니다.
        </li>
        <li>
          마켓에 게시된 매물의 거래는 판매자와 구매자 간에 이루어지며 PC시세는 거래
          당사자가 아닙니다.
        </li>
        <li>
          게시 내용(가격, 상태, 연락처 등)의 정확성에 대한 책임은 게시자에게 있습니다.
        </li>
        <li>
          허위 매물, 사기 거래에 대해 PC시세는 책임지지 않습니다.
        </li>
      </ul>

      <p className="mt-10 text-sm text-zinc-500">
        <Link href="/privacy" className="text-teal-600 hover:text-teal-700">
          개인정보처리방침
        </Link>
        {" · "}
        <Link href="/" className="text-teal-600 hover:text-teal-700">
          홈으로
        </Link>
      </p>
    </main>
  );
}
