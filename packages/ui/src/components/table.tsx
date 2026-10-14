import { forwardRef } from 'react';
import type {
  HTMLAttributes,
  TableHTMLAttributes,
  TdHTMLAttributes,
  ThHTMLAttributes,
} from 'react';

import { cn } from '../cn';

export const Table = forwardRef<HTMLTableElement, TableHTMLAttributes<HTMLTableElement>>(
  ({ className, ...props }, ref) => (
    <div className="relative w-full overflow-auto">
      <table
        ref={ref}
        className={cn('w-full caption-bottom text-body-sm', className)}
        {...props}
      />
    </div>
  ),
);
Table.displayName = 'Table';

export const TableHeader = forwardRef<
  HTMLTableSectionElement,
  HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <thead ref={ref} className={cn('[&_tr]:border-b', className)} {...props} />
));
TableHeader.displayName = 'TableHeader';

export const TableBody = forwardRef<
  HTMLTableSectionElement,
  HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <tbody ref={ref} className={cn('[&_tr:last-child]:border-0', className)} {...props} />
));
TableBody.displayName = 'TableBody';

/**
 * Admin row tints (A-Bookings, A-Content): `attention` is the ochre wash for a
 * row whose timer runs low or that needs someone to act, `destructive` the red
 * wash for an expired or failed one. The tint is never the only signal: the
 * row also carries a status badge or a `-700` timer text.
 */
export type TableRowTone = 'attention' | 'destructive';

export interface TableRowProps extends HTMLAttributes<HTMLTableRowElement> {
  tone?: TableRowTone;
}

const rowTones: Record<TableRowTone, string> = {
  attention: 'bg-accent-50',
  destructive: 'bg-error-100',
};

export const TableRow = forwardRef<HTMLTableRowElement, TableRowProps>(
  ({ className, tone, ...props }, ref) => (
    <tr
      ref={ref}
      className={cn(
        'border-b transition-colors hover:bg-page data-[state=selected]:bg-primary-100',
        tone && rowTones[tone],
        className,
      )}
      {...props}
    />
  ),
);
TableRow.displayName = 'TableRow';

export const TableHead = forwardRef<
  HTMLTableCellElement,
  ThHTMLAttributes<HTMLTableCellElement>
>(({ className, ...props }, ref) => (
  <th
    ref={ref}
    className={cn(
      'bg-sunken px-3 py-2.5 text-left align-middle font-semibold text-secondary',
      className,
    )}
    {...props}
  />
));
TableHead.displayName = 'TableHead';

export const TableCell = forwardRef<
  HTMLTableCellElement,
  TdHTMLAttributes<HTMLTableCellElement>
>(({ className, ...props }, ref) => (
  <td ref={ref} className={cn('p-3 align-middle', className)} {...props} />
));
TableCell.displayName = 'TableCell';
