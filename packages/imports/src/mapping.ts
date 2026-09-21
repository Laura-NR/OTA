import type { ZodType } from 'zod';

/** Maps an internal field name to the source column header. */
export type ColumnMapping = Record<string, string>;

export interface ImportRowError {
  /** Spreadsheet row number (1-based, header is row 1). */
  row: number;
  message: string;
}

export interface MappedRecord<T> {
  row: number;
  value: T;
}

export interface MapAndValidateResult<T> {
  records: MappedRecord<T>[];
  errors: ImportRowError[];
}

/** Project a source row onto internal field names using the mapping. */
export function buildRecord(
  row: Record<string, string>,
  mapping: ColumnMapping,
): Record<string, string> {
  const record: Record<string, string> = {};
  for (const [target, source] of Object.entries(mapping)) {
    const raw = row[source];
    if (raw !== undefined && raw !== '') {
      record[target] = raw;
    }
  }
  return record;
}

/**
 * Apply the mapping to every row and validate with the given schema. Rows that
 * fail validation are reported with their spreadsheet row number; no partial
 * writes happen in this function.
 */
export function mapAndValidate<T>(
  rows: readonly Record<string, string>[],
  mapping: ColumnMapping,
  schema: ZodType<T>,
): MapAndValidateResult<T> {
  const records: MappedRecord<T>[] = [];
  const errors: ImportRowError[] = [];

  rows.forEach((row, index) => {
    const rowNumber = index + 2;
    const result = schema.safeParse(buildRecord(row, mapping));
    if (result.success) {
      records.push({ row: rowNumber, value: result.data });
    } else {
      errors.push({
        row: rowNumber,
        message: result.error.issues
          .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
          .join('; '),
      });
    }
  });

  return { records, errors };
}
