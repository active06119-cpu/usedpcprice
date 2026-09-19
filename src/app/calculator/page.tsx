import { CalculatorPanel } from "@/components/calculator/CalculatorPanel";

export default function CalculatorPage() {
  return (
    <main className="mx-auto w-full max-w-2xl py-6 sm:py-10">
      <p className="text-[12px] font-medium text-[#c2410c]">완본체</p>
      <h1 className="mt-1 text-xl font-bold tracking-tight text-stone-900 sm:text-2xl">중고컴퓨터 시세</h1>
      <p className="mt-1 text-sm text-stone-600">사양을 넣으면 부품 시세를 합쳐 적정가를 봅니다.</p>
      <div className="mt-5">
        <CalculatorPanel />
      </div>
    </main>
  );
}
