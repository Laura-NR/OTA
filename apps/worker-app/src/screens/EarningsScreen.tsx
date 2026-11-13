import type { WorkerPayoutState } from '@ota/domain';
import type {
  PayoutTotalDto,
  WorkerEarningsDto,
  WorkerEarningsJobDto,
  WorkerPaymentDto,
} from '@ota/schemas';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { ApiError, type WorkerApi } from '../lib/api';
import { settings } from '../lib/config';
import { openReceipt } from '../lib/open-receipt';
import { copy } from '../lib/copy';
import {
  categoryLabel,
  dayShort,
  money,
  payDay,
  serviceLabel,
  shortDate,
  travelerLine,
} from '../lib/format';
import { Button, Card, Notice, colors, radius, space, type } from '../ui';

const STATE_STYLE: Record<WorkerPayoutState, { color: string; backgroundColor: string }> =
  {
    PENDING: { color: colors.warning, backgroundColor: colors.warningSoft },
    PAID: { color: colors.success, backgroundColor: colors.successSoft },
    ISSUE: { color: colors.danger, backgroundColor: colors.surface },
  };

/**
 * W-Earnings: the worker's reliability as the desk's floor reads it, how they
 * are paid and when next, what they are owed and have been paid, their latest
 * finished jobs and their payments, each with its receipt to open
 * (`docs/schema-w-earnings.md`). The desk records payments and changes the
 * method (E3); ratings wait (E6). It needs a connection, like the calendar.
 */
