import { BadgeCheck, Database } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type DataStatusCardProps = {
  title?: string;
  description?: string;
  parts: number;
  snapshots: number;
  lastImportAt: Date | null;
};

export function DataStatusCard({
  title = "DB 연결 상태",
  description = "Supabase에 적재된 시드 데이터 기준입니다.",
  parts,
  snapshots,
  lastImportAt,
}: DataStatusCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Database className="h-5 w-5" />
          {title}
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4">
            <p className="text-xs text-zinc-500">정규화 부품</p>
            <p className="mt-1 text-lg font-semibold text-zinc-900">{parts}</p>
          </div>
          <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4">
            <p className="text-xs text-zinc-500">시세 거래 데이터</p>
            <p className="mt-1 text-lg font-semibold text-zinc-900">{snapshots}</p>
          </div>
          <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4">
            <p className="text-xs text-zinc-500">마지막 수집 시각</p>
            <p className="mt-1 text-sm font-semibold text-zinc-900">
              {lastImportAt ? lastImportAt.toLocaleString("ko-KR") : "기록 없음"}
            </p>
          </div>
        </div>
        <p className="mt-4 flex items-center gap-2 text-sm text-zinc-600">
          <BadgeCheck className="h-4 w-4" />
          DB 연결이 정상이며 API 조회가 가능합니다.
        </p>
      </CardContent>
    </Card>
  );
}
