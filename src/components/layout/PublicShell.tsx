"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

function AdRail({ side }: { side: "left" | "right" }) {
  return (
    <aside
      className="hidden w-[160px] shrink-0 xl:block"
      aria-label={side === "left" ? "왼쪽 광고" : "오른쪽 광고"}
    >
      <div className="sticky top-16 flex h-[600px] items-center justify-center border border-zinc-200 bg-zinc-100 text-center text-[11px] leading-5 text-zinc-400">
        광고
        <br />
        160×600
      </div>
    </aside>
  );
}

export function PublicShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const hideRails = pathname.startsWith("/admin");

  if (hideRails) return <>{children}</>;

  return (
    <div className="mx-auto flex w-full max-w-[1280px] items-start justify-center gap-5 px-4 py-5 sm:px-6">
      <AdRail side="left" />
      <div className="min-w-0 flex-1">{children}</div>
      <AdRail side="right" />
    </div>
  );
}
