import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type ExplanationPanelProps = {
  bullets: string[];
};

export function ExplanationPanel({ bullets }: ExplanationPanelProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>추정 근거</CardTitle>
        <CardDescription>가격 계산에 반영된 핵심 요인입니다.</CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="grid gap-2">
          {bullets.map((item) => (
            <li key={item} className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-700">
              {item}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
