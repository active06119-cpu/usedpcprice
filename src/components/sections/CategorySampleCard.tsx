import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type PartSample = {
  id: string;
  fullName: string;
  category: string;
};

type CategorySampleCardProps = {
  parts: PartSample[];
};

export function CategorySampleCard({ parts }: CategorySampleCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>카테고리별 샘플 부품</CardTitle>
        <CardDescription>GPU/CPU/RAM/SSD 기준 미리보기입니다.</CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="grid gap-2 md:grid-cols-2">
          {parts.map((part) => (
            <li key={part.id} className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-700">
              {part.fullName} ({part.category})
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
