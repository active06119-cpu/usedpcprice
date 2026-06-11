import { ClipboardList, ShieldCheck, Sparkles } from "lucide-react";

import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function ValueCards() {
  return (
    <section className="grid gap-4 md:grid-cols-3">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5" />
            Trustworthy
          </CardTitle>
          <CardDescription>근거와 경고를 분리해 신뢰도 중심으로 전달합니다.</CardDescription>
        </CardHeader>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ClipboardList className="h-5 w-5" />
            Readable
          </CardTitle>
          <CardDescription>카드 기반 정보 구조로 핵심 수치를 빠르게 파악합니다.</CardDescription>
        </CardHeader>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5" />
            Portfolio-ready
          </CardTitle>
          <CardDescription>과장 없는 실무형 톤으로 완성도 높은 UI를 제공합니다.</CardDescription>
        </CardHeader>
      </Card>
    </section>
  );
}