export function EarningsScreen({
  api,
  token,
  onBack,
  onSignedOut,
}: {
  api: WorkerApi;
  token: string;
  onBack: () => void;
  onSignedOut: () => void;
}) {
  const [data, setData] = useState<WorkerEarningsDto | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [opening, setOpening] = useState<string | null>(null);
  const [receiptError, setReceiptError] = useState<{ id: string; text: string } | null>(
    null,
  );

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      setData(await api.earnings(token));
      setMessage(null);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        onSignedOut();
      } else {
        setMessage(
          error instanceof ApiError && error.status === null
            ? copy.login.noConnection
            : copy.earnings.refused,
        );
      }
    } finally {
      setRefreshing(false);
    }
  }, [api, token, onSignedOut]);

  useEffect(() => {
    void load();
  }, [load]);

  const showReceipt = useCallback(
    async (paymentId: string) => {
      setOpening(paymentId);
      setReceiptError(null);
      try {
        await openReceipt(api.receiptUrl(paymentId), token, copy.earnings.receiptTitle);
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) {
          onSignedOut();
          return;
        }
        setReceiptError({
          id: paymentId,
          text:
            error instanceof ApiError && error.status === null
              ? copy.login.noConnection
              : copy.earnings.receiptFailed,
        });
      } finally {
        setOpening(null);
      }
    },
    [api, token, onSignedOut],
  );

  if (!data) {
    return (
      <View style={styles.center}>
        {message ? <Notice tone="warning">{message}</Notice> : null}
        {message ? (
          <Button label={copy.earnings.back} variant="secondary" onPress={onBack} />
        ) : (
          <ActivityIndicator color={colors.primary} />
        )}
      </View>
    );
  }

  const { worker, reliability, payouts } = data;

  return (
    <ScrollView
      contentContainerStyle={styles.page}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={load} />}
    >
      <View>
        <Text accessibilityRole="header" style={type.title}>
          {copy.earnings.title}
        </Text>
        <Text style={type.small}>
          {[worker.fullName, categoryLabel(worker.category), worker.provinces.join(', ')]
            .filter(Boolean)
            .join(' · ')}
        </Text>
      </View>

      {message ? <Notice tone="warning">{message}</Notice> : null}

      <Card>
        <Text accessibilityRole="header" style={type.heading}>
          {copy.earnings.reliability}
        </Text>
        <View style={styles.row}>
          <Text style={[styles.score, type.figure]}>{reliability.score ?? '—'}</Text>
          <View style={styles.grow}>
            <Text
              style={[
                type.body,
                styles.strong,
                { color: reliability.meetsFloor ? colors.success : colors.danger },
              ]}
            >
              {reliability.meetsFloor ? copy.earnings.meets : copy.earnings.below}
            </Text>
            <Text style={type.small}>
              {reliability.score === null
                ? copy.earnings.noScore(reliability.answered, reliability.minAnswered)
                : copy.earnings.basis(reliability.answered)}
            </Text>
          </View>
        </View>
        <View style={styles.stats}>
          <Stat
            label={copy.earnings.accepted}
            value={`${reliability.acceptedPercent} %`}
          />
          <Stat
            label={copy.earnings.declined}
            value={`${reliability.declinedPercent} %`}
          />
          <Stat
            label={copy.earnings.timedOut}
            value={`${reliability.timedOutPercent} %`}
          />
        </View>
        <Text style={type.small}>{copy.earnings.rule(reliability.floorPercent)}</Text>
      </Card>

      <Card>
        <Text accessibilityRole="header" style={type.heading}>
          {copy.earnings.payouts}
        </Text>
        <Text style={[type.body, styles.strong]}>
          {payouts.method === 'CASH_OFFICE'
            ? copy.earnings.method.CASH_OFFICE(payouts.office)
            : payouts.method === 'BANK_TRANSFER'
              ? copy.earnings.method.BANK_TRANSFER
              : copy.earnings.methodNotSet}
        </Text>
        <Text style={type.small}>{copy.earnings.pending}</Text>
        <Text style={[styles.amount, type.figure]}>
          {money(payouts.pending.amount, payouts.currency)}
        </Text>
        <Text style={type.small}>{copy.earnings.jobs(payouts.pending.jobs)}</Text>
        {payouts.nextPayDay ? (
          <View style={styles.nextPay}>
            <Text style={type.caption}>{copy.earnings.nextPay}</Text>
            <Text style={[type.body, styles.strong]}>
              {copy.earnings.nextPayLine(
                payDay(payouts.nextPayDay.day),
                payouts.nextPayDay.from,
                payouts.nextPayDay.to,
                payouts.method !== 'BANK_TRANSFER',
              )}
            </Text>
          </View>
        ) : null}
        <View style={styles.stats}>
          <Total
            label={copy.earnings.thisMonth}
            total={payouts.thisMonth}
            currency={payouts.currency}
          />
          <Total
            label={copy.earnings.paidYear(payouts.year)}
            total={payouts.paidThisYear}
            currency={payouts.currency}
          />
        </View>
        {payouts.issue.jobs > 0 ? (
          <Notice tone="danger">
            {copy.earnings.issue(
              money(payouts.issue.amount, payouts.currency),
              payouts.issue.jobs,
            )}
          </Notice>
        ) : null}
        <Text style={type.small}>{copy.earnings.howPaid(payouts.businessDays)}</Text>
        {settings.deskPhone ? (
          <Button
            label={copy.earnings.changeMethod}
            variant="secondary"
            onPress={() =>
              void Linking.openURL(`tel:${settings.deskPhone!.replace(/\s/g, '')}`)
            }
          />
        ) : null}
      </Card>

      <Text accessibilityRole="header" style={type.heading}>
        {copy.earnings.history}
      </Text>
      {data.history.length === 0 ? (
        <Text style={type.small}>{copy.earnings.noHistory}</Text>
      ) : null}
      {data.history.map((job) => (
        <HistoryRow key={job.serviceItemId} job={job} />
      ))}

      <Text accessibilityRole="header" style={type.heading}>
        {copy.earnings.receipts}
      </Text>
      {data.payments.length === 0 ? (
        <Text style={type.small}>{copy.earnings.noReceipts}</Text>
      ) : (
        <Card>
          {data.payments.map((payment) => (
            <PaymentRow
              key={payment.id}
              payment={payment}
              office={payouts.office}
              opening={opening === payment.id}
              disabled={opening !== null}
              error={receiptError?.id === payment.id ? receiptError.text : null}
              onOpen={() => void showReceipt(payment.id)}
            />
          ))}
        </Card>
      )}

      <View style={styles.footer}>
        <Button label={copy.earnings.back} variant="secondary" onPress={onBack} />
      </View>
    </ScrollView>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <Text style={type.caption}>{label}</Text>
      <Text style={[type.body, styles.strong, type.figure]}>{value}</Text>
    </View>
  );
}

