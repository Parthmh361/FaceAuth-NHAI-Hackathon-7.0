import React, { useState } from 'react';
import { StyleSheet, Text, View, ActivityIndicator } from 'react-native';
import { FaceCamera } from '../components/FaceCamera';
import { FaceAuthSDK } from '../FaceAuthSDK';
import type { VerifySuccess } from '../FaceAuthSDK';
import { Card, Button, Pill } from '../components/ui';
import { Icon } from '../components/Icon';
import { colors, spacing, font } from '../theme';
import { useApp } from '../context/AppContext';
import type { RootStackScreenProps } from '../navigation/types';

type Phase = 'camera' | 'processing' | 'result' | 'error';

function TimingCell({ label, ms }: { label: string; ms: number }) {
  return (
    <View style={{ alignItems: 'center', flex: 1 }}>
      <Text style={{ fontSize: 13, fontWeight: '700', color: colors.text }}>{ms}ms</Text>
      <Text style={font.caption}>{label}</Text>
    </View>
  );
}

export function VerifyScreen({ navigation }: RootStackScreenProps<'Verify'>) {
  const { settings, refresh } = useApp();
  const [phase, setPhase] = useState<Phase>('camera');
  const [result, setResult] = useState<VerifySuccess | null>(null);
  const [errMsg, setErrMsg] = useState('');

  const handleCapture = async (photoPath: string) => {
    setPhase('processing');
    try {
      const r = await FaceAuthSDK.verifyFromPhoto(photoPath, 'CHALLENGE');
      if (r.ok) {
        setResult(r);
        await refresh();
        setPhase('result');
      } else {
        setErrMsg(r.message);
        setPhase('error');
      }
    } catch (e: any) {
      setErrMsg(e?.message ?? 'Verification failed unexpectedly.');
      setPhase('error');
    }
  };

  const retry = () => { setResult(null); setErrMsg(''); setPhase('camera'); };

  if (phase === 'camera') {
    return (
      <FaceCamera
        cameraPosition={settings.cameraPosition}
        livenessEnabled={settings.livenessEnabled}
        actionLabel="Verify Identity"
        onCapture={handleCapture}
        onCancel={() => navigation.goBack()}
      />
    );
  }

  if (phase === 'processing') {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={[font.body, { marginTop: spacing.lg }]}>Matching face…</Text>
      </View>
    );
  }

  if (phase === 'result' && result) {
    const pct = Math.round(result.match.score * 100);
    const scoreColor = pct >= 80 ? colors.success : pct >= 65 ? colors.warning : colors.danger;

    return (
      <View style={styles.center}>
        <View style={styles.bigIcon}><Icon name="checkCircle" size={72} color={colors.success} /></View>

        <Card style={styles.resultCard}>
          <Text style={[font.h2, styles.centered, { marginBottom: spacing.xs }]}>
            {result.match.name}
          </Text>
          {result.match.designation ? (
            <Text style={[font.label, styles.centered, { marginBottom: spacing.lg }]}>
              {result.match.designation}
            </Text>
          ) : null}

          <View style={{ alignItems: 'center', marginBottom: spacing.md }}>
            <Text style={[styles.scoreValue, { color: scoreColor }]}>{pct}%</Text>
            <Text style={font.caption}>confidence</Text>
          </View>

          <View style={styles.pillRow}>
            <Pill text={`ID: ${result.match.employeeId}`} tint={colors.primary} />
            {result.challenge !== 'NONE' && (
              <Pill text={result.challenge} tint={colors.accent} />
            )}
            <Pill text="LOGGED" tint={colors.success} />
          </View>

          <View style={styles.timingsRow}>
            <TimingCell label="ML Kit" ms={result.timing.mlKitMs} />
            <TimingCell label="ONNX" ms={result.timing.onnxMs} />
            <TimingCell label="DB" ms={result.timing.dbMs} />
            <TimingCell label="Total" ms={result.timing.totalMs} />
          </View>
        </Card>

        <Button title="Verify Another" onPress={retry} style={styles.doneBtn} />
        <Button
          title="Done"
          variant="ghost"
          onPress={() => navigation.goBack()}
          style={styles.doneBtnGhost}
        />
      </View>
    );
  }

  // error
  return (
    <View style={styles.center}>
      <View style={styles.bigIcon}><Icon name="closeCircle" size={72} color={colors.danger} /></View>
      <Card style={styles.resultCard}>
        <Text style={[font.h3, styles.centered, { color: colors.danger, marginBottom: spacing.sm }]}>
          Verification Failed
        </Text>
        <Text style={[font.body, styles.centered, { color: colors.textMuted }]}>{errMsg}</Text>
      </Card>
      <Button title="Try Again" onPress={retry} style={styles.doneBtn} />
      <Button
        title="Cancel"
        variant="ghost"
        onPress={() => navigation.goBack()}
        style={styles.doneBtnGhost}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1, backgroundColor: colors.bg,
    alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  bigIcon: { fontSize: 64, marginBottom: spacing.lg },
  centered: { textAlign: 'center' },
  resultCard: { width: '100%', alignItems: 'center' },
  scoreValue: { fontSize: 48, fontWeight: '900' },
  pillRow: {
    flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap',
    justifyContent: 'center', marginBottom: spacing.lg,
  },
  timingsRow: {
    flexDirection: 'row', width: '100%',
    borderTopWidth: 1, borderTopColor: colors.border,
    paddingTop: spacing.md,
  },
  doneBtn: { marginTop: spacing.xl, width: 240 },
  doneBtnGhost: { marginTop: spacing.sm, width: 240 },
});
