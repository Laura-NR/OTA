import { WORKER_MESSAGE_MAX_LENGTH, type WorkerMessageDraft } from '@ota/domain';
import type { WorkerMessageDto } from '@ota/schemas';
import { useState } from 'react';
import { Linking, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { settings } from '../lib/config';
import { copy } from '../lib/copy';
import { clock, shortDate } from '../lib/format';
import { Button, Card, Notice, colors, radius, space, type } from '../ui';

/** One line of the thread: from the API, or still on the phone. */
interface Line {
  key: string;
  fromDesk: boolean;
  body: string;
  /** When it was written (the desk's: when it reached the API). */
  at: string;
  who: string;
  bookingCode: string | null;
  state: 'sent' | 'queued' | null;
}

function lines(
  messages: readonly WorkerMessageDto[],
  delivered: readonly WorkerMessageDraft[],
  queued: readonly WorkerMessageDraft[],
): Line[] {
  const known = new Set(messages.map((message) => message.clientRef));
  const fromApi: Line[] = messages.map((message) => ({
    key: message.id,
    fromDesk: message.sender === 'OPERATIONS',
    body: message.body,
    at: message.writtenAt ?? message.createdAt,
    who:
      message.sender === 'OPERATIONS'
        ? (message.authorName ?? copy.messages.desk)
        : copy.messages.you,
    bookingCode: message.bookingCode,
    state: message.sender === 'WORKER' ? 'sent' : null,
  }));
  const fromPhone = (list: readonly WorkerMessageDraft[], state: 'sent' | 'queued') =>
    list
      .filter((draft) => !known.has(draft.clientRef))
      .map<Line>((draft) => ({
        key: draft.clientRef,
        fromDesk: false,
        body: draft.body,
        at: draft.writtenAt,
        who: copy.messages.you,
        bookingCode: null,
        state,
      }));
  return [...fromApi, ...fromPhone(delivered, 'sent'), ...fromPhone(queued, 'queued')];
}

/**
 * The worker's one thread with the desk (`docs/schema-w-messages.md` M2–M5,
 * W-Job's "Central · hoy"). It reads from the last home, so it opens with no
 * signal; a message is saved on the phone first and sent when the signal
 * returns ("en cola" until then). Opened from a job, the message names it.
 * The desk's replies arrive with the next sync: there is no push.
 */
export function MessagesScreen({
  messages,
  delivered,
  queued,
  jobCode,
  offline,
  onSend,
  onBack,
}: {
  messages: readonly WorkerMessageDto[];
  /** Messages this phone sent that the last home does not hold yet. */
  delivered: readonly WorkerMessageDraft[];
  /** Messages still waiting on the phone. */
  queued: readonly WorkerMessageDraft[];
  /** The job a message written here is about, when opened from W-Job. */
  jobCode: string | null;
  offline: boolean;
  onSend: (body: string) => Promise<void>;
  onBack: () => void;
}) {
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const shown = lines(messages, delivered, queued);

  async function send() {
    const trimmed = body.trim();
    if (!trimmed) return;
    setBusy(true);
    try {
      await onSend(trimmed);
      setBody('');
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
      <Button label={`‹ ${copy.messages.back}`} variant="quiet" onPress={onBack} />
      <Text accessibilityRole="header" style={type.title}>
        {copy.messages.title}
      </Text>
      {jobCode ? <Text style={type.small}>{copy.messages.about(jobCode)}</Text> : null}
      {offline ? <Notice tone="warning">{copy.messages.offline}</Notice> : null}

      <Card>
        {shown.length === 0 ? (
          <Text style={type.small}>{copy.messages.empty}</Text>
        ) : null}
        {shown.map((line) => (
          <View
            key={line.key}
            style={[styles.bubble, line.fromDesk ? styles.fromDesk : styles.fromWorker]}
          >
            <Text style={type.body}>{line.body}</Text>
            <Text style={type.caption}>
              {copy.messages.meta(
                line.who,
                `${shortDate(line.at)} ${clock(line.at)}`,
                line.state,
                line.bookingCode && line.bookingCode !== jobCode
                  ? line.bookingCode
                  : null,
              )}
            </Text>
          </View>
        ))}
      </Card>

      <Text nativeID="message-label" style={type.small}>
        {copy.messages.label}
      </Text>
      <TextInput
        accessibilityLabel={copy.messages.label}
        accessibilityLabelledBy="message-label"
        maxLength={WORKER_MESSAGE_MAX_LENGTH}
        multiline
        onChangeText={setBody}
        placeholder={copy.messages.placeholder}
        placeholderTextColor={colors.inkSoft}
        style={styles.input}
        value={body}
      />
      <Button
        label={copy.messages.send}
        busy={busy}
        disabled={!body.trim()}
        onPress={() => void send()}
      />
      <Text style={type.caption}>{copy.messages.queueNote}</Text>
      {settings.deskPhone ? (
        <Button
          label={copy.job.call(`${copy.job.desk} · ${settings.deskPhone}`)}
          variant="secondary"
          onPress={() =>
            void Linking.openURL(`tel:${settings.deskPhone!.replace(/\s/g, '')}`)
          }
        />
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { padding: space.lg, gap: space.md, backgroundColor: colors.page, flexGrow: 1 },
  bubble: {
    maxWidth: '85%',
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    gap: 2,
  },
  fromDesk: { alignSelf: 'flex-start', backgroundColor: colors.page },
  fromWorker: { alignSelf: 'flex-end', backgroundColor: colors.primarySoft },
  input: {
    minHeight: 96,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    fontSize: 16,
    color: colors.ink,
    backgroundColor: colors.surface,
    textAlignVertical: 'top',
  },
});