function Total({
  label,
  total,
  currency,
}: {
  label: string;
  total: PayoutTotalDto;
  currency: string;
}) {
  return (
    <View style={styles.stat}>
      <Text style={type.caption}>{label}</Text>
      <Text style={[type.body, styles.strong, type.figure]}>
        {money(total.amount, currency)}
      </Text>
      <Text style={type.caption}>{copy.earnings.count(total.jobs)}</Text>
    </View>
  );
}

function PaymentRow({
  payment,
  office,
  opening,
  disabled,
  error,
  onOpen,
}: {
  payment: WorkerPaymentDto;
  office: string | null;
  opening: boolean;
  disabled: boolean;
  error: string | null;
  onOpen: () => void;
}) {
  return (
    <View style={styles.payment}>
      <View style={styles.row}>
        <View style={styles.grow}>
          <Text style={[type.body, styles.strong]}>{dayShort(payment.paidAt)}</Text>
          <Text style={type.small}>
            {payment.method === 'CASH_OFFICE'
              ? copy.earnings.method.CASH_OFFICE(office)
              : copy.earnings.method.BANK_TRANSFER}{' '}
            · {copy.earnings.count(payment.jobs)}
          </Text>
        </View>
        <Text style={[type.body, styles.strong, type.figure]}>
          {money(payment.amount, payment.currency)}
        </Text>
      </View>
      <Button
        label={copy.earnings.openReceipt}
        accessibilityLabel={copy.earnings.openReceiptFor(dayShort(payment.paidAt))}
        variant="quiet"
        busy={opening}
        disabled={disabled}
        onPress={onOpen}
      />
      {error ? <Notice tone="warning">{error}</Notice> : null}
    </View>
  );
}

function HistoryRow({ job }: { job: WorkerEarningsJobDto }) {
  const state =
    job.payoutState === 'PAID' && job.paidAt
      ? copy.earnings.paidOn(dayShort(job.paidAt))
      : copy.earnings.state[job.payoutState];
  return (
    <Card>
      <View style={styles.row}>
        <Text style={[type.small, styles.grow]}>{shortDate(job.endsAt)}</Text>
        <Text style={[type.body, styles.strong, type.figure]}>
          {money(job.payout, job.currency)}
        </Text>
      </View>
      <Text style={type.body}>
        {serviceLabel(job.serviceType)}
        {job.province ? ` · ${job.province}` : ''}
      </Text>
      <View style={styles.row}>
        <Text style={[type.small, styles.grow]}>
          {travelerLine(job.traveler)} · {job.bookingCode}
        </Text>
        <Text style={[type.caption, styles.chip, STATE_STYLE[job.payoutState]]}>
          {state}
        </Text>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  page: { padding: space.lg, gap: space.md, backgroundColor: colors.page, flexGrow: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  grow: { flex: 1, minWidth: 0 },
  strong: { fontWeight: '700' },
  score: { fontSize: 40, lineHeight: 46, fontWeight: '700', color: colors.ink },
  amount: { fontSize: 28, lineHeight: 34, fontWeight: '700', color: colors.ink },
  stats: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md },
  stat: { flexGrow: 1, flexBasis: 96, gap: 2 },
  nextPay: { gap: 2 },
  payment: { gap: space.xs },
  chip: {
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: 'transparent',
    paddingHorizontal: space.sm,
    paddingVertical: 2,
    overflow: 'hidden',
  },
  footer: { gap: space.sm, marginTop: space.md },
});
