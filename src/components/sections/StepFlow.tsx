import { CheckCircle2 } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type StepFlowProps = {
  title?: string;
  description?: string;
  currentStep: 1 | 2 | 3;
};

export function StepFlow({
  title = "분석 단계",
  description = "입력부터 결과까지의 흐름을 한눈에 확인합니다.",
  currentStep,
}: StepFlowProps) {
  const steps = [
    { title: "입력", detail: "폼 또는 텍스트를 입력합니다." },
    { title: "분석", detail: "정규화/규칙 적용으로 시세를 계산합니다." },
    { title: "결과", detail: "배지/근거/경고를 확인합니다." },
  ] as const;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <ol className="grid gap-3 md:grid-cols-2">
          {steps.map((step, index) => (
            <li key={step.title} className="rounded-xl border border-zinc-200 bg-zinc-50 p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-zinc-900">
                <CheckCircle2 className="h-4 w-4" />
                {index + 1}. {step.title}
                {index + 1 === currentStep ? (
                  <span className="ml-1 rounded bg-zinc-900 px-2 py-0.5 text-[10px] font-medium text-white">
                    현재
                  </span>
                ) : null}
              </div>
              <p className="mt-1 text-sm text-zinc-600">{step.detail}</p>
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  );
}
