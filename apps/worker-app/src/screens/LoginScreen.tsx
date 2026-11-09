import {
  WORKER_CODE_RESEND_SECONDS,
  maskWorkerPhone,
  normalizeWorkerCode,
  normalizeWorkerPhone,
} from '@ota/domain';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { ApiError, type WorkerApi } from '../lib/api';
import { settings } from '../lib/config';
import { copy } from '../lib/copy';
import { secondsLeft } from '../lib/format';
import { Button, Card, Notice, colors, radius, space, type } from '../ui';

/**
 * W-Login: the worker's phone number, then the six-digit code it receives
 * by SMS or that the desk reads out (`docs/worker-app-plan.md` W1).
 */
export function LoginScreen({
  api,
  notice,
  onSignedIn,
}: {
  api: WorkerApi;
  notice: string | null;
  onSignedIn: (token: string) => void;
}) {
  const [phone, setPhone] = useState('');
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [sentAt, setSentAt] = useState(0);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (!sentTo) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [sentTo]);

  async function send() {
    const normalized = normalizeWorkerPhone(phone);
    if (!normalized) {
      setError(copy.login.badPhone);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.sendCode(normalized);
      setSentTo(normalized);
      setSentAt(Date.now());
      setNow(Date.now());
    } catch {
      setError(copy.login.noConnection);
    } finally {
      setBusy(false);
    }
  }

  async function confirm() {
    if (!sentTo) return;
    const typed = normalizeWorkerCode(code);
    if (!typed) {
      setError(copy.login.invalid);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const { token } = await api.signIn(sentTo, typed);
      onSignedIn(token);
    } catch (signInError) {
      setError(
        signInError instanceof ApiError && signInError.status !== null
          ? copy.login.invalid
          : copy.login.noConnection,
      );
    } finally {
      setBusy(false);
    }
  }

  const wait = WORKER_CODE_RESEND_SECONDS - (now - sentAt) / 1000;

  return (
    <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
      <Text style={type.caption}>
        {settings.agencyName} · {copy.appTitle}
      </Text>
      <Text accessibilityRole="header" style={type.title}>
        {copy.login.title}
      </Text>
      {notice ? <Notice tone="warning">{notice}</Notice> : null}

      {!sentTo ? (
        <Card>
          <Text style={type.heading}>{copy.login.lead}</Text>
          <Text style={type.small}>{copy.login.explain}</Text>
          <Text nativeID="phone-label" style={styles.label}>
            {copy.login.phoneLabel}
          </Text>
          <View style={styles.phoneRow}>
            <Text style={[type.body, styles.prefix]}>+53</Text>
            <TextInput
              accessibilityLabel={copy.login.phoneLabel}
              accessibilityLabelledBy="phone-label"
              autoComplete="tel"
              inputMode="tel"
              keyboardType="phone-pad"
              onChangeText={setPhone}
              onSubmitEditing={() => void send()}
              placeholder="5 241 0088"
              placeholderTextColor={colors.inkSoft}
              style={[styles.input, styles.phoneInput]}
              value={phone}
            />
          </View>
          <Text style={type.caption}>{copy.login.phoneHint}</Text>
          {error ? <Notice tone="danger">{error}</Notice> : null}
          <Button label={copy.login.send} busy={busy} onPress={() => void send()} />
        </Card>
      ) : (
        <Card>
          <Text style={type.heading}>{copy.login.codeTitle}</Text>
          <Text style={type.small}>{copy.login.sentTo(maskWorkerPhone(sentTo))}</Text>
          <Text nativeID="code-label" style={styles.label}>
            {copy.login.codeLabel}
          </Text>
          <TextInput
            accessibilityLabel={copy.login.codeLabel}
            accessibilityLabelledBy="code-label"
            autoComplete="one-time-code"
            inputMode="numeric"
            keyboardType="number-pad"
            maxLength={7}
            onChangeText={setCode}
            onSubmitEditing={() => void confirm()}
            placeholder="000000"
            placeholderTextColor={colors.inkSoft}
            style={[styles.input, styles.codeInput]}
            textContentType="oneTimeCode"
            value={code}
          />
          {error ? <Notice tone="danger">{error}</Notice> : null}
          <Button label={copy.login.confirm} busy={busy} onPress={() => void confirm()} />
          <Button
            label={wait > 0 ? copy.login.resendIn(secondsLeft(wait)) : copy.login.resend}
            variant="secondary"
            disabled={wait > 0 || busy}
            onPress={() => void send()}
          />
          <Button
            label={copy.login.changeNumber}
            variant="quiet"
            onPress={() => {
              setSentTo(null);
              setCode('');
              setError(null);
            }}
          />
        </Card>
      )}

      <Text style={type.small}>{copy.login.noSignal(settings.deskPhone)}</Text>
      <Text style={type.caption}>{copy.login.privacy}</Text>
      <Text style={type.caption}>{copy.login.offline}</Text>
      <Text style={type.caption}>{copy.login.session}</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { padding: space.lg, gap: space.md, backgroundColor: colors.page, flexGrow: 1 },
  label: { ...type.small, color: colors.ink, fontWeight: '600', marginTop: space.sm },
  phoneRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  prefix: { fontWeight: '600' },
  input: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    fontSize: 18,
    color: colors.ink,
    backgroundColor: colors.surface,
  },
  phoneInput: { flex: 1, minWidth: 0 },
  codeInput: { fontSize: 24, letterSpacing: 6, fontVariant: ['tabular-nums'] },
});
