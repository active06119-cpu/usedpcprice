import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type AliasPreview = {
  id: string;
  alias: string;
  part: { fullName: string };
};

type AliasPreviewCardProps = {
  aliases: AliasPreview[];
};

export function AliasPreviewCard({ aliases }: AliasPreviewCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>최근 alias 샘플</CardTitle>
        <CardDescription>파싱에 활용되는 alias 예시입니다.</CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="grid gap-2 md:grid-cols-2">
          {aliases.map((item) => (
            <li key={item.id} className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-700">
              <span className="font-medium">{item.alias}</span> → {item.part.fullName}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
