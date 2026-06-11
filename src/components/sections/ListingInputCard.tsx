/* eslint-disable react/no-unescaped-entities */
"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { buyerValuationSchema, type BuyerValuationInput } from "@/lib/schemas";

export function ListingInputCard() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const form = useForm<BuyerValuationInput>({
    resolver: zodResolver(buyerValuationSchema),
    defaultValues: {
      bodyText: "",
    },
  });

  async function onSubmit(values: BuyerValuationInput) {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch("/api/valuation/buyer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      const data = (await res.json()) as { ok: boolean; valuationRunId?: string; message?: string };
      if (!res.ok || !data.ok || !data.valuationRunId) {
        setError(data.message ?? "구매자 분석에 실패했습니다.");
        return;
      }
      router.push(`/results?id=${data.valuationRunId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "요청 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>판매글 입력</CardTitle>
        <CardDescription>한국어/영문 혼용 텍스트를 기준으로 스펙 추출 및 가격 비교를 준비합니다.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="grid gap-2">
          <Label htmlFor="buyer-url">판매글 URL (선택)</Label>
          <Input
            id="buyer-url"
            type="url"
            placeholder="https://..."
            {...form.register("sourceUrl")}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="buyer-body">판매글 본문</Label>
          <Textarea
            id="buyer-body"
            className="min-h-36"
            placeholder="예) 5600 / 글카 3070 / 램32 / 1테라 / 85만원"
            {...form.register("bodyText")}
          />
          {form.formState.errors.bodyText ? (
            <p className="text-xs text-red-600">{form.formState.errors.bodyText.message}</p>
          ) : null}
        </div>
        <div className="grid gap-2 md:max-w-sm">
          <Label htmlFor="buyer-asking">요청 판매가 (선택)</Label>
          <Input
            id="buyer-asking"
            type="number"
            min={0}
            placeholder="예: 850000"
            {...form.register("askingPriceKrw", {
              setValueAs: (v) => (v === "" ? undefined : Number(v)),
            })}
          />
        </div>
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        <Button onClick={form.handleSubmit(onSubmit)} disabled={loading}>
          {loading ? "분석 중..." : "적정성 분석 보기"}
        </Button>
      </CardContent>
    </Card>
  );
}
