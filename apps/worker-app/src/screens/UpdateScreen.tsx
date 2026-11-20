import type { WorkerAppLatestDto } from '@ota/schemas';
import { useState } from 'react';
import { Linking, ScrollView, StyleSheet, Text, View } from 'react-native';

import { ApkDownloadError, installApk } from '../lib/apk-install';
import { settings } from '../lib/config';
import { copy } from '../lib/copy';
import { calendarDate, megabytes } from '../lib/format';
import { Button, Card, Notice, colors, radius, space, type } from '../ui';

type Release = NonNullable<WorkerAppLatestDto['release']>;
type Apk = Release['apks'][number];

type Progress =
  | { state: 'idle' }
  | { state: 'downloading'; written: number; total: number }
  | { state: 'failed'; message: string };

/**
 * The update prompt (ADR 0007 A3; `docs/worker-app-distribution-plan.md` U3a,
 * U4a): the new version, its size and date, the download with its progress,
 * and the hand-off to Android's installer. A required update has no way back
 * (offers wait behind it); an optional one has "Más tarde".
 */
export function UpdateScreen({
  release,
  apk,
  apkUrl,
  downloadUrl,
  required,
  onLater,
}: {
  release: Release;
  apk: Apk;
  apkUrl: string;
  downloadUrl: string;
  required: boolean;
  onLater?: () => void;
}) {
  const [progress, setProgress] = useState<Progress>({ state: 'idle' });

  async function update() {
    setProgress({ state: 'downloading', written: 0, total: apk.sizeBytes });
    try {
      await installApk({
        url: apkUrl,
        fileName: `${release.versionName}-${apk.abi}.apk`,
        sizeBytes: apk.sizeBytes,
        pageUrl: downloadUrl,
        onProgress: (written, total) =>
          setProgress({ state: 'downloading', written, total }),
      });
      setProgress({ state: 'failed', message: copy.update.notInstalled });
    } catch (error) {
      setProgress({
        state: 'failed',
        message:
          error instanceof ApkDownloadError && error.reason === 'incomplete'
            ? copy.update.incomplete
            : error instanceof ApkDownloadError
              ? copy.update.noData
              : copy.update.notInstalled,
      });
    }
  }

  const downloading = progress.state === 'downloading';
  const share =
    progress.state === 'downloading' && progress.total > 0
      ? Math.min(1, progress.written / progress.total)
      : 0;

  return (
    <ScrollView contentContainerStyle={styles.page}>
      <Text accessibilityRole="header" style={type.title}>
        {required ? copy.update.requiredTitle : copy.update.title(release.versionName)}
      </Text>
      <Text style={type.body}>
        {required
          ? copy.update.requiredLead(release.versionName)
          : copy.update.optionalLead}
      </Text>

      <Card>
        <Text style={[type.body, styles.strong]}>
          {copy.update.title(release.versionName)}
        </Text>
        <Text style={[type.small, type.figure]}>
          {copy.update.size(megabytes(apk.sizeBytes), calendarDate(release.publishedAt))}
        </Text>
        {release.notes ? <Text style={type.small}>{release.notes}</Text> : null}
        <Text style={type.small}>{copy.update.data}</Text>
      </Card>

      {downloading ? (
        <View
          accessibilityRole="progressbar"
          accessibilityValue={{ min: 0, max: 100, now: Math.round(share * 100) }}
          style={styles.progress}
        >
          <Text style={[type.small, type.figure]}>
            {copy.update.downloading(
              megabytes(progress.written),
              megabytes(progress.total),
            )}
          </Text>
          <View style={styles.track}>
            <View style={[styles.fill, { width: `${share * 100}%` }]} />
          </View>
        </View>
      ) : null}

      {progress.state === 'failed' ? (
        <Notice tone="warning">{progress.message}</Notice>
      ) : (
        <Notice tone="info">{copy.update.permission}</Notice>
      )}

      <Button
        label={progress.state === 'failed' ? copy.update.retry : copy.update.install}
        busy={downloading}
        onPress={() => void update()}
      />
      {progress.state === 'failed' ? (
        <Button
          label={copy.update.page}
          variant="secondary"
          onPress={() => void Linking.openURL(downloadUrl)}
        />
      ) : null}
      {!required && onLater ? (
        <Button
          label={copy.update.later}
          variant="quiet"
          disabled={downloading}
          onPress={onLater}
        />
      ) : null}
      {settings.deskPhone ? (
        <Button
          label={copy.update.desk(settings.deskPhone)}
          variant="quiet"
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
  strong: { fontWeight: '700' },
  progress: { gap: space.xs },
  track: {
    height: 8,
    borderRadius: radius.sm,
    backgroundColor: colors.line,
    overflow: 'hidden',
  },
  fill: { height: 8, backgroundColor: colors.primary },
});
