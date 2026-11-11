import {
  WORKER_BLOCK_MAX_DAYS,
  WORKER_BLOCK_REASONS,
  WORKER_LONG_BLOCK_DAYS,
  daysBetween,
  serviceCalendarDays,
  shiftMonth,
  workerToday,
  type WorkerBlockReason,
  type WorkerDayState,
} from '@ota/domain';
import type { WorkerCalendarDto, WorkerJobDto, WorkerOfferDto } from '@ota/schemas';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { ApiError, type WorkerApi } from '../lib/api';
import { settings } from '../lib/config';
import { copy } from '../lib/copy';
import {
  calendarDate,
  clock,
  dayName,
  dayShort,
  dayTitle,
  money,
  monthTitle,
  serviceLabel,
  travelerLine,
} from '../lib/format';
import { Button, Card, Notice, colors, radius, space, type } from '../ui';

type Message = { tone: 'success' | 'warning' | 'danger'; text: string };

/** The days a job or offer covers, on Havana's calendar. */
function covers(service: WorkerJobDto, day: string): boolean {
  return serviceCalendarDays(
    new Date(service.startsAt),
    new Date(service.endsAt),
  ).includes(day);
}

/**
 * W-Calendar: the worker's month, a day to block or free and why, several
 * days to block at once, and a driver's weekly fuel declaration. Changes need a
 * connection; unlike offer answers they are not queued
 * (`docs/worker-app-plan.md` §6).
 */
