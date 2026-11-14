import type { CredentialKind } from '@ota/domain';
import type { CredentialSlotDto, WorkerCredentialsDto } from '@ota/schemas';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { ApiError, type WorkerApi } from '../lib/api';
import { copy } from '../lib/copy';
import {
  MAX_PHOTO_BYTES,
  daysLeft,
  fileSize,
  kindName,
  kindNameInline,
  slotBadge,
  type BadgeTone,
  type PhotoUpload,
} from '../lib/credentials';
import { calendarDate } from '../lib/format';
import { pickPhoto } from '../lib/pick-photo';
import { Button, Card, Notice, colors, radius, space, type } from '../ui';

const TONE_STYLE: Record<BadgeTone, { color: string; backgroundColor: string }> = {
  success: { color: colors.success, backgroundColor: colors.successSoft },
  warning: { color: colors.warning, backgroundColor: colors.warningSoft },
  danger: { color: colors.danger, backgroundColor: colors.surface },
  info: { color: colors.ink, backgroundColor: colors.primarySoft },
};

const SUMMARY_TONE = {
  ACTIVE: 'success',
  IN_REVIEW: 'info',
  EXPIRING: 'warning',
  SUSPENDED: 'danger',
} as const;

/** A day kept at UTC midnight, as `calendarDate` reads it. */
function day(value: string): string {
  return calendarDate(`${value}T00:00:00Z`);
}

type Draft = { kind: CredentialKind; photo: PhotoUpload | null };

/**
 * W-Credentials (`docs/schema-w-credentials.md`): each document the worker's
 * category needs, its expiry and the 30-day rule, a photo of a renewal sent
 * for review, and what the desk said. A photo that could not be sent stays on
 * the screen to send again; it is not queued like an answer, since it is too
 * heavy to resend in the background. It needs a connection, like the calendar.
 */
