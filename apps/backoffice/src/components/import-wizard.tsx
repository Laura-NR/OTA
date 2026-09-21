'use client';

import type { ImportCommitResultDto, ImportPreviewDto } from '@ota/schemas';
import {
  Alert,
  Button,
  Input,
  Label,
  Select,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@ota/ui';
import { useState } from 'react';
import type { ChangeEvent } from 'react';

import { apiRequest } from '@/lib/client-api';
import { ApiError } from '@/lib/errors';

const TARGET_FIELDS = [
  { key: 'type', label: 'Type', required: true },
  { key: 'name', label: 'Name', required: true },
  { key: 'basePrice', label: 'Base price', required: true },
  { key: 'province', label: 'Province', required: false },
  { key: 'description', label: 'Description', required: false },
  { key: 'currency', label: 'Currency', required: false },
] as const;

interface RowError {
  row: number;
  message: string;
}

function readBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read the file'));
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== 'string') {
        reject(new Error('Could not read the file'));
        return;
      }
      const comma = result.indexOf(',');
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.readAsDataURL(file);
  });
}

function guessMapping(columns: string[]): Record<string, string> {
  const mapping: Record<string, string> = {};
  for (const field of TARGET_FIELDS) {
    const normalized = field.key.toLowerCase();
    const match = columns.find(
      (column) => column.toLowerCase().replace(/[^a-z]/g, '') === normalized,
    );
    if (match) {
      mapping[field.key] = match;
    }
  }
  return mapping;
}

export function ImportWizard() {
  const [preview, setPreview] = useState<ImportPreviewDto | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [result, setResult] = useState<ImportCommitResultDto | null>(null);
  const [rowErrors, setRowErrors] = useState<RowError[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<'upload' | 'commit' | null>(null);

  async function onUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    setError(null);
    setResult(null);
    setRowErrors([]);
    setPreview(null);
    setBusy('upload');

    try {
      const contentBase64 = await readBase64(file);
      const response = await apiRequest<ImportPreviewDto>('/imports', {
        method: 'POST',
        body: JSON.stringify({ filename: file.name, contentBase64 }),
      });
      setPreview(response);
      setMapping(guessMapping(response.columns));
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : 'Upload failed');
    } finally {
      setBusy(null);
      event.target.value = '';
    }
  }

  async function onCommit() {
    if (!preview) {
      return;
    }
    setBusy('commit');
    setError(null);
    setRowErrors([]);

    try {
      const response = await apiRequest<ImportCommitResultDto>(
        `/imports/${preview.batchId}/commit`,
        { method: 'POST', body: JSON.stringify({ mapping }) },
      );
      setResult(response);
    } catch (commitError) {
      if (commitError instanceof ApiError && commitError.status === 422) {
        const details = commitError.details as { errors?: RowError[] } | undefined;
        setRowErrors(details?.errors ?? []);
      } else {
        setError(commitError instanceof Error ? commitError.message : 'Commit failed');
      }
    } finally {
      setBusy(null);
    }
  }

  const missingRequired = TARGET_FIELDS.some(
    (field) => field.required && !mapping[field.key],
  );

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Label htmlFor="import-file">Spreadsheet (.csv or .xlsx)</Label>
        <Input
          id="import-file"
          type="file"
          accept=".csv,.xlsx"
          disabled={busy === 'upload'}
          onChange={onUpload}
        />
        <p className="text-xs text-muted-foreground">
          The file is read in the browser and sent as base64; nothing is stored until you
          commit.
        </p>
      </div>

      {error ? <Alert variant="destructive">{error}</Alert> : null}

      {preview ? (
        <div className="space-y-4">
          <Alert>
            {preview.filename}: {preview.rowCount} row(s), {preview.columns.length}{' '}
            column(s).
          </Alert>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {TARGET_FIELDS.map((field) => (
              <div key={field.key} className="space-y-1">
                <Label htmlFor={`mapping-${field.key}`}>
                  {field.label}
                  {field.required ? ' *' : ''}
                </Label>
                <Select
                  id={`mapping-${field.key}`}
                  value={mapping[field.key] ?? ''}
                  onChange={(event) =>
                    setMapping((current) => ({
                      ...current,
                      [field.key]: event.target.value,
                    }))
                  }
                >
                  <option value="">— not mapped —</option>
                  {preview.columns.map((column) => (
                    <option key={column} value={column}>
                      {column}
                    </option>
                  ))}
                </Select>
              </div>
            ))}
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                {preview.columns.map((column) => (
                  <TableHead key={column}>{column}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {preview.preview.map((row, index) => (
                <TableRow key={index}>
                  {preview.columns.map((column) => (
                    <TableCell key={column}>{row[column] ?? ''}</TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>

          <Button onClick={onCommit} disabled={busy === 'commit' || missingRequired}>
            {busy === 'commit' ? 'Committing…' : 'Commit import'}
          </Button>
        </div>
      ) : null}

      {result ? (
        <Alert variant="success">
          Imported {result.importedCount} inventory item(s) from batch {result.batchId}.
        </Alert>
      ) : null}

      {rowErrors.length > 0 ? (
        <Alert variant="destructive">
          <p className="mb-2 font-medium">Validation failed — no rows were imported:</p>
          <ul className="list-inside list-disc space-y-1">
            {rowErrors.map((rowError) => (
              <li key={`${rowError.row}-${rowError.message}`}>
                Row {rowError.row}: {rowError.message}
              </li>
            ))}
          </ul>
        </Alert>
      ) : null}
    </div>
  );
}
