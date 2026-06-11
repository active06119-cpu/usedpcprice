import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function HeroCard() {
  return (
    <Card>
      <CardHeader>
        <Badge className="w-fit">Korean-first MVP</Badge>
        <CardTitle>신뢰할 수 있는 가격 판단 도구</CardTitle>
        <CardDescription>
          결정론 기반 추정 엔진을 연결하기 전, 제품형 구조와 정보 전달 중심 UI를 먼저 구축했습니다.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-3">
        <Button asChild href="/seller">
          판매자 추정 시작
        </Button>
        <Button asChild href="/buyer" variant="outline">
          구매자 분석 시작
        </Button>
        <Button asChild href="/results" variant="secondary">
          결과 화면 보기
        </Button>
      </CardContent>
    </Card>
  );
}
