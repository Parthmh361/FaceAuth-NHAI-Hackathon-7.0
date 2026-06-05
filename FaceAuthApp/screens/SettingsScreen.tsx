import React, { useEffect, useState } from 'react';
import {
  Alert, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { Screen, Header, Card, Button, Label, Row } from '../components/ui';
import { colors, spacing, radius, font } from '../theme';
import { useApp } from '../context/AppContext';
import { FaceAuthSDK } from '../FaceAuthSDK';

export function SettingsScreen() {
  const { settings, updateSettings, refresh } = useApp();

  const [threshold, setThreshold] = useState(String(settings.matchThreshold));
  const [endpoint, setEndpoint] = useState(settings.awsEndpoint);

  // Sync form with context when settings change (e.g. first load from storage)
  useEffect(() => {
    setThreshold(String(settings.matchThreshold));
    setEndpoint(settings.awsEndpoint);
  }, [settings.matchThreshold, settings.awsEndpoint]);

  const save = async () => {
    const t = parseFloat(threshold);
    if (isNaN(t) || t < 0.1 || t > 1.0) {
      Alert.alert('Invalid Threshold', 'Threshold must be a number between 0.10 and 1.00');
      return;
    }
    await updateSettings({ matchThreshold: t, awsEndpoint: endpoint.trim() });
    Alert.alert('Saved', 'Settings updated successfully.');
  };

  const clearAll = () => {
    Alert.alert(
      'Clear All Employees',
      'Permanently delete all enrolled face profiles? Attendance records will be kept.\n\nThis cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear All',
          style: 'destructive',
          onPress: async () => {
            await FaceAuthSDK.clearAll();
            await refresh();
            Alert.alert('Done', 'All employee profiles have been deleted.');
          },
        },
      ],
    );
  };

  return (
    <Screen>
      <Header title="Settings" />

      {/* Recognition */}
      <Card>
        <Text style={[font.h3, { marginBottom: spacing.md }]}>Recognition</Text>

        <Label>Match Threshold (0.10 – 1.00)</Label>
        <TextInput
          style={styles.input}
          value={threshold}
          onChangeText={setThreshold}
          keyboardType="decimal-pad"
          placeholderTextColor={colors.textFaint}
        />
        <Text style={[font.caption, { marginTop: spacing.xs }]}>
          Default 0.60. Lower = more permissive, higher = stricter.
        </Text>

        <Row style={styles.toggleRow}>
          <View style={{ flex: 1 }}>
            <Text style={font.body}>Liveness Check</Text>
            <Text style={font.caption}>Challenge-response before capture</Text>
          </View>
          <Switch
            value={settings.livenessEnabled}
            onValueChange={v => updateSettings({ livenessEnabled: v })}
            trackColor={{ true: colors.primary, false: colors.border }}
            thumbColor="#fff"
          />
        </Row>

        <Row style={styles.toggleRow}>
          <View style={{ flex: 1 }}>
            <Text style={font.body}>Spoof Detection</Text>
            <Text style={font.caption}>Block photo/screen attacks</Text>
          </View>
          <Switch
            value={settings.spoofCheckEnabled}
            onValueChange={v => updateSettings({ spoofCheckEnabled: v })}
            trackColor={{ true: colors.primary, false: colors.border }}
            thumbColor="#fff"
          />
        </Row>
      </Card>

      {/* Camera */}
      <Card>
        <Text style={[font.h3, { marginBottom: spacing.md }]}>Camera</Text>
        <Label>Camera Position</Label>
        <Row style={{ gap: spacing.md }}>
          {(['front', 'back'] as const).map(pos => (
            <TouchableOpacity
              key={pos}
              style={[
                styles.camBtn,
                settings.cameraPosition === pos && styles.camBtnActive,
              ]}
              onPress={() => updateSettings({ cameraPosition: pos })}
              activeOpacity={0.8}>
              <Text
                style={[
                  styles.camBtnTxt,
                  settings.cameraPosition === pos && { color: '#fff' },
                ]}>
                {pos.charAt(0).toUpperCase() + pos.slice(1)} Camera
              </Text>
            </TouchableOpacity>
          ))}
        </Row>
      </Card>

      {/* AWS Sync */}
      <Card>
        <Text style={[font.h3, { marginBottom: spacing.md }]}>AWS Sync</Text>
        <Label>Attendance Endpoint</Label>
        <TextInput
          style={[styles.input, { fontSize: 13 }]}
          value={endpoint}
          onChangeText={setEndpoint}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          placeholder="https://..."
          placeholderTextColor={colors.textFaint}
        />
        <Text style={[font.caption, { marginTop: spacing.xs }]}>
          Records sync automatically when online. Use aws-backend/mock_server.py for offline demos.
        </Text>
      </Card>

      <Button title="Save Settings" onPress={save} style={{ marginBottom: spacing.md }} />

      {/* Danger zone */}
      <Card style={styles.dangerCard}>
        <Text style={[font.h3, { color: colors.danger, marginBottom: spacing.xs }]}>
          Danger Zone
        </Text>
        <Text style={[font.caption, { marginBottom: spacing.md }]}>
          Irreversible — attendance logs are kept, only face profiles are removed.
        </Text>
        <Button title="Clear All Employee Profiles" variant="danger" onPress={clearAll} />
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  input: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md, borderWidth: 1, borderColor: colors.border,
    paddingHorizontal: spacing.md, paddingVertical: 12,
    color: colors.text, fontSize: 15, marginTop: spacing.xs,
  },
  toggleRow: { justifyContent: 'space-between', marginTop: spacing.lg },
  camBtn: {
    flex: 1, paddingVertical: 10, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.border,
    alignItems: 'center', backgroundColor: colors.surfaceAlt,
  },
  camBtnActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  camBtnTxt: { color: colors.textMuted, fontWeight: '700' },
  dangerCard: { borderColor: colors.danger + '55', marginBottom: spacing.xxl },
});
