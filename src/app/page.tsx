import Link from "next/link";

export default function Home() {
  return (
    <main className="mx-auto w-full max-w-5xl py-8 sm:py-14">
      <div className="grid items-start gap-8 lg:grid-cols-[1.05fr_1fr] lg:gap-12">
        <div className="pt-1">
          <p className="text-sm font-medium tracking-wide text-[#c2410c]">당근 · 번개 매물 기준</p>
          <h1 className="mt-3 text-3xl font-bold leading-tight tracking-tight text-stone-900 sm:text-5xl">
            중고컴퓨터 시세
          </h1>
          <p className="mt-4 max-w-xl text-base leading-7 text-stone-600 sm:text-lg">
            매물 글을 그대로 붙여넣으면 부품별로 나눠서 시세를 더합니다.
            거래는 원문에서 합니다.
          </p>
        </div>

        <section className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-[0_12px_32px_rgba(28,25,23,0.07)]">
          <div className="border-b border-stone-100 bg-[#1e3a5f] px-6 py-4 text-white">
            <p className="text-base font-semibold">완본체 시세 보기</p>
            <p className="mt-1 text-sm text-white/70">CPU·GPU는 실매물, 파워·보드·케이스는 구간가</p>
          </div>
          <div className="p-5 sm:p-6">
            <div className="rounded-xl border border-dashed border-stone-300 bg-stone-50 px-5 py-10 text-center text-[15px] text-stone-500">
              매물 사양 또는 캡처를 넣으려면 계산기로 이동합니다
            </div>
            <Link
              href="/calculator"
              className="mt-4 block rounded-xl bg-[#1e3a5f] px-4 py-3.5 text-center text-[15px] font-semibold text-white hover:bg-[#16304f]"
            >
              계산기 열기
            </Link>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <Link
                href="/part-price"
                className="rounded-xl border border-stone-200 bg-white px-3 py-3 text-center text-sm text-stone-800 hover:bg-stone-50"
              >
                단품 시세
              </Link>
              <Link
                href="/market"
                className="rounded-xl border border-stone-200 bg-white px-3 py-3 text-center text-sm text-stone-800 hover:bg-stone-50"
              >
                장터 글
              </Link>
            </div>
          </div>
        </section>
      </div>

      <dl className="mt-10 grid overflow-hidden rounded-2xl border border-stone-200 bg-white text-sm sm:grid-cols-3">
        <div className="border-b border-stone-100 px-5 py-5 sm:border-b-0 sm:border-r">
          <dt className="font-medium text-stone-500">완본체</dt>
          <dd className="mt-2 leading-6 text-stone-800">CPU·GPU 실매물 + 나머지 구간가</dd>
        </div>
        <div className="border-b border-stone-100 px-5 py-5 sm:border-b-0 sm:border-r">
          <dt className="font-medium text-stone-500">단품</dt>
          <dd className="mt-2 leading-6 text-stone-800">그래픽카드, CPU, 램, SSD</dd>
        </div>
        <div className="px-5 py-5">
          <dt className="font-medium text-stone-500">장터</dt>
          <dd className="mt-2 leading-6 text-stone-800">원문 링크만, 거래는 당근·번개</dd>
        </div>
      </dl>
    </main>
  );
}
