import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";

type ComponentContributionCardProps = {
  items: Array<{ name: string; amountKrw: number; ratio: number }>;
};

function formatKrw(value: number) {
  return `${value.toLocaleString("ko-KR")}원`;
}

export function ComponentContributionCard({ items }: ComponentContributionCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>부품 기여도</CardTitle>
        <CardDescription>권장가에 대한 부품별 기여 비율입니다.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        {items.map((item) => (
          <div key={item.name} className="space-y-2">
            <div className="flex items-center justify-between gap-4">
              <p className="text-sm font-medium text-zinc-900">{item.name}</p>
              <p className="text-sm text-zinc-600">
                {formatKrw(item.amountKrw)} · {(item.ratio * 100).toFixed(0)}%
              </p>
            </div>
            <Progress value={item.ratio * 100} />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