export function CalendarScreen({
  api,
  token,
  onOpenOffer,
  onBack,
  onSignedOut,
}: {
  api: WorkerApi;
  token: string;
  onOpenOffer: (offer: WorkerOfferDto) => void;
  onBack: () => void;
  onSignedOut: () => void;
}) {
  const [month, setMonth] = useState<string | undefined>(undefined);
  const [data, setData] = useState<WorkerCalendarDto | null>(null);
  const [offline, setOffline] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [range, setRange] = useState<{ from: string | null; to: string | null }>({
    from: null,
    to: null,
  });
  const [picking, setPicking] = useState<'from' | 'to' | null>(null);
  const [rangeReason, setRangeReason] = useState<WorkerBlockReason>('OTHER');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<Message | null>(null);
  const [litres, setLitres] = useState('');

  /** Errors as the worker reads them; a 401 ends the session. */
  const failed = useCallback(
    (error: unknown) => {
      if (error instanceof ApiError && error.status === 401) {
        onSignedOut();
      } else if (error instanceof ApiError && error.status === null) {
        setOffline(true);
        setMessage({ tone: 'warning', text: copy.login.noConnection });
      } else {
        setMessage({ tone: 'danger', text: copy.calendar.refused });
      }
    },
    [onSignedOut],
  );

  const load = useCallback(async () => {
    try {
      const fresh = await api.calendar(token, month);
      setData(fresh);
      setOffline(false);
      setSelected((current) =>
        current?.startsWith(fresh.month)
          ? current
          : fresh.today.startsWith(fresh.month)
            ? fresh.today
            : `${fresh.month}-01`,
      );
      if (fresh.fuel?.litres !== null && fresh.fuel?.litres !== undefined) {
        setLitres((current) => current || String(fresh.fuel!.litres));
      }
    } catch (error) {
      failed(error);
    }
  }, [api, token, month, failed]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!data) {
    return (
      <View style={styles.center}>
        {message ? <Notice tone={message.tone}>{message.text}</Notice> : null}
        {message ? (
          <Button label={copy.calendar.back} variant="secondary" onPress={onBack} />
        ) : (
          <ActivityIndicator color={colors.primary} />
        )}
      </View>
    );
  }

  const dayOf = new Map(data.days.map((day) => [day.date, day]));
  const changeable = (day: string) => day >= data.today && day <= data.horizon;
  const first = data.days[0]!.date;
  const lead = (new Date(`${first}T00:00:00Z`).getUTCDay() + 6) % 7;
  const currentMonth = data.today.slice(0, 7);

  /** Blocks or frees `from`–`to`; with `reason` on a day already blocked, only says why. */
  async function change(
    from: string,
    to: string,
    isAvailable: boolean,
    reason?: WorkerBlockReason,
    reasonOnly = false,
  ) {
    setBusy(true);
    setMessage(null);
    try {
      const result = await api.setDays(token, { from, to, isAvailable, reason });
      setMessage({
        tone: 'success',
        text:
          reasonOnly && result.changed.length > 0
            ? copy.calendar.reasonSaved(copy.calendar.reasons[reason ?? 'OTHER'])
            : [
                result.changed.length > 0
                  ? copy.calendar.done(result.changed.length, !isAvailable)
                  : null,
                result.kept.length > 0 ? copy.calendar.kept(result.kept.length) : null,
              ]
                .filter(Boolean)
                .join(' '),
      });
      setRange({ from: null, to: null });
      setRangeReason('OTHER');
      await load();
    } catch (error) {
      failed(error);
    } finally {
      setBusy(false);
    }
  }

  async function declareFuel() {
    if (!/^\d+$/.test(litres.trim())) {
      setMessage({ tone: 'warning', text: copy.calendar.badLitres });
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const fuel = await api.declareFuel(token, Number(litres.trim()));
      setData((current) => (current ? { ...current, fuel } : current));
    } catch (error) {
      failed(error);
    } finally {
      setBusy(false);
    }
  }

  function tap(day: string) {
    if (picking) {
      if (!changeable(day)) return;
      const next = { ...range, [picking]: day };
      // A range that would run backwards starts and ends on the day tapped.
      setRange(
        next.from && next.to && next.to < next.from ? { from: day, to: day } : next,
      );
      setPicking(picking === 'from' && !next.to ? 'to' : null);
      return;
    }
    setSelected(day);
  }

  const rangeDays = range.from && range.to ? daysBetween(range.from, range.to).length : 0;

  return (
    <ScrollView contentContainerStyle={styles.page}>
      <View style={styles.header}>
        <Text accessibilityRole="header" style={[type.title, styles.grow]}>
          {copy.calendar.title}
        </Text>
        <View style={[styles.sync, offline ? styles.syncOffline : styles.syncOnline]}>
          <Text
            style={[type.caption, { color: offline ? colors.warning : colors.success }]}
          >
            {offline ? copy.home.offline(0) : copy.home.synced}
          </Text>
        </View>
      </View>

      {message ? <Notice tone={message.tone}>{message.text}</Notice> : null}
      {data.longBlock ? (
        <Notice tone="warning">
          {copy.calendar.longBlock(
            data.longBlock.days,
            dayShort(data.longBlock.from),
            dayShort(data.longBlock.to),
          )}
        </Notice>
      ) : null}

      <Card>
        <View style={styles.monthBar}>
          <IconButton
            label={copy.calendar.previous}
            glyph="‹"
            disabled={data.month <= currentMonth}
            onPress={() => setMonth(shiftMonth(data.month, -1))}
          />
          <Text accessibilityRole="header" style={[type.heading, styles.monthTitle]}>
            {monthTitle(data.month)}
          </Text>
          <IconButton
            label={copy.calendar.next}
            glyph="›"
            disabled={data.month >= data.horizon.slice(0, 7)}
            onPress={() => setMonth(shiftMonth(data.month, 1))}
          />
        </View>
        <View style={styles.grid} importantForAccessibility="no-hide-descendants">
          {copy.calendar.weekdays.map((weekday, index) => (
            <View key={index} style={styles.cell}>
              <Text style={styles.weekday}>{weekday}</Text>
            </View>
          ))}
        </View>
        <View style={styles.grid}>
          {Array.from({ length: lead }, (_, index) => (
            <View key={`lead-${index}`} style={styles.cell} />
          ))}
          {data.days.map(({ date, state, reason }) => (
            <View key={date} style={styles.cell}>
              <DayButton
                day={date}
                state={state}
                reason={reason}
                today={date === data.today}
                past={date < data.today}
                selected={date === selected}
                inRange={
                  !!range.from && !!range.to && date >= range.from && date <= range.to
                }
                onPress={() => tap(date)}
              />
            </View>
          ))}
        </View>
        <View style={styles.legend}>
          {(['AVAILABLE', 'BLOCKED', 'JOB', 'OFFER'] as const).map((state) => (
            <View key={state} style={styles.legendItem}>
              <View style={[styles.swatch, swatch[state]]} />
              <Text style={styles.legendText}>{copy.calendar.legend[state]}</Text>
            </View>
          ))}
        </View>
        <Text style={type.caption}>{copy.calendar.hint}</Text>
      </Card>

      {selected ? (
        <SelectedDay
          day={selected}
          data={data}
          state={dayOf.get(selected)?.state ?? 'AVAILABLE'}
          reason={dayOf.get(selected)?.reason ?? null}
          changeable={changeable(selected)}
          busy={busy}
          onChange={(isAvailable) => void change(selected, selected, isAvailable)}
          onReason={(reason) => void change(selected, selected, false, reason, true)}
          onOpenOffer={onOpenOffer}
        />
      ) : null}

      <Card>
        <Text style={[type.body, styles.strong]}>{copy.calendar.range}</Text>
        <View style={styles.row}>
          <RangeField
            label={copy.calendar.from}
            day={range.from}
            active={picking === 'from'}
            onPress={() => setPicking(picking === 'from' ? null : 'from')}
          />
          <RangeField
            label={copy.calendar.to}
            day={range.to}
            active={picking === 'to'}
            onPress={() => setPicking(picking === 'to' ? null : 'to')}
          />
        </View>
        {picking ? <Text style={type.small}>{copy.calendar.pick}</Text> : null}
        {rangeDays > WORKER_BLOCK_MAX_DAYS ? (
          <Notice tone="warning">{copy.calendar.tooMany(WORKER_BLOCK_MAX_DAYS)}</Notice>
        ) : null}
        <ReasonChips
          label={copy.calendar.rangeReasonLabel}
          value={rangeReason}
          disabled={busy}
          onPick={setRangeReason}
        />
        <Button
          label={copy.calendar.blockDays(rangeDays)}
          variant="secondary"
          disabled={rangeDays === 0 || rangeDays > WORKER_BLOCK_MAX_DAYS}
          busy={busy}
          onPress={() => void change(range.from!, range.to!, false, rangeReason)}
        />
        <Text style={type.caption}>{copy.calendar.longRule(WORKER_LONG_BLOCK_DAYS)}</Text>
      </Card>

      {data.fuel ? (
        <Card>
          <View style={styles.row}>
            <Text style={[type.body, styles.strong, styles.grow]}>
              {copy.calendar.fuel}
            </Text>
            <Text style={type.caption}>
              {data.fuel.declaredAt === null
                ? copy.calendar.never
                : workerToday(new Date(data.fuel.declaredAt)) === data.today
                  ? copy.calendar.declaredToday(clock(data.fuel.declaredAt))
                  : copy.calendar.declared(calendarDate(data.fuel.declaredAt))}
            </Text>
          </View>
          {data.fuel.stale ? <Notice tone="warning">{copy.calendar.stale}</Notice> : null}
          <View style={styles.fuelRow}>
            <TextInput
              accessibilityLabel={copy.calendar.litresLabel}
              inputMode="numeric"
              keyboardType="number-pad"
              maxLength={6}
              onChangeText={setLitres}
              onSubmitEditing={() => void declareFuel()}
              placeholder="40"
              placeholderTextColor={colors.inkSoft}
              style={styles.input}
              value={litres}
            />
            <Text style={[type.small, styles.grow]}>{copy.calendar.litres}</Text>
            <Button
              label={copy.calendar.update}
              busy={busy}
              onPress={() => void declareFuel()}
            />
          </View>
          <Text style={type.caption}>{copy.calendar.fuelExplain}</Text>
        </Card>
      ) : null}

      <Button label={copy.calendar.back} variant="secondary" onPress={onBack} />
    </ScrollView>
  );
}

