import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { mapAndValidate, parseTabular } from '../src';

const csv = [
  'Hotel Name,Category,Province,Price',
  'Casa Colonial,ACCOMMODATION,La Habana,120',
  'Vintage Ride,TRANSPORT,La Habana,80',
].join('\n');

const rowSchema = z.object({
  name: z.string().min(1),
  type: z.enum(['ACCOMMODATION', 'TRANSPORT', 'EXPERIENCE']),
  province: z.string().optional(),
  basePrice: z.coerce.number().nonnegative(),
});

describe('parseTabular', () => {
  it('parses CSV into columns and rows', async () => {
    const table = await parseTabular('grid.csv', Buffer.from(csv));

    expect(table.columns).toEqual(['Hotel Name', 'Category', 'Province', 'Price']);
    expect(table.rows).toHaveLength(2);
    expect(table.rows[0]?.['Hotel Name']).toBe('Casa Colonial');
  });

  it('parses XLSX into columns and rows', async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('grid');
    sheet.addRow(['Hotel Name', 'Price']);
    sheet.addRow(['Eco Villa', 200]);
    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());

    const table = await parseTabular('grid.xlsx', buffer);

    expect(table.columns).toEqual(['Hotel Name', 'Price']);
    expect(table.rows[0]?.['Price']).toBe('200');
  });

  it('rejects unsupported file types', async () => {
    await expect(parseTabular('grid.txt', Buffer.from('x'))).rejects.toThrowError(
      /Unsupported file type/,
    );
  });
});

describe('mapAndValidate', () => {
  const mapping = {
    name: 'Hotel Name',
    type: 'Category',
    province: 'Province',
    basePrice: 'Price',
  };

  it('maps and validates every row', async () => {
    const table = await parseTabular('grid.csv', Buffer.from(csv));

    const { records, errors } = mapAndValidate(table.rows, mapping, rowSchema);

    expect(errors).toHaveLength(0);
    expect(records).toHaveLength(2);
    expect(records[0]?.value.basePrice).toBe(120);
  });

  it('reports invalid rows with their spreadsheet row number', () => {
    const rows = [
      { 'Hotel Name': 'Good', Category: 'ACCOMMODATION', Price: '100' },
      { 'Hotel Name': '', Category: 'MADE_UP', Price: '-5' },
    ];

    const { records, errors } = mapAndValidate(rows, mapping, rowSchema);

    expect(records).toHaveLength(1);
    expect(errors).toHaveLength(1);
    expect(errors[0]?.row).toBe(3);
  });
});
