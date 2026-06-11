import { AlertTriangle } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type WarningsPanelProps = {
  warnings: string[];
};

export function WarningsPanel({ warnings }: WarningsPanelProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>주의사항</CardTitle>
        <CardDescription>입력 정보가 부족하거나 모호한 항목입니다.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        {warnings.map((warning) => (
          <Alert key={warning} className="border-amber-200 bg-amber-50">
            <AlertTitle className="flex items-center gap-2 text-amber-800">
              <AlertTriangle className="h-4 w-4" />
              확인 필요
            </AlertTitle>
            <AlertDescription className="text-amber-700">{warning}</AlertDescription>
          </Alert>
        ))}
      </CardContent>
    </Card>
  );
}
