import Link from "next/link";

export default function Home() {
  return (
    <main className="mx-auto w-full max-w-2xl py-6 sm:py-12">
      <p className="text-[12px] font-medium tracking-wide text-[#c2410c]">당근 · 번개 매물 기준</p>
      <h1 className="mt-2 text-[1.65rem] font-bold leading-snug tracking-tight text-stone-900 sm:text-[2rem]">
        중고컴퓨터 시세
      </h1>
      <p className="mt-3 max-w-lg text-[15px] leading-6 text-stone-600">
        매물 글을 그대로 붙여넣으면 부품별로 나눠서 시세를 더합니다.
        거래는 원문에서 합니다.
      </p>

      <section className="mt-7 overflow-hidden rounded-xl border border-stone-200 bg-white shadow-[0_8px_24px_rgba(28,25,23,0.06)]">
        <div className="border-b border-stone-100 bg-[#1e3a5f] px-4 py-3 text-white sm:px-5">
          <p className="text-sm font-semibold">완본체 시세 보기</p>
          <p className="mt-0.5 text-[12px] text-white/70">CPU·GPU는 실매물, 파워·보드·케이스는 구간가</p>
        </div>
        <div className="p-4 sm:p-5">
          <div className="rounded-lg border border-dashed border-stone-300 bg-stone-50 px-4 py-6 text-center text-sm text-stone-500">
            매물 사양 또는 캡처를 넣으려면 계산기로 이동합니다
          </div>
          <Link
            href="/calculator"
            className="mt-3 block rounded-lg bg-[#1e3a5f] px-4 py-3 text-center text-sm font-semibold text-white hover:bg-[#16304f]"
          >
            계산기 열기
          </Link>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <Link
              href="/part-price"
              className="rounded-lg border border-stone-200 bg-white px-3 py-2.5 text-center text-sm text-stone-800 hover:bg-stone-50"
            >
              단품 시세
            </Link>
            <Link
              href="/market"
              className="rounded-lg border border-stone-200 bg-white px-3 py-2.5 text-center text-sm text-stone-800 hover:bg-stone-50"
            >
              장터 글
            </Link>
          </div>
        </div>
      </section>

      <dl className="mt-8 overflow-hidden rounded-xl border border-stone-200 bg-white text-[13px]">
        <div className="flex flex-col gap-1 border-b border-stone-100 px-4 py-3 sm:flex-row sm:items-baseline sm:justify-between sm:gap-6">
          <dt className="shrink-0 font-medium text-stone-500">완본체</dt>
          <dd className="text-stone-800 sm:text-right">CPU·GPU 실매물 + 나머지 구간가</dd>
        </div>
        <div className="flex flex-col gap-1 border-b border-stone-100 px-4 py-3 sm:flex-row sm:items-baseline sm:justify-between sm:gap-6">
          <dt className="shrink-0 font-medium text-stone-500">단품</dt>
          <dd className="text-stone-800 sm:text-right">그래픽카드, CPU, 램, SSD</dd>
        </div>
        <div className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-baseline sm:justify-between sm:gap-6">
          <dt className="shrink-0 font-medium text-stone-500">장터</dt>
          <dd className="text-stone-800 sm:text-right">원문 링크만, 거래는 당근·번개</dd>
        </div>
      </dl>
    </main>
  );
}
