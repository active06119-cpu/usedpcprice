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
import { Select } from "@/components/ui/select";
import { partValuationSchema, type PartValuationInput } from "@/lib/schemas";

export function SinglePartCard() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const form = useForm<PartValuationInput>({
    resolver: zodResolver(partValuationSchema),
    defaultValues: {
      modelName: "",
      condition: "GOOD",
    },
  });

  async function onSubmit(values: PartValuationInput) {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch("/api/valuation/part", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      const data = (await res.json()) as { ok: boolean; valuationRunId?: string; message?: string };
      if (!res.ok || !data.ok || !data.valuationRunId) {
        setError(data.message ?? "단일 부품 시세 계산에 실패했습니다.");
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
        <CardTitle>단일 부품 입력</CardTitle>
        <CardDescription>모델명이 정확할수록 추정 신뢰도가 높아집니다.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 md:grid-cols-2">
        <div className="grid gap-2 md:col-span-2">
          <Label htmlFor="part-name">부품명 / 모델명</Label>
          <Input
            id="part-name"
            placeholder="예) RTX 3070, Ryzen 5 5600, DDR4 16GBx2"
            {...form.register("modelName")}
          />
          {form.formState.errors.modelName ? (
            <p className="text-xs text-red-600">{form.formState.errors.modelName.message}</p>
          ) : null}
        </div>
        <div className="grid gap-2">
          <Label htmlFor="part-condition">상태</Label>
          <Select id="part-condition" {...form.register("condition")}>
            <option value="NEW">최상</option>
            <option value="LIKE_NEW">양호+</option>
            <option value="GOOD">양호</option>
            <option value="FAIR">보통</option>
            <option value="POOR">사용감 많음</option>
          </Select>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="part-age">사용 개월 수</Label>
          <Input
            id="part-age"
            type="number"
            min={0}
            placeholder="예: 12"
            {...form.register("monthsUsed", {
              setValueAs: (v) => (v === "" ? undefined : Number(v)),
            })}
          />
        </div>
        {error ? <p className="md:col-span-2 text-sm text-red-600">{error}</p> : null}
        <Button className="md:col-span-2" onClick={form.handleSubmit(onSubmit)} disabled={loading}>
          {loading ? "계산 중..." : "부품 가격 추정 보기"}
        </Button>
      </CardContent>
    </Card>
  );
}
