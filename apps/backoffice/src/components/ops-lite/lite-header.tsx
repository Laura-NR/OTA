import type { ReactNode } from 'react';

/**
 * An AL-* screen's header: "Ops Lite · Alerts" on primary 700, a primary 200
 * line under it, and the screen's own control on the right (sound, Live).
 */
export function LiteHeader({
  title,
  subtitle,
  aside,
}: {
  title: string;
  subtitle: ReactNode;
  aside?: ReactNode;
}) {
  return (
    <header className="flex items-center gap-2.5 bg-primary-700 px-5 py-3 text-neutral-0">
      <div className="flex min-w-0 flex-1 flex-col">
        <h1 className="font-sans text-body font-bold leading-5 tracking-normal">
          {title}
        </h1>
        <p className="text-caption font-normal text-primary-200">{subtitle}</p>
      </div>
      {aside}
    </header>
  );
}
