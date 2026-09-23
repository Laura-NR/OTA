'use client';

import type { MyReviewDto } from '@ota/schemas';
import { Alert, Button, Input, Label, Select } from '@ota/ui';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import type { FormEvent } from 'react';

import { useRouter } from '@/i18n/navigation';

export interface ReviewFormProps {
  reservationId: string;
  review: MyReviewDto | null;
}

/** Traveler CSAT review, shown once the trip is completed (spec §4.9.4). */
export function ReviewForm({ reservationId, review }: ReviewFormProps) {
  const t = useTranslations('review');
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (review) {
    return (
      <div className="space-y-2 text-sm">
        <p className="font-medium">{t('yourRating')}</p>
        <p>{t('stars', { count: review.rating })}</p>
        {review.comment ? (
          <p className="text-muted-foreground">{review.comment}</p>
        ) : null}
      </div>
    );
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const element = event.currentTarget;
    const form = new FormData(element);
    setBusy(true);
    setError(null);

    try {
      const response = await fetch(`/api/ota/me/reservations/${reservationId}/reviews`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          rating: Number(form.get('rating')),
          comment: form.get('comment') || undefined,
        }),
      });
      if (!response.ok) {
        throw new Error(t('error'));
      }
      element.reset();
      router.refresh();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : t('error'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="space-y-3" onSubmit={onSubmit}>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="review-rating">{t('rating')}</Label>
          <Select id="review-rating" name="rating" defaultValue="5">
            {[5, 4, 3, 2, 1].map((value) => (
              <option key={value} value={value}>
                {t('stars', { count: value })}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="review-comment">{t('comment')}</Label>
          <Input id="review-comment" name="comment" maxLength={2000} />
        </div>
      </div>
      {error ? <Alert variant="destructive">{error}</Alert> : null}
      <Button type="submit" disabled={busy}>
        {busy ? t('submitting') : t('submit')}
      </Button>
    </form>
  );
}