function IconButton({
  label,
  glyph,
  disabled,
  onPress,
}: {
  label: string;
  glyph: string;
  disabled: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[styles.iconButton, disabled && styles.inactive]}
    >
      <Text style={styles.glyph}>{glyph}</Text>
    </Pressable>
  );
}

function DayButton({
  day,
  state,
  reason,
  today,
  past,
  selected,
  inRange,
  onPress,
}: {
  day: string;
  state: WorkerDayState;
  reason: WorkerBlockReason | null;
  today: boolean;
  past: boolean;
  selected: boolean;
  inRange: boolean;
  onPress: () => void;
}) {
  const label = `${dayName(day)}${today ? `, ${copy.calendar.today}` : ''}, ${copy.calendar.stateAria[state]}${reason ? ` (${copy.calendar.reasons[reason].toLowerCase()})` : ''}`;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[
        styles.day,
        state === 'BLOCKED' && styles.dayBlocked,
        inRange && styles.dayInRange,
        today && styles.dayToday,
        selected && styles.daySelected,
      ]}
    >
      <Text
        style={[
          styles.dayNumber,
          state === 'BLOCKED' && { color: colors.inkSoft },
          past && state !== 'JOB' && styles.dayPast,
          selected && { color: colors.primaryDark },
        ]}
      >
        {Number(day.slice(8))}
      </Text>
      <View
        style={[
          styles.dot,
          state === 'JOB' && { backgroundColor: colors.primary },
          state === 'OFFER' && { backgroundColor: colors.warning },
        ]}
      />
    </Pressable>
  );
}

