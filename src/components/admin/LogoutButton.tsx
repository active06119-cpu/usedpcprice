"use client";

export function LogoutButton() {
  return (
    <button
      type="button"
      className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-50"
      onClick={async () => {
        await fetch("/api/admin/logout", { method: "POST" });
        window.location.href = "/admin/login";
      }}
    >
      로그아웃
    </button>
  );
}
