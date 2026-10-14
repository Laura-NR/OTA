import type { ReactNode } from 'react';

/** An A-Dashboard figure card: the overline, then the figure and its notes. */
export function KpiCard({
  overline,
  children,
}: {
  overline: string;
  children: ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-2.5 rounded-lg border bg-surface px-5 py-4">
      <p className="text-overline uppercase text-primary-600">{overline}</p>
      {children}
    </div>
  );
}