function SelectedDay({
  day,
  data,
  state,
  reason,
  changeable,
  busy,
  onChange,
  onReason,
  onOpenOffer,
}: {
  day: string;
  data: WorkerCalendarDto;
  state: WorkerDayState;
  reason: WorkerBlockReason | null;
  changeable: boolean;
  busy: boolean;
  onChange: (isAvailable: boolean) => void;
  onReason: (reason: WorkerBlockReason) => void;
  onOpenOffer: (offer: WorkerOfferDto) => void;
}) {
  const jobs = data.jobs.filter((job) => covers(job, day));
  const offers = data.offers.filter((offer) => covers(offer, day));
  return (
    <Card>
      <View style={[styles.row, styles.wrap]}>
        <Text style={[type.body, styles.strong, styles.grow]}>
          {dayTitle(day)}
          {day === data.today ? ` · ${copy.calendar.today}` : ''}
        </Text>
        <Text style={[styles.pill, pill[state]]}>{copy.calendar.state[state]}</Text>
      </View>

      {state === 'JOB' ? (
        <>
          {jobs.map((job) => (
            <View key={job.serviceItemId} style={styles.item}>
              <Text style={[type.small, type.figure, { color: colors.primaryDark }]}>
                {clock(job.startsAt)}
              </Text>
              <View style={styles.grow}>
                <Text style={type.body}>
                  {serviceLabel(job.serviceType)}
                  {job.province ? ` · ${job.province}` : ''}
                </Text>
                <Text style={type.caption}>
                  {travelerLine(job.traveler)} · {money(job.payout, job.currency)} ·{' '}
                  {job.bookingCode}
                </Text>
              </View>
            </View>
          ))}
          {settings.deskPhone ? (
            <Button
              label={copy.calendar.callDesk}
              variant="secondary"
              onPress={() =>
                void Linking.openURL(`tel:${settings.deskPhone!.replace(/\s/g, '')}`)
              }
            />
          ) : null}
        </>
      ) : state === 'OFFER' ? (
        offers.map((offer) => (
          <Pressable
            key={offer.serviceItemId}
            accessibilityRole="button"
            onPress={() => onOpenOffer(offer)}
            style={[styles.item, styles.offer]}
          >
            <View style={styles.grow}>
              <Text style={type.body}>
                {copy.calendar.offer(
                  [
                    serviceLabel(offer.serviceType),
                    offer.province,
                    clock(offer.startsAt),
                    money(offer.payout, offer.currency),
                  ]
                    .filter(Boolean)
                    .join(' · '),
                )}
              </Text>
              <Text style={type.caption}>
                {copy.calendar.answerBy(clock(offer.deadline))}
              </Text>
            </View>
            <Text style={[styles.glyph, { color: colors.warning }]}>›</Text>
          </Pressable>
        ))
      ) : day < data.today ? (
        <Text style={type.small}>{copy.calendar.past}</Text>
      ) : !changeable ? (
        <Text style={type.small}>{copy.calendar.beyond}</Text>
      ) : state === 'BLOCKED' ? (
        <>
          <Text style={type.body}>{copy.calendar.blocked}</Text>
          <ReasonChips
            label={copy.calendar.reasonLabel}
            value={reason}
            disabled={busy}
            onPick={onReason}
          />
          <Button
            label={copy.calendar.unblock}
            busy={busy}
            onPress={() => onChange(true)}
          />
        </>
      ) : (
        <>
          <Text style={type.body}>{copy.calendar.free}</Text>
          <Button
            label={copy.calendar.block}
            variant="secondary"
            busy={busy}
            onPress={() => onChange(false)}
          />
        </>
      )}
    </Card>
  );
}

/**
 * The board's "Motivo" chips. A day blocked by the desk, or before the
 * reasons existed, has none picked until the worker picks one.
 */
