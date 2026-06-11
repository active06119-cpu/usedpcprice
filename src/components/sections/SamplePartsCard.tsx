import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type SamplePart = {
  id: string;
  fullName: string;
  category: string;
};

type SamplePartsCardProps = {
  parts: SamplePart[];
};

export function SamplePartsCard({ parts }: SamplePartsCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>샘플 부품 리스트</CardTitle>
        <CardDescription>현재 DB에서 조회되는 부품 예시입니다.</CardDescription>
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
