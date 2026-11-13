import type { ReactNode } from 'react';

export interface PageHeaderProps {
  title: string;
  description?: string;
  children?: ReactNode;
}

export function PageHeader({ title, description, children }: PageHeaderProps) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-h3 font-semibold tracking-tight">{title}</h1>
        {description ? <p className="text-body-sm text-muted">{description}</p> : null}
      </div>
      {children}
    </div>
  );
}