function ReasonChips({
  label,
  value,
  disabled,
  onPick,
}: {
  label: string;
  value: WorkerBlockReason | null;
  disabled: boolean;
  onPick: (reason: WorkerBlockReason) => void;
}) {
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={label} style={styles.chips}>
      <Text style={type.caption}>{copy.calendar.reason}</Text>
      {WORKER_BLOCK_REASONS.map((reason) => {
        const on = reason === value;
        return (
          <Pressable
            key={reason}
            accessibilityRole="radio"
            // aria-checked, not accessibilityState: react-native-web drops the
            // latter's `checked`, and React Native reads both.
            aria-checked={on}
            aria-disabled={disabled}
            disabled={disabled}
            onPress={() => {
              if (!on) onPick(reason);
            }}
            style={[styles.chip, on && styles.chipOn, disabled && styles.inactive]}
          >
            <Text style={[styles.chipLabel, on && styles.chipLabelOn]}>
              {copy.calendar.reasons[reason]}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function RangeField({
  label,
  day,
  active,
  onPress,
}: {
  label: string;
  day: string | null;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${day ? dayName(day) : '—'}`}
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={styles.rangeField}
    >
      <Text style={type.caption}>{label}</Text>
      <View style={[styles.input, styles.rangeValue, active && styles.rangeActive]}>
        <Text style={[type.body, type.figure]}>{day ? dayShort(day) : '—'}</Text>
      </View>
    </Pressable>
  );
}

const swatch = StyleSheet.create({
  AVAILABLE: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
  },
  BLOCKED: { backgroundColor: colors.line },
  JOB: { backgroundColor: colors.primary },
  OFFER: { backgroundColor: colors.warning },
});

const pill = StyleSheet.create({
  AVAILABLE: { backgroundColor: colors.successSoft, color: colors.success },
  BLOCKED: { backgroundColor: colors.page, color: colors.ink },
  JOB: { backgroundColor: colors.primarySoft, color: colors.primaryDark },
  OFFER: { backgroundColor: colors.warningSoft, color: colors.warning },
});

const styles = StyleSheet.create({
  page: { padding: space.lg, gap: space.md, backgroundColor: colors.page, flexGrow: 1 },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.md,
    padding: space.lg,
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  grow: { flex: 1, minWidth: 0 },
  strong: { fontWeight: '700' },
  row: { flexDirection: 'row', gap: space.sm, alignItems: 'flex-start' },
  wrap: { flexWrap: 'wrap', alignItems: 'center' },
  fuelRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  sync: {
    borderRadius: radius.lg,
    paddingHorizontal: space.md,
    paddingVertical: space.xs,
    borderWidth: 1,
  },
  syncOnline: { backgroundColor: colors.successSoft, borderColor: colors.successSoft },
  syncOffline: { backgroundColor: colors.warningSoft, borderColor: colors.warningSoft },
  monthBar: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  monthTitle: { flex: 1, textAlign: 'center' },
  iconButton: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inactive: { opacity: 0.4 },
  glyph: { fontSize: 24, lineHeight: 28, color: colors.primaryDark },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  // Seven columns with the board's 4 px gap: 2 px either side of each cell.
  cell: { width: `${100 / 7}%`, padding: 2 },
  weekday: {
    textAlign: 'center',
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '600',
    color: colors.inkSoft,
    paddingVertical: space.xs,
  },
  day: {
    height: 46,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: 'transparent',
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  dayBlocked: { backgroundColor: colors.line },
  dayInRange: { borderColor: colors.line, borderStyle: 'dashed' },
  dayToday: { borderColor: colors.primary },
  daySelected: { backgroundColor: colors.primarySoft, borderColor: colors.primary },
  dayNumber: { fontSize: 14, lineHeight: 18, fontWeight: '500', color: colors.ink },
  dayPast: { opacity: 0.45 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: 'transparent' },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  swatch: { width: 12, height: 12, borderRadius: radius.sm },
  legendText: { fontSize: 12, lineHeight: 16, color: colors.ink },
  pill: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '600',
    paddingHorizontal: 10,
    paddingVertical: space.xs,
    borderRadius: 9999,
    overflow: 'hidden',
  },
  item: {
    flexDirection: 'row',
    gap: space.sm,
    alignItems: 'flex-start',
    padding: space.md,
    borderRadius: radius.md,
    backgroundColor: colors.page,
  },
  offer: {
    alignItems: 'center',
    backgroundColor: colors.warningSoft,
    borderWidth: 1,
    borderColor: colors.warning,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 },
  // The board's chip at the app's 48 dp touch size (its 36 px is below DS 07's).
  chip: {
    minHeight: 48,
    justifyContent: 'center',
    paddingHorizontal: space.md,
    borderRadius: 9999,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
  },
  chipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipLabel: { fontSize: 13, lineHeight: 18, fontWeight: '500', color: colors.ink },
  chipLabelOn: { color: colors.surface },
  rangeField: { flex: 1, gap: space.xs },
  rangeValue: { justifyContent: 'center' },
  rangeActive: { borderColor: colors.primary, borderWidth: 2 },
  input: {
    minHeight: 48,
    minWidth: 96,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    fontSize: 16,
    color: colors.ink,
    backgroundColor: colors.surface,
    fontVariant: ['tabular-nums'],
  },
});
