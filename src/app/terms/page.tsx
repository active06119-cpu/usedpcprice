import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "이용약관 | PC시세",
  description: "PC시세 서비스 이용약관",
};

export default function TermsPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-10 text-sm leading-7 text-zinc-700">
      <h1 className="text-2xl font-semibold text-zinc-900">이용약관</h1>
      <p className="mt-2 text-zinc-500">시행일 2026년 9월 30일</p>

      <section className="mt-8 space-y-3">
        <h2 className="text-base font-semibold text-zinc-900">1. 서비스</h2>
        <p>
          PC시세는 중고 PC·부품 시세를 참고할 수 있도록 도와주는 정보 서비스입니다.
          통신판매법상 통신판매업자가 아니며, 거래 당사자·에스크로 업자·결제대행업자가 아닙니다.
        </p>
      </section>

      <section className="mt-8 space-y-3">
        <h2 className="text-base font-semibold text-zinc-900">2. 시세의 성격</h2>
        <p>
          화면에 나오는 가격은 실매물·매입가·고정 밴드를 합친 추정값입니다.
          실제 거래가와 다를 수 있으며, 구매 결정의 대체가 될 수 없습니다.
        </p>
      </section>

      <section className="mt-8 space-y-3">
        <h2 className="text-base font-semibold text-zinc-900">3. 장터</h2>
        <p>
          장터는 원문 매물(당근·번개 등) 링크와 참고 시세를 모아 보여 줍니다.
          거래는 해당 플랫폼에서 이루어지며, 게시 내용의 정확성·배송·환불에 대한 책임은 게시자에게 있습니다.
        </p>
      </section>

      <section className="mt-8 space-y-3">
        <h2 className="text-base font-semibold text-zinc-900">4. 금지 행위</h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>허위 매물, 사기 관련 게시</li>
          <li>타인의 개인정보를 무단으로 수집·공개</li>
          <li>서비스 장애, 자동화 남용, 부당한 접속</li>
        </ul>
        <p>위반 시 게시 삭제 또는 접속 제한을 할 수 있습니다.</p>
      </section>

      <section className="mt-8 space-y-3">
        <h2 className="text-base font-semibold text-zinc-900">5. 책임의 한계</h2>
        <p>
          서비스는 정보 제공자이며, 거래 손해·허위 표시·배송 지연에 대해 배상하지 않습니다.
          법령이 허용하는 범위에서 책임은 서비스가 해당 이용자로부터 받은 대가를 한도로 합니다.
        </p>
      </section>

      <section className="mt-8 space-y-3">
        <h2 className="text-base font-semibold text-zinc-900">6. 준거법</h2>
        <p>대한민국 법을 준거법으로 하며, 분쟁은 민사조정법에 따르는 관할 법원을 제1심 법원으로 합니다.</p>
      </section>

      <p className="mt-10 text-zinc-500">
        <Link href="/privacy" className="text-[#1e3a5f] underline">
          개인정보처리방침
        </Link>
        {" · "}
        <Link href="/" className="text-[#1e3a5f] underline">
          홈
        </Link>
      </p>
    </main>
  );
}
