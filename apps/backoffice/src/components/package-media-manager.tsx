'use client';

import type { PackageMediaDto } from '@ota/schemas';
import { Alert, Badge, Button, Checkbox, Input, Label } from '@ota/ui';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import type { FormEvent } from 'react';

import { apiRequest } from '@/lib/client-api';
import { readBase64 } from '@/lib/files';

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_BYTES = 5 * 1024 * 1024;

/**
 * A package's photos (A-Package-Edit, M1 `PackageMedia`): the first is the
 * hero, the rest the gallery. Alt text is required, and a photo that shows
 * people needs a consent reference before the package can be published.
 */
export function PackageMediaManager({
  packageId,
  media,
}: {
  packageId: string;
  media: PackageMediaDto[];
}) {
  const t = useTranslations('backoffice.packageMedia');
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [showsPeople, setShowsPeople] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onUpload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const element = event.currentTarget;
    const file = fileRef.current?.files?.[0];
    if (!file) {
      setError(t('chooseImage'));
      return;
    }
    if (!ALLOWED_TYPES.includes(file.type)) {
      setError(t('useImageType'));
      return;
    }
    if (file.size > MAX_BYTES) {
      setError(t('tooLarge'));
      return;
    }
    const form = new FormData(element);

    setBusy(true);
    setError(null);
    try {
      await apiRequest(`/packages/${packageId}/media`, {
        method: 'POST',
        body: JSON.stringify({
          contentType: file.type,
          contentBase64: await readBase64(file),
          altText: form.get('altText'),
          showsPeople,
          ...(showsPeople ? { consentReference: form.get('consentReference') } : {}),
        }),
      });
      element.reset();
      setShowsPeople(false);
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
      await apiRequest(`/packages/${packageId}/media/${mediaId}`, { method: 'DELETE' });
      router.refresh();
    } catch (removeError) {
      setError(removeError instanceof Error ? removeError.message : t('removeFailed'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <p className="text-body-sm text-secondary">{t('hint')}</p>
      {media.length === 0 ? (
        <p className="text-body-sm text-muted">{t('none')}</p>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {media.map((photo, index) => (
            <li
              key={photo.id}
              className="flex min-w-0 flex-col gap-2 rounded-md border p-2"
            >
              <img
                src={`/api/ota/packages/media/${photo.id}`}
                alt={photo.altText}
                className="aspect-[3/2] w-full rounded object-cover"
              />
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-body-sm font-semibold">
                  {index === 0 ? t('hero') : t('gallery', { number: index })}
                </span>
                {photo.showsPeople ? (
                  <Badge variant={photo.hasConsent ? 'outline' : 'warning'}>
                    {t('showsPeople')} ·{' '}
                    {photo.hasConsent ? t('consentOnFile') : t('consentMissing')}
                  </Badge>
                ) : null}
              </div>
              <p className="text-caption text-muted">{photo.altText}</p>
              <Button
                type="button"
                size="sm"
                variant="tertiary"
                className="self-start"
                disabled={busy}
                onClick={() => remove(photo.id)}
              >
                {t('remove')}
              </Button>
            </li>
          ))}
        </ul>
      )}

      <form className="flex flex-col gap-3 border-t pt-4" onSubmit={onUpload}>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex min-w-0 flex-col gap-1.5">
            <Label htmlFor="package-media-file">{t('file')}</Label>
            <Input
              id="package-media-file"
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
            />
          </div>
          <div className="flex min-w-0 flex-col gap-1.5">
            <Label htmlFor="package-media-alt">{t('altText')}</Label>
            <Input
              id="package-media-alt"
              name="altText"
              required
              maxLength={300}
              aria-describedby="package-media-alt-hint"
            />
            <span id="package-media-alt-hint" className="text-caption text-muted">
              {t('altHint')}
            </span>
          </div>
        </div>
        <Checkbox
          checked={showsPeople}
          onChange={(event) => setShowsPeople(event.target.checked)}
          label={t('peopleLabel')}
        />
        {showsPeople ? (
          <div className="flex min-w-0 flex-col gap-1.5 sm:max-w-md">
            <Label htmlFor="package-media-consent">{t('consentReference')}</Label>
            <Input
              id="package-media-consent"
              name="consentReference"
              required
              maxLength={200}
              aria-describedby="package-media-consent-hint"
            />
            <span id="package-media-consent-hint" className="text-caption text-muted">
              {t('consentHint')}
            </span>
          </div>
        ) : null}
        {error ? <Alert variant="destructive">{error}</Alert> : null}
        <Button type="submit" className="self-start" disabled={busy}>
          {busy ? t('uploading') : t('upload')}
        </Button>
      </form>
    </div>
  );
}
