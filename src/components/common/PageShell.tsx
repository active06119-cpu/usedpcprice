import type { ReactNode } from "react";

import { PageContainer } from "@/components/layout/PageContainer";
import { SiteHeader } from "@/components/layout/SiteHeader";

type PageShellProps = {
  title: string;
  description: string;
  children: ReactNode;
};

export function PageShell({ title, description, children }: PageShellProps) {
  return (
    <div className="min-h-screen bg-zinc-100">
      <SiteHeader />
      <PageContainer title={title} description={description}>
        {children}
      </PageContainer>
    </div>
  );
}
