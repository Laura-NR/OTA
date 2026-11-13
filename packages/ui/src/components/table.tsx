import { forwardRef } from 'react';
import type {
  HTMLAttributes,
  ReactNode,
  TableHTMLAttributes,
  TdHTMLAttributes,
  ThHTMLAttributes,
} from 'react';

import { cn } from '../cn';

export interface TableProps extends TableHTMLAttributes<HTMLTableElement> {
  /**
   * Names the box the table scrolls in and makes it a keyboard stop, so a
   * table with no controls can still be scrolled by keyboard (WCAG 2.1.1).
   * Pass it where a narrow screen or larger text can make the table scroll.
   */
  scrollRegionLabel?: string;
  /**
   * Classes for the box the table scrolls in, e.g. a scroll padding as wide as
   * a sticky first column, so a focused cell never scrolls under it (WCAG 2.4.11).
   */
  scrollClassName?: string;
}

export const Table = forwardRef<HTMLTableElement, TableProps>(
  ({ className, scrollRegionLabel, scrollClassName, ...props }, ref) => (
    <div
      className={cn(
        'relative w-full overflow-auto',
        // inset, so a rounded box that clips its content keeps the ring
        scrollRegionLabel ? 'focus-visible:outline-offset-[-2px]' : null,
        scrollClassName,
      )}
      {...(scrollRegionLabel
        ? { role: 'region', 'aria-label': scrollRegionLabel, tabIndex: 0 }
        : {})}
    >
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

export interface ResponsiveTableColumn {
  /** The header, and the label beside each of this column's values on a phone. */
  label: ReactNode;
  /** Classes for this column's header and cells from sm up, e.g. `text-right`. */
  className?: string;
  /** Classes for this column's cells only, e.g. `font-mono`. */
  cellClassName?: string;
}

export interface ResponsiveTableRow {
  key: string;
  /** One per column; the first is the row's key field. */
  cells: ReactNode[];
}

export interface ResponsiveTableProps {
  columns: ResponsiveTableColumn[];
  rows: ResponsiveTableRow[];
  caption?: ReactNode;
  scrollRegionLabel?: string;
  className?: string;
}

/**
 * A data table whose rows become stacked cards under sm (DS 05 "Data tables",
 * DS-Responsive "Tables"): the first cell leads each card as its key field and
 * the others follow as label : value pairs, so a phone never scrolls the table
 * sideways. From sm up it is the plain table. The roles are explicit because
 * some browsers drop a table's semantics once its display changes, and the
 * phone labels are hidden from assistive technology, which keeps the headers.
 */
export function ResponsiveTable({
  columns,
  rows,
  caption,
  scrollRegionLabel,
  className,
}: ResponsiveTableProps) {
  return (
    <Table
      role="table"
      scrollRegionLabel={scrollRegionLabel}
      className={cn('max-sm:block', className)}
    >
      {caption ? (
        <caption className="caption-top px-3 py-2.5 text-left text-body font-semibold text-default max-sm:block">
          {caption}
        </caption>
      ) : null}
      <TableHeader role="rowgroup" className="max-sm:sr-only">
        <TableRow role="row">
          {columns.map((column, index) => (
            <TableHead
              key={index}
              role="columnheader"
              scope="col"
              className={column.className}
            >
              {column.label}
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody role="rowgroup" className="max-sm:block">
        {rows.map((row) => (
          <TableRow
            key={row.key}
            role="row"
            className="max-sm:flex max-sm:flex-col max-sm:gap-2 max-sm:p-3"
          >
            {row.cells.map((cell, index) =>
              index === 0 ? (
                <TableCell
                  key={index}
                  role="cell"
                  className={cn(
                    columns[index]?.className,
                    columns[index]?.cellClassName,
                    'max-sm:p-0 max-sm:text-left max-sm:text-body max-sm:font-semibold',
                  )}
                >
                  {cell}
                </TableCell>
              ) : (
                <TableCell
                  key={index}
                  role="cell"
                  className={cn(
                    columns[index]?.className,
                    columns[index]?.cellClassName,
                    'max-sm:grid max-sm:grid-cols-[minmax(6rem,2fr)_3fr] max-sm:gap-x-4 max-sm:p-0 max-sm:text-left',
                  )}
                >
                  <span
                    aria-hidden="true"
                    className="whitespace-normal font-sans text-secondary sm:hidden"
                  >
                    {columns[index]?.label}
                  </span>
                  <span className="min-w-0">{cell}</span>
                </TableCell>
              ),
            )}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
