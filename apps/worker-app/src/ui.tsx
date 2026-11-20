import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { settings } from './lib/config';

/** The tenant's colours (`app.config.ts`); the system font stands in for the brand face. */
export const colors = settings.colors;

/** The DS spacing steps the boards use, in density-independent pixels. */
export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 } as const;

/** The DS radii: sm 4, md 10, lg 20. */
export const radius = { sm: 4, md: 10, lg: 20 } as const;

export const type = StyleSheet.create({
  title: { fontSize: 24, lineHeight: 30, fontWeight: '700', color: colors.ink },
  heading: { fontSize: 18, lineHeight: 24, fontWeight: '700', color: colors.ink },
  body: { fontSize: 16, lineHeight: 22, color: colors.ink },
  small: { fontSize: 14, lineHeight: 20, color: colors.inkSoft },
  caption: { fontSize: 12, lineHeight: 16, color: colors.inkSoft },
  figure: { fontVariant: ['tabular-nums'] },
});

type ButtonVariant = 'primary' | 'secondary' | 'quiet' | 'danger';

/** A full-width action with a 48 dp target (DS 07 touch size). */
export function Button({
  label,
  onPress,
  variant = 'primary',
  disabled = false,
  busy = false,
  accessibilityLabel,
}: {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  disabled?: boolean;
  busy?: boolean;
  /** For a label repeated down a list, e.g. "Abrir recibo" on each payment. */
  accessibilityLabel?: string;
}) {
  const inactive = disabled || busy;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled: inactive, busy }}
      disabled={inactive}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        styles[variant],
        inactive && styles.inactive,
        pressed && !inactive && styles.pressed,
      ]}
    >
      {busy ? (
        <ActivityIndicator
          color={
            variant === 'primary' || variant === 'danger'
              ? colors.surface
              : colors.primary
          }
        />
      ) : (
        <Text
          style={[
            styles.buttonLabel,
            (variant === 'primary' || variant === 'danger') && styles.primaryLabel,
          ]}
        >
          {label}
        </Text>
      )}
    </Pressable>
  );
}

export function Card({
  children,
  style,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return <View style={[styles.card, style]}>{children}</View>;
}

/** A section of the bottom bar. */
export type Tab = 'home' | 'calendar' | 'jobs' | 'profile';

/**
 * The bottom bar (W-Home's board): the four sections a worker moves between.
 * Each tab is a 48 dp target; the current one is said, not only coloured.
 */
export function TabBar({
  current,
  labels,
  label,
  onSelect,
}: {
  current: Tab | null;
  labels: Record<Tab, string>;
  label: string;
  onSelect: (tab: Tab) => void;
}) {
  const tabs: Tab[] = ['home', 'calendar', 'jobs', 'profile'];
  return (
    <View accessibilityRole="tablist" accessibilityLabel={label} style={styles.tabBar}>
      {tabs.map((tab) => {
        const selected = tab === current;
        return (
          <Pressable
            key={tab}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            onPress={() => onSelect(tab)}
            style={({ pressed }) => [styles.tab, pressed && styles.pressed]}
          >
            <Text style={[styles.tabLabel, selected && styles.tabSelected]}>
              {labels[tab]}
            </Text>
            <View style={[styles.tabMark, selected && styles.tabMarkSelected]} />
          </Pressable>
        );
      })}
    </View>
  );
}

type Tone = 'info' | 'warning' | 'success' | 'danger';

/** A one-line notice; the tone is also said in words, never by colour alone. */
export function Notice({ tone, children }: { tone: Tone; children: ReactNode }) {
  return (
    <View
      accessibilityRole={tone === 'danger' || tone === 'warning' ? 'alert' : undefined}
      style={[styles.notice, noticeTone[tone]]}
    >
      <Text style={[type.small, { color: noticeText[tone] }]}>{children}</Text>
    </View>
  );
}

const noticeTone = StyleSheet.create({
  info: { backgroundColor: colors.primarySoft, borderColor: colors.line },
  warning: { backgroundColor: colors.warningSoft, borderColor: colors.warningSoft },
  success: { backgroundColor: colors.successSoft, borderColor: colors.successSoft },
  danger: { backgroundColor: colors.surface, borderColor: colors.danger },
});

const noticeText: Record<Tone, string> = {
  info: colors.ink,
  warning: colors.warning,
  success: colors.success,
  danger: colors.danger,
};

const styles = StyleSheet.create({
  button: {
    minHeight: 48,
    borderRadius: radius.md,
    paddingHorizontal: space.lg,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  primary: { backgroundColor: colors.primary, borderColor: colors.primary },
  secondary: { backgroundColor: colors.surface, borderColor: colors.line },
  quiet: { backgroundColor: 'transparent', borderColor: 'transparent' },
  danger: { backgroundColor: colors.danger, borderColor: colors.danger },
  inactive: { opacity: 0.5 },
  pressed: { opacity: 0.85 },
  buttonLabel: { fontSize: 16, fontWeight: '600', color: colors.primary },
  primaryLabel: { color: colors.surface },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    padding: space.lg,
    gap: space.sm,
  },
  tabBar: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: colors.line,
    backgroundColor: colors.surface,
  },
  tab: {
    flex: 1,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  tabLabel: { fontSize: 14, fontWeight: '600', color: colors.inkSoft },
  tabSelected: { color: colors.primary },
  tabMark: { height: 3, width: 24, borderRadius: 2, backgroundColor: 'transparent' },
  tabMarkSelected: { backgroundColor: colors.primary },
  notice: {
    borderRadius: radius.sm,
    borderWidth: 1,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
  },
});
