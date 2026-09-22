'use client';

import { Alert, Button, Input, Label } from '@ota/ui';
import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import type { FormEvent } from 'react';

import { apiRequest } from '@/lib/client-api';
import { readBase64 } from '@/lib/files';

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];

export interface SupplierCredentialProps {
  supplierId: string;
  hasCredential: boolean;
  contentType: string | null;
  canEdit: boolean;
}

/**
 * Visual document inspector (spec §4.5): renders the uploaded credential and
 * lets an operator replace it. The private object is served through an
 * authorised same-origin route.
 */
export function SupplierCredential({
  supplierId,
  hasCredential,
  contentType,
  canEdit,
}: SupplierCredentialProps) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const credentialUrl = `/api/ota/suppliers/${supplierId}/credential`;

  async function onUpload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const file = fileRef.current?.files?.[0];
    if (!file) {
      setError('Choose a file to upload.');
      return;
    }
    if (!ALLOWED_TYPES.includes(file.type)) {
      setError('Use a JPEG, PNG, WebP, or PDF file.');
      return;
    }

    const expiresAt = (
      event.currentTarget.elements.namedItem('expiresAt') as HTMLInputElement | null
    )?.value;

    setBusy(true);
    setError(null);
    try {
      const contentBase64 = await readBase64(file);
      await apiRequest(`/suppliers/${supplierId}/credential`, {
        method: 'POST',
        body: JSON.stringify({
          filename: file.name,
          contentType: file.type,
          contentBase64,
          ...(expiresAt ? { expiresAt } : {}),
        }),
      });
      if (fileRef.current) {
        fileRef.current.value = '';
      }
      router.refresh();
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : 'Upload failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      {hasCredential ? (
        <div className="space-y-2">
          {contentType?.startsWith('image/') ? (
            <img
              src={credentialUrl}
              alt="Supplier credential"
              className="max-h-96 rounded-md border"
            />
          ) : (
            <iframe
              src={credentialUrl}
              title="Supplier credential"
              className="h-96 w-full rounded-md border"
            />
          )}
          <a
            className="inline-block text-sm font-medium text-primary underline-offset-4 hover:underline"
            href={credentialUrl}
            target="_blank"
            rel="noreferrer"
          >
            Open in a new tab
          </a>
        </div>
      ) : (
        <Alert>No credential document on file.</Alert>
      )}

      {canEdit ? (
        <form className="space-y-3" onSubmit={onUpload}>
          <div className="space-y-2">
            <Label htmlFor="credential-file">
              Upload credential (Formatur / licence / RTN)
            </Label>
            <Input
              id="credential-file"
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,application/pdf"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="credential-expiry">Expires on (optional)</Label>
            <Input id="credential-expiry" name="expiresAt" type="date" />
          </div>
          {error ? <Alert variant="destructive">{error}</Alert> : null}
          <Button type="submit" disabled={busy}>
            {busy ? 'Uploading…' : 'Upload'}
          </Button>
        </form>
      ) : null}
    </div>
  );
}