export function CredentialsScreen({
  api,
  token,
  now,
  onBack,
  onSignedOut,
}: {
  api: WorkerApi;
  token: string;
  now: number;
  onBack: () => void;
  onSignedOut: () => void;
}) {
  const [data, setData] = useState<WorkerCredentialsDto | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [draftMessage, setDraftMessage] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      setData(await api.credentials(token));
      setMessage(null);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        onSignedOut();
      } else {
        setMessage(
          error instanceof ApiError && error.status === null
            ? copy.login.noConnection
            : copy.credentials.refused,
        );
      }
    } finally {
      setRefreshing(false);
    }
  }, [api, token, onSignedOut]);

  useEffect(() => {
    void load();
  }, [load]);

  async function choose(kind: CredentialKind, source: 'camera' | 'library') {
    setDraftMessage(null);
    const picked = await pickPhoto(source);
    if (picked === 'denied') {
      setDraftMessage(copy.credentials.cameraDenied);
      return;
    }
    if (!picked) return;
    if (picked.bytes > MAX_PHOTO_BYTES) {
      setDraftMessage(copy.credentials.tooBig);
      return;
    }
    setDraft({ kind, photo: picked });
  }

  async function send() {
    if (!draft?.photo) return;
    setSending(true);
    setDraftMessage(null);
    try {
      const { filename, contentType, contentBase64 } = draft.photo;
      setData(
        await api.uploadCredential(token, {
          kind: draft.kind,
          filename,
          contentType,
          contentBase64,
        }),
      );
      setDraft(null);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        onSignedOut();
        return;
      }
      setDraftMessage(
        error instanceof ApiError && error.status === null
          ? copy.credentials.offline
          : copy.credentials.refusedUpload,
      );
    } finally {
      setSending(false);
    }
  }

  if (!data) {
    return (
      <View style={styles.center}>
        {message ? <Notice tone="warning">{message}</Notice> : null}
        {message ? (
          <Button label={copy.credentials.back} variant="secondary" onPress={onBack} />
        ) : (
          <ActivityIndicator color={colors.primary} />
        )}
      </View>
    );
  }

  const { summary, slots, windowDays } = data;
  const settled = slots.every((slot) => slot.current && !slot.pending);

  return (
    <ScrollView
      contentContainerStyle={styles.page}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={load} />}
    >
      <Text accessibilityRole="header" style={type.title}>
        {copy.credentials.title}
      </Text>

      {message ? <Notice tone="warning">{message}</Notice> : null}

      <Notice tone={SUMMARY_TONE[summary.state]}>
        <Text style={styles.strong}>
          {copy.credentials.state[summary.state]} ·{' '}
          {copy.credentials.offers(summary.autoOffers)}
        </Text>
        {'\n'}
        {[
          settled ? copy.credentials.allVerified : null,
          summary.nextExpiry
            ? copy.credentials.next(
                kindNameInline(summary.nextExpiry.kind),
                day(summary.nextExpiry.expiresOn),
              )
            : null,
        ]
          .filter(Boolean)
          .join(' ')}
      </Notice>

      {slots.map((slot) => (
        <SlotCard
          key={slot.kind}
          slot={slot}
          now={now}
          windowDays={windowDays}
          ruled={summary.nextExpiry?.kind === slot.kind}
          vehicle={
            slot.kind === 'LIABILITY_INSURANCE' && data.vehicle
              ? copy.credentials.vehicle(
                  data.vehicle.model,
                  data.vehicle.plate,
                  data.vehicle.seats,
                  data.vehicle.airConditioning,
                )
              : null
          }
          draft={draft?.kind === slot.kind ? draft : null}
          draftMessage={draft?.kind === slot.kind ? draftMessage : null}
          sending={sending}
          onStart={() => {
            setDraftMessage(null);
            setDraft({ kind: slot.kind, photo: null });
          }}
          onChoose={(source) => void choose(slot.kind, source)}
          onSend={() => void send()}
          onCancel={() => {
            setDraft(null);
            setDraftMessage(null);
          }}
        />
      ))}

      <Card>
        <Text accessibilityRole="header" style={type.heading}>
          {copy.credentials.how}
        </Text>
        {copy.credentials.legend(windowDays).map((entry) => (
          <Text key={entry.state} style={type.small}>
            <Text style={[styles.strong, { color: colors.ink }]}>{entry.state}</Text>{' '}
            {entry.text}
          </Text>
        ))}
      </Card>

      <Button label={copy.credentials.back} variant="secondary" onPress={onBack} />
    </ScrollView>
  );
}

