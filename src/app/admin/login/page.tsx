"use client";

import { FormEvent, Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextPath = searchParams.get("next") || "/admin";
  const missing = searchParams.get("reason") === "missing-token";

  const [token, setToken] = useState("");
  const [error, setError] = useState(
    missing ? "서버에 ADMIN_API_TOKEN이 설정되어 있지 않습니다." : "",
  );
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/admin/login", {
        credentials: "include",
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const data = (await res.json()) as { message?: string };
      if (!res.ok) {
        setError(data.message ?? "로그인에 실패했습니다.");
        return;
      }
      router.replace(nextPath.startsWith("/admin") ? nextPath : "/admin");
      router.refresh();
    } catch {
      setError("로그인에 실패했습니다.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-[70vh] max-w-md items-center px-4">
      <form onSubmit={onSubmit} className="w-full rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
        <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">Admin</p>
        <h1 className="mt-1 text-xl font-semibold text-zinc-900">관리자 로그인</h1>
        <p className="mt-2 text-sm text-zinc-600">서버에 설정한 ADMIN_API_TOKEN을 입력하세요.</p>
        <label className="mt-5 block text-sm font-medium text-zinc-700" htmlFor="admin-token">
          토큰
        </label>
        <input
          id="admin-token"
          type="password"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-emerald-500"
          autoComplete="current-password"
          required
        />
        {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
        <button
          type="submit"
          disabled={loading}
          className="mt-5 w-full rounded-lg bg-zinc-900 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-60"
        >
          {loading ? "확인 중..." : "로그인"}
        </button>
      </form>
    </main>
  );
}

export default function AdminLoginPage() {
  return (
    <Suspense fallback={<main className="p-8 text-sm text-zinc-500">로딩 중...</main>}>
      <LoginForm />
    </Suspense>
  );
}
