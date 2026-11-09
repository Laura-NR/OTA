import type { WorkerOfferDto } from '@ota/schemas';
import { useState, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import {
  DECLINE_REASONS,
  copy,
  declineReasonText,
  type DeclineReasonKey,
} from '../lib/copy';
import {
  clock,
  money,
  serviceLabel,
  shortDate,
  timeLeft,
  travelerLine,
} from '../lib/format';
import { Button, Card, Notice, colors, radius, space, type } from '../ui';

/** What happened to this offer on this phone. */
export interface OfferOutcome {
  kind: 'accept' | 'decline';
  /** The reason as sent, for a decline. */
  reason?: string;
  answeredAt: string;
  /** The API took it (`sent`), or it waits on the phone (`queued`). */
  delivery: 'sent' | 'queued';
}

/**
 * W-Offer: the offer with its time left, then accept, or decline with one of
 * the board's reasons. An answer is saved on the phone before it is sent
 * (`docs/worker-app-plan.md` W6), so the outcome shows even with no signal.
 */
export function OfferScreen({
  offer,
  now,
  outcome,
  onAnswer,
  onBack,
}: {
  offer: WorkerOfferDto;
  now: number;
  outcome: OfferOutcome | null;
  onAnswer: (kind: 'accept' | 'decline', reason?: string) => Promise<void>;
  onBack: () => void;
}) {
  const [declining, setDeclining] = useState(false);
  const [reason, setReason] = useState<DeclineReasonKey | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const remaining = Date.parse(offer.deadline) - now;
  const expired = remaining <= 0;
  const hurry = !expired && now >= Date.parse(offer.hurryFrom);

  async function answer(kind: 'accept' | 'decline', text?: string) {
    setBusy(true);
    try {
      await onAnswer(kind, text);
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
      <Button label={`‹ ${copy.offer.back}`} variant="quiet" onPress={onBack} />
      <Text accessibilityRole="header" style={type.title}>
        {copy.offer.title}
      </Text>

      {outcome ? (
        <Card>
          <Text style={type.heading}>
            {outcome.kind === 'accept'
              ? copy.offer.accepted(clock(outcome.answeredAt))
              : copy.offer.declined(outcome.reason ?? '')}
          </Text>
          <Text style={type.body}>
            {outcome.kind === 'accept'
              ? copy.offer.acceptedText
              : copy.offer.declinedText}
          </Text>
          <Notice tone={outcome.delivery === 'sent' ? 'success' : 'info'}>
            {outcome.delivery === 'sent' ? copy.offer.sent : copy.offer.queued}
          </Notice>
          <Button label={copy.offer.home} onPress={onBack} />
        </Card>
      ) : (
        <>
          <Text style={[type.heading, type.figure, hurry && { color: colors.warning }]}>
            {copy.offer.toAnswer(timeLeft(remaining))}
          </Text>
          <Text style={type.small}>{copy.offer.offeredAt(clock(offer.offeredAt))}</Text>
          {expired ? (
            <Notice tone="danger">{copy.offer.expired}</Notice>
          ) : hurry ? (
            <Notice tone="warning">{copy.offer.hurry}</Notice>
          ) : null}

          <Card>
            <Detail label={copy.offer.service}>
              {serviceLabel(offer.serviceType)}
              {offer.province ? ` · ${offer.province}` : ''}
            </Detail>
            <Detail label={copy.offer.from}>
              {shortDate(offer.startsAt)} · {clock(offer.startsAt)}
            </Detail>
            <Detail label={copy.offer.to}>
              {shortDate(offer.endsAt)} · {clock(offer.endsAt)}
            </Detail>
            <Detail label={copy.offer.travelers}>{travelerLine(offer.traveler)}</Detail>
            <Detail label={copy.offer.pay}>
              {copy.offer.net(money(offer.payout, offer.currency))}
            </Detail>
            <Detail label={copy.offer.booking}>{offer.bookingCode}</Detail>
          </Card>

          {!declining ? (
            <View style={styles.actions}>
              <Button
                label={copy.offer.accept}
                busy={busy}
                disabled={expired}
                onPress={() => void answer('accept')}
              />
              <Button
                label={copy.offer.decline}
                variant="secondary"
                disabled={expired || busy}
                onPress={() => setDeclining(true)}
              />
              <Text style={type.caption}>{copy.offer.commitment}</Text>
            </View>
          ) : (
            <Card>
              <Text accessibilityRole="header" style={type.heading}>
                {copy.offer.why}
              </Text>
              <View accessibilityRole="radiogroup" style={styles.reasons}>
                {DECLINE_REASONS.map((option) => {
                  const selected = reason === option.key;
                  return (
                    <Pressable
                      key={option.key}
                      accessibilityRole="radio"
                      accessibilityState={{ checked: selected }}
                      onPress={() => setReason(option.key)}
                      style={[styles.reason, selected && styles.reasonSelected]}
                    >
                      <View style={[styles.dot, selected && styles.dotSelected]} />
                      <Text style={[type.body, styles.grow]}>{option.label}</Text>
                    </Pressable>
                  );
                })}
              </View>
              {reason === 'other' ? (
                <TextInput
                  accessibilityLabel={copy.offer.tellUs}
                  maxLength={300}
                  multiline
                  onChangeText={setNote}
                  placeholder={copy.offer.tellUs}
                  placeholderTextColor={colors.inkSoft}
                  style={styles.note}
                  value={note}
                />
              ) : null}
              {reason === 'fuel' ? (
                <Notice tone="info">{copy.offer.fuelNote}</Notice>
              ) : null}
              <Button
                label={copy.offer.confirmDecline}
                busy={busy}
                disabled={!reason || expired || (reason === 'other' && !note.trim())}
                onPress={() =>
                  reason && void answer('decline', declineReasonText(reason, note))
                }
              />
              <Button
                label={copy.offer.back}
                variant="quiet"
                onPress={() => {
                  setDeclining(false);
                  setReason(null);
                  setNote('');
                }}
              />
            </Card>
          )}
        </>
      )}
    </ScrollView>
  );
}

function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View style={styles.detail}>
      <Text style={type.caption}>{label}</Text>
      <Text style={type.body}>{children}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { padding: space.lg, gap: space.md, backgroundColor: colors.page, flexGrow: 1 },
  actions: { gap: space.sm },
  detail: { gap: 2 },
  reasons: { gap: space.sm },
  reason: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    backgroundColor: colors.surface,
  },
  reasonSelected: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  dot: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: colors.inkSoft,
  },
  dotSelected: { borderColor: colors.primary, backgroundColor: colors.primary },
  grow: { flex: 1, minWidth: 0 },
  note: {
    minHeight: 72,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    padding: space.md,
    fontSize: 16,
    color: colors.ink,
    backgroundColor: colors.surface,
    textAlignVertical: 'top',
  },
});
