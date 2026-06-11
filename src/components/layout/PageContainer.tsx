import type { ReactNode } from "react";

type PageContainerProps = {
  title: string;
  description: string;
  children: ReactNode;
};

export function PageContainer({ title, description, children }: PageContainerProps) {
  return (
    <main className="mx-auto w-full max-w-6xl px-6 py-8">
      <section className="mb-6 rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-bold text-zinc-900">{title}</h1>
        <p className="mt-2 text-zinc-600">{description}</p>
      </section>
      <section className="grid gap-6">{children}</section>
    </main>
  );
}
