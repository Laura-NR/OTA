'use client';

import { Button } from '@ota/ui';

/** Opens the browser's print dialog for the page (the worker app card). */
export function PrintButton({ label }: { label: string }) {
  return (
    <Button variant="secondary" className="print:hidden" onClick={() => window.print()}>
      {label}
    </Button>
  );
}
