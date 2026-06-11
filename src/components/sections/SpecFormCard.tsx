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
import { Textarea } from "@/components/ui/textarea";
import { sellerValuationSchema, type SellerValuationInput } from "@/lib/schemas";

export function SpecFormCard() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const form = useForm<SellerValuationInput>({
    resolver: zodResolver(sellerValuationSchema),
    defaultValues: {
      specsText: "",
      condition: "GOOD",
    },
  });

  async function onSubmit(values: SellerValuationInput) {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch("/api/valuation/seller", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      const data = (await res.json()) as { ok: boolean; valuationRunId?: string; message?: string };
      if (!res.ok || !data.ok || !data.valuationRunId) {
        setError(data.message ?? "판매자 시세 계산에 실패했습니다.");
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
        <CardTitle>판매자 입력</CardTitle>
        <CardDescription>입력값을 바탕으로 실제 valuation run을 생성합니다.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="grid gap-2">
          <Label htmlFor="seller-specs">부품 스펙</Label>
          <Textarea id="seller-specs" placeholder="예) i5-12400F / RTX 3070 / 램32 / NVMe 1TB" aria-describedby="seller-specs-help" {...form.register("specsText")} />
          <p id="seller-specs-help" className="text-xs text-zinc-500">
            줄바꿈 또는 슬래시(/)로 구분해 입력하세요.
          </p>
          {form.formState.errors.specsText ? (
            <p className="text-xs text-red-600">{form.formState.errors.specsText.message}</p>
          ) : null}
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          <div className="grid gap-2">
            <Label htmlFor="seller-condition">상태</Label>
            <Select id="seller-condition" {...form.register("condition")}>
              <option value="NEW">최상</option>
              <option value="LIKE_NEW">양호+</option>
              <option value="GOOD">양호</option>
              <option value="FAIR">보통</option>
              <option value="POOR">사용감 많음</option>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="seller-age">사용 개월 수</Label>
            <Input
              id="seller-age"
              type="number"
              min={0}
              placeholder="예: 18"
              {...form.register("monthsUsed", {
                setValueAs: (v) => (v === "" ? undefined : Number(v)),
              })}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="seller-warranty">보증 여부</Label>
            <Select
              id="seller-warranty"
              {...form.register("hasWarranty", {
                setValueAs: (v) => (v === "" ? undefined : v === "yes"),
              })}
            >
              <option value="" disabled>
                보증 상태 선택
              </option>
              <option value="yes">남아있음</option>
              <option value="no">없음</option>
            </Select>
          </div>
        </div>
        <div className="grid gap-2 md:max-w-sm">
          <Label htmlFor="seller-asking">희망 판매가(선택)</Label>
          <Input
            id="seller-asking"
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
          {loading ? "계산 중..." : "가격 추정 보기"}
        </Button>
      </CardContent>
    </Card>
  );
}