function SlotCard({
  slot,
  now,
  windowDays,
  ruled,
  vehicle,
  draft,
  draftMessage,
  sending,
  onStart,
  onChoose,
  onSend,
  onCancel,
}: {
  slot: CredentialSlotDto;
  now: number;
  windowDays: number;
  /** The document that expires first carries the 30-day rule. */
  ruled: boolean;
  vehicle: string | null;
  draft: Draft | null;
  draftMessage: string | null;
  sending: boolean;
  onStart: () => void;
  onChoose: (source: 'camera' | 'library') => void;
  onSend: () => void;
  onCancel: () => void;
}) {
  const badge = slotBadge(slot, now, windowDays);
  const { current, pending, rejected } = slot;
  const identity = slot.kind === 'IDENTITY_CARD';
  const name = kindName(slot.kind);

  return (
    <Card>
      <View style={styles.row}>
        <Text accessibilityRole="header" style={[type.heading, styles.grow]}>
          {name}
        </Text>
        <Text style={[type.caption, styles.chip, TONE_STYLE[badge.tone]]}>
          {badge.text}
        </Text>
      </View>

      {identity ? (
        <Text style={type.small}>
          {current ? copy.credentials.identityChecked : copy.credentials.identityMissing}
        </Text>
      ) : current ? (
        <View>
          {current.number ? (
            <Text style={[type.small, type.figure]}>
              {copy.credentials.number(current.number)}
            </Text>
          ) : null}
          {current.expiresOn ? (
            <Text style={[type.small, type.figure]}>
              {copy.credentials.expires(
                day(current.expiresOn),
                daysLeft(current.expiresOn, now),
              )}
            </Text>
          ) : null}
          {current.reviewedAt ? (
            <Text style={type.small}>
              {copy.credentials.reviewed(
                calendarDate(current.reviewedAt),
                current.reviewedByName,
              )}
            </Text>
          ) : null}
          {vehicle ? <Text style={type.small}>{vehicle}</Text> : null}
        </View>
      ) : (
        <Text style={type.small}>{copy.credentials.missing}</Text>
      )}

      {ruled && slot.pauseFrom ? (
        <Text style={type.small}>
          <Text style={[styles.strong, { color: colors.ink }]}>
            {copy.credentials.ruleLabel}
          </Text>{' '}
          {copy.credentials.rule(day(slot.pauseFrom), windowDays)}
        </Text>
      ) : null}

      {pending ? (
        <Notice tone="info">
          <Text style={styles.strong}>{copy.credentials.pending}</Text>
          {'\n'}
          {copy.credentials.pendingExplain(
            slot.state === 'VALID' || slot.state === 'EXPIRING',
          )}
        </Notice>
      ) : null}
      {rejected?.rejectReason ? (
        <Notice tone="danger">{copy.credentials.rejected(rejected.rejectReason)}</Notice>
      ) : null}

      {identity ? null : draft?.photo ? (
        <View style={styles.draft}>
          <Image
            accessibilityLabel={`Foto de ${name}`}
            source={{
              uri: `data:${draft.photo.contentType};base64,${draft.photo.contentBase64}`,
            }}
            style={styles.preview}
            resizeMode="contain"
          />
          <Text style={type.caption}>
            {copy.credentials.preview(fileSize(draft.photo.bytes))}
          </Text>
          {copy.credentials.checks.map((check) => (
            <Text key={check} style={type.small}>
              ✓ {check}
            </Text>
          ))}
          {draftMessage ? <Notice tone="warning">{draftMessage}</Notice> : null}
          <Button label={copy.credentials.send} busy={sending} onPress={onSend} />
          <Button
            label={copy.credentials.retake}
            variant="secondary"
            disabled={sending}
            onPress={() => onChoose('camera')}
          />
          <Button
            label={copy.credentials.cancel}
            variant="quiet"
            disabled={sending}
            onPress={onCancel}
          />
        </View>
      ) : draft ? (
        <View style={styles.draft}>
          {draftMessage ? <Notice tone="warning">{draftMessage}</Notice> : null}
          <Button label={copy.credentials.takePhoto} onPress={() => onChoose('camera')} />
          <Button
            label={copy.credentials.fromGallery}
            variant="secondary"
            onPress={() => onChoose('library')}
          />
          <Button label={copy.credentials.cancel} variant="quiet" onPress={onCancel} />
        </View>
      ) : (
        <Button
          label={current ? copy.credentials.uploadRenewal : copy.credentials.uploadFirst}
          accessibilityLabel={`${
            current ? copy.credentials.uploadRenewal : copy.credentials.uploadFirst
          }: ${name}`}
          variant={slot.state === 'VALID' && !rejected ? 'secondary' : 'primary'}
          onPress={onStart}
        />
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  page: { padding: space.lg, gap: space.md, backgroundColor: colors.page, flexGrow: 1 },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: space.lg,
    gap: space.md,
  },
  row: { flexDirection: 'row', alignItems: 'baseline', gap: space.sm },
  grow: { flex: 1, minWidth: 0 },
  strong: { fontWeight: '700' },
  chip: {
    borderRadius: radius.sm,
    paddingHorizontal: space.sm,
    paddingVertical: 2,
    overflow: 'hidden',
  },
  draft: { gap: space.sm },
  preview: {
    width: '100%',
    height: 200,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.page,
  },
});
