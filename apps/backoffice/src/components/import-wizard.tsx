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
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import type { ChangeEvent } from 'react';

import { apiRequest } from '@/lib/client-api';
import { ApiError } from '@/lib/errors';

const TARGET_FIELDS = [
  { key: 'type', labelKey: 'fieldType', required: true },
  { key: 'name', labelKey: 'fieldName', required: true },
  { key: 'basePrice', labelKey: 'fieldBasePrice', required: true },
  { key: 'province', labelKey: 'fieldProvince', required: false },
  { key: 'description', labelKey: 'fieldDescription', required: false },
  { key: 'currency', labelKey: 'fieldCurrency', required: false },
] as const;

interface RowError {
  row: number;
  message: string;
}

/** Marker for a local file-read failure, so the UI can translate it. */
class ReadError extends Error {}

function readBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new ReadError());
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== 'string') {
        reject(new ReadError());
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
  const t = useTranslations('backoffice.importWizard');
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
      if (uploadError instanceof ReadError) {
        setError(t('readFailed'));
      } else {
        setError(uploadError instanceof Error ? uploadError.message : t('uploadFailed'));
      }
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
        setError(commitError instanceof Error ? commitError.message : t('commitFailed'));
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
        <Label htmlFor="import-file">{t('spreadsheet')}</Label>
        <Input
          id="import-file"
          type="file"
          accept=".csv,.xlsx"
          disabled={busy === 'upload'}
          onChange={onUpload}
        />
        <p className="text-xs text-muted-foreground">{t('hint')}</p>
      </div>

      {error ? <Alert variant="destructive">{error}</Alert> : null}

      {preview ? (
        <div className="space-y-4">
          <Alert>
            {t('summary', {
              filename: preview.filename,
              rows: preview.rowCount,
              columns: preview.columns.length,
            })}
          </Alert>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {TARGET_FIELDS.map((field) => (
              <div key={field.key} className="space-y-1">
                <Label htmlFor={`mapping-${field.key}`}>
                  {t(field.labelKey)}
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
                  <option value="">{t('notMapped')}</option>
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
            {busy === 'commit' ? t('committing') : t('commit')}
          </Button>
        </div>
      ) : null}

      {result ? (
        <Alert variant="success">
          {t('imported', {
            count: result.importedCount,
            batchId: result.batchId,
          })}
        </Alert>
      ) : null}

      {rowErrors.length > 0 ? (
        <Alert variant="destructive">
          <p className="mb-2 font-medium">{t('validationFailed')}</p>
          <ul className="list-inside list-disc space-y-1">
            {rowErrors.map((rowError) => (
              <li key={`${rowError.row}-${rowError.message}`}>
                {t('rowError', { row: rowError.row, message: rowError.message })}
              </li>
            ))}
          </ul>
        </Alert>
      ) : null}
    </div>
  );
}
