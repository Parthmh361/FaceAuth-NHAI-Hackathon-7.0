import React, { useCallback, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Database } from '../Database';
import type { AttendanceRecord } from '../Database';
import { Screen, Header, EmptyState, Pill, Row } from '../components/ui';
import { colors, spacing, font } from '../theme';
import { useApp } from '../context/AppContext';

function fmtTime(ts: number): string {
  return new Date(ts).toLocaleString('en-IN', {
    day: '2-digit', month: 'short',
    hour: '2-digit', minute: '2-digit', hour12: true,
  });
}

function ScorePill({ score }: { score: number }) {
  const pct = Math.round(score * 100);
  const tint = pct >= 80 ? colors.success : pct >= 65 ? colors.warning : colors.danger;
  return <Pill text={`${pct}%`} tint={tint} />;
}

function HistoryItem({ item }: { item: AttendanceRecord }) {
  return (
    <View style={styles.item}>
      <Row style={styles.itemTop}>
        <Text style={[font.body, { flex: 1 }]} numberOfLines={1}>{item.employeeName}</Text>
        <ScorePill score={item.similarityScore} />
      </Row>
      <Row style={styles.itemBottom}>
        <Text style={font.caption}>{fmtTime(item.timestamp)}</Text>
        <Row style={{ gap: spacing.xs }}>
          {item.challenge !== 'NONE' && (
            <Pill text={item.challenge} tint={colors.accent} />
          )}
          <Pill
            text={item.synced ? 'SYNCED' : 'PENDING'}
            tint={item.synced ? colors.success : colors.warning}
          />
        </Row>
      </Row>
    </View>
  );
}

export function HistoryScreen() {
  const { syncNow } = useApp();
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await Database.getAttendanceHistory(200);
      setRecords(data);
    } catch { /* db may not be ready on first paint */ }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onRefresh = async () => {
    setRefreshing(true);
    await syncNow();
    await load();
    setRefreshing(false);
  };

  return (
    <Screen scroll={false} padded={false}>
      <View style={styles.headerWrap}>
        <Header
          title="Attendance"
          subtitle={`${records.length} record${records.length !== 1 ? 's' : ''}`}
        />
      </View>
      <FlatList
        data={records}
        keyExtractor={r => String(r.id)}
        renderItem={({ item }) => <HistoryItem item={item} />}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <EmptyState
            icon="history"
            text={'No attendance records yet.\nVerify an employee to log attendance.'}
          />
        }
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
          />
        }
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  headerWrap: { paddingHorizontal: spacing.lg },
  list: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl },
  item: {
    paddingVertical: spacing.md,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  itemTop: { justifyContent: 'space-between', marginBottom: spacing.xs },
  itemBottom: { justifyContent: 'space-between' },
});
