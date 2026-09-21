import ExcelJS from 'exceljs';
import { Readable } from 'node:stream';

export interface ParsedTable {
  columns: string[];
  rows: Record<string, string>[];
}

function sheetToTable(worksheet: ExcelJS.Worksheet): ParsedTable {
  const columns: string[] = [];
  const header = worksheet.getRow(1);
  for (let index = 1; index <= worksheet.columnCount; index += 1) {
    columns.push(header.getCell(index).text.trim());
  }

  const rows: Record<string, string>[] = [];
  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) {
      return;
    }
    const record: Record<string, string> = {};
    columns.forEach((column, index) => {
      record[column] = row.getCell(index + 1).text.trim();
    });
    rows.push(record);
  });

  return { columns, rows };
}

/**
 * Parse a CSV or XLSX upload into headers plus rows keyed by header name. The
 * first worksheet wins; the first row is treated as the header row.
 */
export async function parseTabular(filename: string, data: Buffer): Promise<ParsedTable> {
  const workbook = new ExcelJS.Workbook();
  const lower = filename.toLowerCase();

  if (lower.endsWith('.csv')) {
    await workbook.csv.read(Readable.from(data));
  } else if (lower.endsWith('.xlsx')) {
    await workbook.xlsx.load(data as never);
  } else {
    throw new Error('Unsupported file type: expected .csv or .xlsx');
  }

  const worksheet = workbook.worksheets[0];
  if (!worksheet) {
    return { columns: [], rows: [] };
  }
  return sheetToTable(worksheet);
}
