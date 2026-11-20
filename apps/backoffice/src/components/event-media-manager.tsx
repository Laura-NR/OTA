'use client';

import type { EventMediaDto } from '@ota/schemas';
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
 * An event's photos (`docs/schema-m10-holds-photos.md` P1a), as a package's:
 * the first is the event page's hero and the list's picture, the rest follow.
 * Alt text is required, and a photo that shows people needs a consent
 * reference before the event can be published. Each photo can be made the
 * hero, edited or removed; support only sees them.
 */
export function EventMediaManager({
  eventId,
  media,
  canManage,
}: {
  eventId: string;
  media: EventMediaDto[];
  canManage: boolean;
}) {
  const t = useTranslations('eventsDesk.photos');
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [showsPeople, setShowsPeople] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send(path: string, init: RequestInit, failed: string) {
    setBusy(true);
    setError(null);
    try {
      await apiRequest(path, init);
      router.refresh();
      return true;
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : failed);
      return false;
    } finally {
      setBusy(false);
    }
  }

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
    const sent = await send(
      `/events/${eventId}/media`,
      {
        method: 'POST',
        body: JSON.stringify({
          contentType: file.type,
          contentBase64: await readBase64(file),
          altText: form.get('altText'),
          showsPeople,
          ...(showsPeople ? { consentReference: form.get('consentReference') } : {}),
        }),
      },
      t('uploadFailed'),
    );
    if (sent) {
      element.reset();
      setShowsPeople(false);
    }
  }

  const patch = (mediaId: string, body: unknown) =>
    send(
      `/events/${eventId}/media/${mediaId}`,
      { method: 'PATCH', body: JSON.stringify(body) },
      t('saveFailed'),
    );

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
                src={`/api/ota/events/media/${photo.id}`}
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
              {editing === photo.id ? (
                <PhotoEdit
                  photo={photo}
                  busy={busy}
                  onCancel={() => setEditing(null)}
                  onSave={async (body) => {
                    if (await patch(photo.id, body)) setEditing(null);
                  }}
                />
              ) : (
                <>
                  <p className="text-caption text-muted">{photo.altText}</p>
                  {canManage ? (
                    <div className="flex flex-wrap gap-1">
                      {index > 0 ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          disabled={busy}
                          onClick={() => void patch(photo.id, { position: 0 })}
                        >
                          {t('makeHero')}
                        </Button>
                      ) : null}
                      <Button
                        type="button"
                        size="sm"
                        variant="tertiary"
                        disabled={busy}
                        onClick={() => setEditing(photo.id)}
                      >
                        {t('edit')}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="tertiary"
                        disabled={busy}
                        onClick={() =>
                          void send(
                            `/events/${eventId}/media/${photo.id}`,
                            { method: 'DELETE' },
                            t('removeFailed'),
                          )
                        }
                      >
                        {t('remove')}
                      </Button>
                    </div>
                  ) : null}
                </>
              )}
            </li>
          ))}
        </ul>
      )}

      {canManage ? (
        <form className="flex flex-col gap-3 border-t pt-4" onSubmit={onUpload}>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex min-w-0 flex-col gap-1.5">
              <Label htmlFor="event-media-file">{t('file')}</Label>
              <Input
                id="event-media-file"
                ref={fileRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
              />
            </div>
            <div className="flex min-w-0 flex-col gap-1.5">
              <Label htmlFor="event-media-alt">{t('altText')}</Label>
              <Input
                id="event-media-alt"
                name="altText"
                required
                maxLength={300}
                aria-describedby="event-media-alt-hint"
              />
              <span id="event-media-alt-hint" className="text-caption text-muted">
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
              <Label htmlFor="event-media-consent">{t('consentReference')}</Label>
              <Input
                id="event-media-consent"
                name="consentReference"
                required
                maxLength={200}
                aria-describedby="event-media-consent-hint"
              />
              <span id="event-media-consent-hint" className="text-caption text-muted">
                {t('consentHint')}
              </span>
            </div>
          ) : null}
          <Button type="submit" className="self-start" disabled={busy}>
            {busy ? t('uploading') : t('upload')}
          </Button>
        </form>
      ) : null}
      {error ? <Alert variant="destructive">{error}</Alert> : null}
    </div>
  );
}

/** One photo's words and consent, edited in place. */
function PhotoEdit({
  photo,
  busy,
  onCancel,
  onSave,
}: {
  photo: EventMediaDto;
  busy: boolean;
  onCancel: () => void;
  onSave: (body: {
    altText: string;
    showsPeople: boolean;
    consentReference?: string | null;
  }) => Promise<void>;
}) {
  const t = useTranslations('eventsDesk.photos');
  const [altText, setAltText] = useState(photo.altText);
  const [showsPeople, setShowsPeople] = useState(photo.showsPeople);
  const [consent, setConsent] = useState('');
  const id = `event-media-${photo.id}`;

  return (
    <form
      className="flex flex-col gap-2"
      aria-label={t('edit')}
      onSubmit={(event) => {
        event.preventDefault();
        void onSave({
          altText,
          showsPeople,
          // Blank keeps the reference on file; the desk never sees it again.
          ...(showsPeople && consent.trim() ? { consentReference: consent } : {}),
        });
      }}
    >
      <div className="flex min-w-0 flex-col gap-1.5">
        <Label htmlFor={`${id}-alt`}>{t('altText')}</Label>
        <Input
          id={`${id}-alt`}
          required
          maxLength={300}
          value={altText}
          onChange={(event) => setAltText(event.target.value)}
        />
      </div>
      <Checkbox
        checked={showsPeople}
        onChange={(event) => setShowsPeople(event.target.checked)}
        label={t('peopleLabel')}
      />
      {showsPeople ? (
        <div className="flex min-w-0 flex-col gap-1.5">
          <Label htmlFor={`${id}-consent`}>{t('consentReference')}</Label>
          <Input
            id={`${id}-consent`}
            maxLength={200}
            required={!photo.hasConsent}
            aria-describedby={`${id}-consent-hint`}
            value={consent}
            onChange={(event) => setConsent(event.target.value)}
          />
          <span id={`${id}-consent-hint`} className="text-caption text-muted">
            {photo.hasConsent ? t('consentOnFile') : t('consentHint')}
          </span>
        </div>
      ) : null}
      <div className="flex flex-wrap gap-1">
        <Button type="submit" size="sm" disabled={busy}>
          {t('save')}
        </Button>
        <Button type="button" size="sm" variant="tertiary" onClick={onCancel}>
          {t('cancel')}
        </Button>
      </div>
    </form>
  );
}
