"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

function SideRail() {
  return <aside className="hidden w-[160px] shrink-0 2xl:block" />;
}

export function PublicShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const hideRails = pathname.startsWith("/admin");

  if (hideRails) return <>{children}</>;

  return (
    <div className="mx-auto flex w-full max-w-[1440px] items-start justify-center gap-6 px-4 py-6 sm:px-8 sm:py-8">
      <SideRail />
      <div className="min-w-0 flex-1">{children}</div>
      <SideRail />
    </div>
  );
}
