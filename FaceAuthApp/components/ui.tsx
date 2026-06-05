/**
 * Shared UI primitives for the NHAI FaceAuth app. Keeps every screen visually
 * consistent and reduces per-screen StyleSheet boilerplate.
 */
import React from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView,
  ActivityIndicator, ViewStyle, TextStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, spacing, radius, font } from '../theme';

export function Screen({
  children, scroll = true, padded = true,
}: { children: React.ReactNode; scroll?: boolean; padded?: boolean }) {
  const inner = (
    <View style={padded ? styles.padded : undefined}>{children}</View>
  );
  return (
    <SafeAreaView style={styles.screen} edges={['top', 'left', 'right']}>
      {scroll ? (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
          {inner}
        </ScrollView>
      ) : inner}
    </SafeAreaView>
  );
}

export function Header({ title, subtitle, right }: { title: string; subtitle?: string; right?: React.ReactNode }) {
  return (
    <View style={styles.header}>
      <View style={{ flex: 1 }}>
        <Text style={font.h1}>{title}</Text>
        {subtitle ? <Text style={[font.label, { marginTop: 2 }]}>{subtitle}</Text> : null}
      </View>
      {right}
    </View>
  );
}

export function Card({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function Button({
  title, onPress, variant = 'primary', disabled, loading, style,
}: {
  title: string; onPress?: () => void;
  variant?: 'primary' | 'success' | 'danger' | 'ghost';
  disabled?: boolean; loading?: boolean; style?: ViewStyle;
}) {
  const bg = {
    primary: colors.primary, success: colors.success,
    danger: colors.danger, ghost: 'transparent',
  }[variant];
  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={onPress}
      disabled={disabled || loading}
      style={[
        styles.btn,
        { backgroundColor: bg, opacity: disabled ? 0.5 : 1 },
        variant === 'ghost' && styles.btnGhost,
        style,
      ]}>
      {loading
        ? <ActivityIndicator color={variant === 'ghost' ? colors.primary : '#fff'} />
        : <Text style={[styles.btnText, variant === 'ghost' && { color: colors.primary }]}>{title}</Text>}
    </TouchableOpacity>
  );
}

export function Stat({ label, value, tint }: { label: string; value: string | number; tint?: string }) {
  return (
    <View style={styles.stat}>
      <Text style={[styles.statValue, tint ? { color: tint } : null]}>{value}</Text>
      <Text style={font.caption}>{label}</Text>
    </View>
  );
}

export function Pill({ text, tint = colors.primary }: { text: string; tint?: string }) {
  return (
    <View style={[styles.pill, { backgroundColor: tint + '22', borderColor: tint }]}>
      <Text style={[styles.pillText, { color: tint }]}>{text}</Text>
    </View>
  );
}

export function Row({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  return <View style={[styles.row, style]}>{children}</View>;
}

export function ListItem({
  title, subtitle, right, onPress,
}: { title: string; subtitle?: string; right?: React.ReactNode; onPress?: () => void }) {
  return (
    <TouchableOpacity activeOpacity={onPress ? 0.7 : 1} onPress={onPress} style={styles.listItem}>
      <View style={{ flex: 1 }}>
        <Text style={font.body}>{title}</Text>
        {subtitle ? <Text style={[font.caption, { marginTop: 2 }]}>{subtitle}</Text> : null}
      </View>
      {right}
    </TouchableOpacity>
  );
}

export function EmptyState({ icon, text }: { icon: string; text: string }) {
  return (
    <View style={styles.empty}>
      <Text style={{ fontSize: 44, marginBottom: spacing.md }}>{icon}</Text>
      <Text style={[font.label, { textAlign: 'center' }]}>{text}</Text>
    </View>
  );
}

export function Label({ children }: { children: React.ReactNode }) {
  return <Text style={[font.label, { marginBottom: spacing.xs, marginTop: spacing.md }]}>{children}</Text>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  scrollContent: { paddingBottom: spacing.xxl },
  padded: { paddingHorizontal: spacing.lg },
  header: {
    flexDirection: 'row', alignItems: 'center',
    marginTop: spacing.md, marginBottom: spacing.lg,
  },
  card: {
    backgroundColor: colors.surface, borderRadius: radius.lg,
    padding: spacing.lg, borderWidth: 1, borderColor: colors.border,
    marginBottom: spacing.md,
  },
  btn: {
    paddingVertical: 15, borderRadius: radius.md,
    alignItems: 'center', justifyContent: 'center',
  },
  btnGhost: { borderWidth: 1, borderColor: colors.primary },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '700' as TextStyle['fontWeight'] },
  stat: { flex: 1, alignItems: 'center' },
  statValue: { fontSize: 26, fontWeight: '800', color: colors.text, marginBottom: 2 },
  pill: {
    paddingHorizontal: spacing.md, paddingVertical: 5,
    borderRadius: radius.pill, borderWidth: 1, alignSelf: 'flex-start',
  },
  pillText: { fontSize: 12, fontWeight: '700' },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  listItem: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  empty: { alignItems: 'center', justifyContent: 'center', paddingVertical: spacing.xxl * 2 },
});
