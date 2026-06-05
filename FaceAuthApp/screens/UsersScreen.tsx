import React, { useCallback, useState } from 'react';
import { Alert, FlatList, RefreshControl, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Database } from '../Database';
import type { EmployeeProfile } from '../Database';
import { Screen, Header, EmptyState, Button } from '../components/ui';
import { Icon } from '../components/Icon';
import { colors, spacing, radius, font } from '../theme';
import { useApp } from '../context/AppContext';
import type { RootStackParamList } from '../navigation/types';

function UserItem({
  item,
  onDelete,
}: { item: EmployeeProfile; onDelete: () => void }) {
  const enrolled = new Date(item.enrolledAt).toLocaleDateString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
  });
  return (
    <View style={styles.item}>
      <View style={styles.avatar}>
        <Text style={styles.avatarLetter}>{item.name.charAt(0).toUpperCase()}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={font.body}>{item.name}</Text>
        <Text style={[font.caption, { marginTop: 2 }]}>
          {item.designation ? `${item.designation} · ` : ''}{item.employeeId}
        </Text>
        <Text style={[font.caption, { marginTop: 2 }]}>Enrolled {enrolled}</Text>
      </View>
      <TouchableOpacity onPress={onDelete} style={styles.deleteBtn} activeOpacity={0.7}>
        <Icon name="close" size={16} color={colors.danger} />
      </TouchableOpacity>
    </View>
  );
}

export function UsersScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { refresh } = useApp();
  const [profiles, setProfiles] = useState<EmployeeProfile[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await Database.getEmployeeProfiles();
      setProfiles(data);
    } catch { /* db may not be ready on first paint */ }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const confirmDelete = (emp: EmployeeProfile) => {
    Alert.alert(
      'Delete Employee',
      `Remove ${emp.name} (${emp.employeeId})?\n\nThis cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            await Database.deleteEmployee(emp.employeeId);
            await refresh();
            await load();
          },
        },
      ],
    );
  };

  return (
    <Screen scroll={false} padded={false}>
      <View style={styles.headerWrap}>
        <Header
          title="Employees"
          subtitle={`${profiles.length} enrolled`}
          right={
            <Button
              title="+ Enroll"
              onPress={() => navigation.navigate('Enroll')}
              style={styles.enrollBtn}
            />
          }
        />
      </View>
      <FlatList
        data={profiles}
        keyExtractor={p => p.employeeId}
        renderItem={({ item }) => (
          <UserItem item={item} onDelete={() => confirmDelete(item)} />
        )}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <EmptyState
            icon="users"
            text={'No employees enrolled yet.\nTap + Enroll to add the first face profile.'}
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
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: spacing.md,
    borderBottomWidth: 1, borderBottomColor: colors.border,
    gap: spacing.md,
  },
  avatar: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: colors.primary + '33',
    alignItems: 'center', justifyContent: 'center',
  },
  avatarLetter: { fontSize: 18, fontWeight: '700', color: colors.primary },
  deleteBtn: {
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: colors.danger + '22',
    alignItems: 'center', justifyContent: 'center',
  },
  deleteTxt: { color: colors.danger, fontWeight: '700', fontSize: 14 },
  enrollBtn: { paddingVertical: 8, paddingHorizontal: spacing.md },
});
