import type { WorkerJobDto } from '@ota/schemas';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { copy } from '../lib/copy';
import { clock, money, serviceLabel, shortDate, travelerLine } from '../lib/format';
import { Button, Card, colors, radius, space, type } from '../ui';

/** A taken job in a list (W-Home, "Trabajos"), with the way into W-Job. */
export function JobCard({ job, onOpen }: { job: WorkerJobDto; onOpen: () => void }) {
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
      <Button
        label={copy.job.open}
        variant="secondary"
        accessibilityLabel={`${copy.job.open}: ${job.bookingCode}, ${shortDate(job.startsAt)}`}
        onPress={onOpen}
      />
    </Card>
  );
}

/** "Trabajos": the worker's coming jobs, from the home the phone keeps. */
export function JobsScreen({
  jobs,
  onOpenJob,
}: {
  jobs: readonly WorkerJobDto[];
  onOpenJob: (job: WorkerJobDto) => void;
}) {
  return (
    <ScrollView contentContainerStyle={styles.page}>
      <Text accessibilityRole="header" style={type.title}>
        {copy.job.list}
      </Text>
      {jobs.length === 0 ? <Text style={type.small}>{copy.job.listEmpty}</Text> : null}
      {jobs.map((job) => (
        <JobCard key={job.serviceItemId} job={job} onOpen={() => onOpenJob(job)} />
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { padding: space.lg, gap: space.md, backgroundColor: colors.page, flexGrow: 1 },
  row: { flexDirection: 'row', alignItems: 'baseline', gap: space.sm },
  grow: { flex: 1, minWidth: 0 },
  strong: { fontWeight: '700' },
  assigned: {
    color: colors.success,
    backgroundColor: colors.successSoft,
    borderRadius: radius.sm,
    paddingHorizontal: space.sm,
    paddingVertical: 2,
    overflow: 'hidden',
  },
});
