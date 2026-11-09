import type { WorkerHomeDto, WorkerJobDto, WorkerOfferDto } from '@ota/schemas';
import {
  Linking,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { settings } from '../lib/config';
import { copy } from '../lib/copy';
import {
  calendarDate,
  clock,
  money,
  serviceLabel,
  shortDate,
  timeLeft,
  travelerLine,
} from '../lib/format';
import { Button, Card, Notice, colors, radius, space, type } from '../ui';

/**
 * W-Home: who is signed in, whether the phone is in sync, the open offers
 * with their time left, and the coming jobs. `now` is the API's clock as the
 * app tracks it, so a phone set to the wrong time still counts down right.
 */
export function HomeScreen({
  home,
  now,
  offline,
  pending,
  answered,
  notice,
  refreshing,
  onRefresh,
  onOpenOffer,
  onSignOut,
}: {
  home: WorkerHomeDto;
  now: number;
  offline: boolean;
  pending: number;
  /** Offers answered on this phone and not yet gone from the API's list. */
  answered: ReadonlySet<string>;
  notice: string | null;
  refreshing: boolean;
  onRefresh: () => void;
  onOpenOffer: (offer: WorkerOfferDto) => void;
  onSignOut: () => void;
}) {
  const { worker } = home;
  const offers = home.offers.filter(
    (offer) => !answered.has(offer.serviceItemId) && Date.parse(offer.deadline) > now,
  );

  return (
    <ScrollView
      contentContainerStyle={styles.page}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text accessibilityRole="header" style={type.title}>
            {copy.home.hello(worker.firstName)}
          </Text>
          <Text style={type.small}>
            {shortDate(new Date(now).toISOString())} ·{' '}
            {clock(new Date(now).toISOString())}
            {worker.provinces[0] ? ` · ${worker.provinces[0]}` : ''}
          </Text>
        </View>
        <View style={[styles.sync, offline ? styles.syncOffline : styles.syncOnline]}>
          <Text
            style={[type.caption, { color: offline ? colors.warning : colors.success }]}
          >
            {offline
              ? copy.home.offline(pending)
              : pending > 0
                ? copy.home.sending(pending)
                : copy.home.synced}
          </Text>
        </View>
      </View>

      {notice ? <Notice tone="warning">{notice}</Notice> : null}

      <Text style={type.small}>
        {copy.home.credential(
          worker.credentialExpiresAt ? calendarDate(worker.credentialExpiresAt) : null,
          worker.reliability,
        )}
      </Text>
      {worker.verificationStatus === 'PENDING_AUDIT' ? (
        <Notice tone="info">{copy.home.pendingAudit}</Notice>
      ) : worker.verificationStatus === 'SUSPENDED' ||
        worker.verificationStatus === 'REJECTED' ? (
        <Notice tone="danger">{copy.home.suspended}</Notice>
      ) : null}

      <Text accessibilityRole="header" style={type.heading}>
        {copy.home.offers(offers.length)}
      </Text>
      {offers.length === 0 ? <Text style={type.small}>{copy.home.noOffers}</Text> : null}
      {offers.map((offer) => (
        <OfferCard
          key={offer.serviceItemId}
          offer={offer}
          now={now}
          onOpen={() => onOpenOffer(offer)}
        />
      ))}
      {pending > 0 && answered.size > 0 ? (
        <Notice tone="info">{copy.home.saved}</Notice>
      ) : null}

      <Text accessibilityRole="header" style={type.heading}>
        {copy.home.jobs}
      </Text>
      {home.jobs.length === 0 ? <Text style={type.small}>{copy.home.noJobs}</Text> : null}
      {home.jobs.map((job) => (
        <JobRow key={job.serviceItemId} job={job} />
      ))}

      <View style={styles.footer}>
        {settings.deskPhone ? (
          <Button
            label={copy.home.desk(settings.deskPhone)}
            variant="secondary"
            onPress={() =>
              void Linking.openURL(`tel:${settings.deskPhone!.replace(/\s/g, '')}`)
            }
          />
        ) : null}
        <Button label={copy.home.refresh} variant="secondary" onPress={onRefresh} />
        <Button label={copy.home.signOut} variant="quiet" onPress={onSignOut} />
      </View>
    </ScrollView>
  );
}

function OfferCard({
  offer,
  now,
  onOpen,
}: {
  offer: WorkerOfferDto;
  now: number;
  onOpen: () => void;
}) {
  const hurry = now >= Date.parse(offer.hurryFrom);
  return (
    <Card style={hurry ? styles.hurry : undefined}>
      <View style={styles.row}>
        <Text style={[type.body, styles.strong, styles.grow]}>
          {serviceLabel(offer.serviceType)}
          {offer.province ? ` · ${offer.province}` : ''}
        </Text>
        <Text style={[type.small, type.figure, hurry && { color: colors.warning }]}>
          {copy.home.left(timeLeft(Date.parse(offer.deadline) - now))}
        </Text>
      </View>
      <Text style={type.small}>
        {shortDate(offer.startsAt)} {clock(offer.startsAt)}
        {offer.endsAt.slice(0, 10) !== offer.startsAt.slice(0, 10)
          ? ` y ${shortDate(offer.endsAt)}`
          : ''}
      </Text>
      <Text style={type.small}>
        {travelerLine(offer.traveler)} · {money(offer.payout, offer.currency)}
      </Text>
      <Button label={copy.home.answerNow} onPress={onOpen} />
    </Card>
  );
}

function JobRow({ job }: { job: WorkerJobDto }) {
  return (
    <Card>
      <View style={styles.row}>
        <Text style={[type.body, styles.strong, type.figure]}>{clock(job.startsAt)}</Text>
        <Text style={[type.small, styles.grow]}>{shortDate(job.startsAt)}</Text>
        <Text style={[type.caption, styles.assigned]}>{copy.home.assigned}</Text>
      </View>
      <Text style={type.body}>
        {serviceLabel(job.serviceType)}
        {job.province ? ` · ${job.province}` : ''}
      </Text>
      <Text style={type.small}>
        {travelerLine(job.traveler)} · {money(job.payout, job.currency)} ·{' '}
        {job.bookingCode}
      </Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  page: { padding: space.lg, gap: space.md, backgroundColor: colors.page, flexGrow: 1 },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: space.sm },
  headerText: { flex: 1, minWidth: 0 },
  sync: {
    borderRadius: radius.lg,
    paddingHorizontal: space.md,
    paddingVertical: space.xs,
    borderWidth: 1,
  },
  syncOnline: { backgroundColor: colors.successSoft, borderColor: colors.successSoft },
  syncOffline: { backgroundColor: colors.warningSoft, borderColor: colors.warningSoft },
  row: { flexDirection: 'row', alignItems: 'baseline', gap: space.sm },
  grow: { flex: 1, minWidth: 0 },
  strong: { fontWeight: '700' },
  hurry: { borderColor: colors.warning },
  assigned: {
    color: colors.success,
    backgroundColor: colors.successSoft,
    borderRadius: radius.sm,
    paddingHorizontal: space.sm,
    paddingVertical: 2,
    overflow: 'hidden',
  },
  footer: { gap: space.sm, marginTop: space.md },
});
