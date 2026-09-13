"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

function SideRail() {
  return <aside className="hidden w-[160px] shrink-0 xl:block" />;
}

export function PublicShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const hideRails = pathname.startsWith("/admin");

  if (hideRails) return <>{children}</>;

  return (
    <div className="mx-auto flex w-full max-w-[1280px] items-start justify-center gap-4 px-3 py-4 sm:gap-5 sm:px-6 sm:py-6">
      <SideRail />
      <div className="min-w-0 flex-1">{children}</div>
      <SideRail />
    </div>
  );
}
