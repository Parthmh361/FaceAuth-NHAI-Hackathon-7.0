import React, { useCallback } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Screen, Header, Card, Button, Stat, Row, Pill } from '../components/ui';
import { colors, spacing, radius, font } from '../theme';
import { useApp } from '../context/AppContext';
import type { RootStackParamList } from '../navigation/types';

function fmtSync(ts: number | null): string {
  if (!ts) return 'Never';
  const diff = Date.now() - ts;
  if (diff < 60_000) return 'Just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return new Date(ts).toLocaleDateString('en-IN');
}

export function HomeScreen() {
  const {
    enrolledCount, pendingCount, lastSyncAt, lastSyncMsg,
    modelReady, refresh, syncNow,
  } = useApp();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  useFocusEffect(useCallback(() => { refresh(); }, [refresh]));

  return (
    <Screen>
      <Header
        title="NHAI FaceAuth"
        subtitle="Offline Recognition System"
        right={
          <Pill
            text={modelReady ? 'READY' : 'OFFLINE'}
            tint={modelReady ? colors.success : colors.danger}
          />
        }
      />

      {/* Stats row */}
      <Card>
        <Row>
          <Stat label="Enrolled" value={enrolledCount} tint={colors.primary} />
          <View style={styles.divider} />
          <Stat
            label="Pending Sync"
            value={pendingCount}
            tint={pendingCount > 0 ? colors.warning : colors.textMuted}
          />
          <View style={styles.divider} />
          <Stat label="Last Sync" value={fmtSync(lastSyncAt)} />
        </Row>
      </Card>

      {/* Primary action buttons */}
      <View style={styles.actions}>
        <TouchableOpacity
          style={[styles.actionBtn, { backgroundColor: colors.primary }]}
          onPress={() => navigation.navigate('Enroll')}
          activeOpacity={0.85}>
          <Text style={styles.actionIcon}>👤</Text>
          <Text style={styles.actionLabel}>Enroll Employee</Text>
          <Text style={styles.actionSub}>Register new face profile</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.actionBtn, { backgroundColor: colors.success }]}
          onPress={() => navigation.navigate('Verify')}
          activeOpacity={0.85}>
          <Text style={styles.actionIcon}>✅</Text>
          <Text style={styles.actionLabel}>Verify & Check-In</Text>
          <Text style={styles.actionSub}>Identify + log attendance</Text>
        </TouchableOpacity>
      </View>

      {lastSyncMsg ? (
        <Card>
          <Text style={font.label}>Last sync result</Text>
          <Text style={[font.body, { marginTop: spacing.xs }]}>{lastSyncMsg}</Text>
        </Card>
      ) : null}

      <Button
        title={pendingCount > 0 ? `Sync Now (${pendingCount} pending)` : 'Sync Now'}
        variant="ghost"
        onPress={syncNow}
        style={{ marginTop: spacing.sm }}
      />

      <Text style={[font.caption, { textAlign: 'center', marginTop: spacing.lg }]}>
        All face data stays on this device. Attendance records sync when online.
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  divider: { width: 1, height: 40, backgroundColor: colors.border },
  actions: { gap: spacing.md, marginBottom: spacing.md },
  actionBtn: {
    borderRadius: radius.lg,
    padding: spacing.xl,
    alignItems: 'center',
  },
  actionIcon: { fontSize: 36, marginBottom: spacing.sm },
  actionLabel: { fontSize: 18, fontWeight: '800', color: '#fff' },
  actionSub: { fontSize: 13, color: 'rgba(255,255,255,0.75)', marginTop: 4 },
});
