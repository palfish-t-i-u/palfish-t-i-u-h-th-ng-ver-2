import type { ReactNode } from "react";

interface Props {
  title: string;
  subtitle?: string;
  children?: ReactNode;
}

export default function PageSection({ title, subtitle, children }: Props) {
  return (
    <section className="mb-6">
      <h2 className="text-lg font-semibold text-gmv-text-strong">{title}</h2>
      {subtitle && <p className="mt-1 text-sm text-gmv-muted">{subtitle}</p>}
      {children}
    </section>
  );
}
