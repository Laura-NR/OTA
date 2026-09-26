'use client';

import type { InventoryMediaDto } from '@ota/schemas';
import { Alert, Button, Input, Label } from '@ota/ui';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import type { FormEvent } from 'react';

import { apiRequest } from '@/lib/client-api';
import { readBase64 } from '@/lib/files';

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

/** Catalog image gallery for one item (spec §4.6 supplier & asset management). */
export function InventoryMediaManager({
  inventoryItemId,
  media,
}: {
  inventoryItemId: string;
  media: InventoryMediaDto[];
}) {
  const t = useTranslations('backoffice.media');
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onUpload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const file = fileRef.current?.files?.[0];
    if (!file) {
      setError(t('chooseImage'));
      return;
    }
    if (!ALLOWED_TYPES.includes(file.type)) {
      setError(t('useImageType'));
      return;
    }

    const altText = (
      event.currentTarget.elements.namedItem('altText') as HTMLInputElement | null
    )?.value;

    setBusy(true);
    setError(null);
    try {
      const contentBase64 = await readBase64(file);
      await apiRequest(`/inventory/${inventoryItemId}/media`, {
        method: 'POST',
        body: JSON.stringify({
          contentType: file.type,
          contentBase64,
          ...(altText ? { altText } : {}),
        }),
      });
      if (fileRef.current) {
        fileRef.current.value = '';
      }
      router.refresh();
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : t('uploadFailed'));
    } finally {
      setBusy(false);
    }
  }

  async function remove(mediaId: string) {
    setBusy(true);
    setError(null);
    try {
      await apiRequest(`/inventory/${inventoryItemId}/media/${mediaId}`, {
        method: 'DELETE',
      });
      router.refresh();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : t('removeFailed'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      {media.length === 0 ? (
        <Alert>{t('none')}</Alert>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-3">
          {media.map((image) => (
            <li key={image.id} className="space-y-2 rounded-md border p-2">
              <img
                src={`/api/ota/inventory/media/${image.id}`}
                alt={image.altText ?? t('catalogImage')}
                className="h-32 w-full rounded object-cover"
              />
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-xs text-muted-foreground">
                  {image.altText ?? t('imageN', { position: image.position + 1 })}
                </span>
                <Button
                  size="sm"
                  variant="destructive"
                  disabled={busy}
                  onClick={() => remove(image.id)}
                >
                  {t('remove')}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <form className="space-y-3 border-t pt-4" onSubmit={onUpload}>
        <div className="space-y-2">
          <Label htmlFor="media-file">{t('uploadLabel')}</Label>
          <Input
            id="media-file"
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="media-alt">{t('altText')}</Label>
          <Input id="media-alt" name="altText" placeholder={t('altPlaceholder')} />
        </div>
        {error ? <Alert variant="destructive">{error}</Alert> : null}
        <Button type="submit" disabled={busy}>
          {busy ? t('uploading') : t('uploadImage')}
        </Button>
      </form>
    </div>
  );
}
