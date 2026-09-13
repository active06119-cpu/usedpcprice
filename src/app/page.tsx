import Link from "next/link";

export default function Home() {
  return (
    <main className="mx-auto w-full max-w-2xl py-6 sm:py-12">
      <h1 className="text-2xl font-bold leading-snug tracking-tight text-zinc-900 sm:text-[2rem]">
        중고컴퓨터 시세
      </h1>
      <p className="mt-3 max-w-lg text-[15px] leading-6 text-zinc-600">
        매물 글을 그대로 붙여넣으면 부품별로 나눠서 시세를 더합니다.
        여기서 거래하지는 않습니다.
      </p>

      <div className="mt-6 space-y-2 sm:mt-7">
        <Link
          href="/calculator"
          className="block bg-zinc-900 px-4 py-3 text-center text-sm font-medium text-white hover:bg-zinc-800"
        >
          완본체 글 붙여넣기
        </Link>
        <div className="grid grid-cols-2 gap-2">
          <Link
            href="/part-price"
            className="border border-zinc-300 bg-white px-3 py-2.5 text-center text-sm text-zinc-800 hover:bg-zinc-50"
          >
            단품 시세
          </Link>
          <Link
            href="/market"
            className="border border-zinc-300 bg-white px-3 py-2.5 text-center text-sm text-zinc-800 hover:bg-zinc-50"
          >
            장터 글
          </Link>
        </div>
      </div>

      <dl className="mt-8 divide-y divide-zinc-200 border-y border-zinc-200 text-[13px] sm:mt-10">
        <div className="flex flex-col gap-1 py-3 sm:flex-row sm:items-baseline sm:justify-between sm:gap-6">
          <dt className="shrink-0 text-zinc-500">완본체</dt>
          <dd className="text-zinc-800 sm:text-right">CPU·GPU는 실매물, 파워·보드·케이스는 구간가</dd>
        </div>
        <div className="flex flex-col gap-1 py-3 sm:flex-row sm:items-baseline sm:justify-between sm:gap-6">
          <dt className="shrink-0 text-zinc-500">단품</dt>
          <dd className="text-zinc-800 sm:text-right">그래픽카드, CPU, 램, SSD 하나의 중고가</dd>
        </div>
        <div className="flex flex-col gap-1 py-3 sm:flex-row sm:items-baseline sm:justify-between sm:gap-6">
          <dt className="shrink-0 text-zinc-500">장터</dt>
          <dd className="text-zinc-800 sm:text-right">원문 링크만 모읍니다. 거래는 당근·번개에서</dd>
        </div>
      </dl>
    </main>
  );
}
