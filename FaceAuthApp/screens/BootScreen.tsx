import React, { useEffect, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ActivityIndicator,
} from 'react-native';
import { Camera } from 'react-native-vision-camera';
import { colors, spacing, radius, font } from '../theme';
import { useApp } from '../context/AppContext';
import type { RootStackScreenProps } from '../navigation/types';

export function BootScreen({ navigation }: RootStackScreenProps<'Boot'>) {
  const { modelReady, initError, initModel } = useApp();
  const [permStatus, setPermStatus] = useState<'unknown' | 'granted' | 'denied'>('unknown');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const s = Camera.getCameraPermissionStatus();
    setPermStatus(s === 'granted' ? 'granted' : s === 'denied' ? 'denied' : 'unknown');
  }, []);

  useEffect(() => {
    if (modelReady) navigation.replace('Tabs');
  }, [modelReady, navigation]);

  const requestPermission = async () => {
    const s = await Camera.requestCameraPermission();
    setPermStatus(s === 'granted' ? 'granted' : 'denied');
  };

  const handleInit = async () => {
    setLoading(true);
    await initModel();
    setLoading(false);
  };

  return (
    <View style={styles.root}>
      <View style={styles.logo}>
        <Text style={styles.logoTitle}>NHAI</Text>
        <Text style={styles.logoSub}>FaceAuth</Text>
        <Text style={styles.tagline}>Offline Face Recognition System</Text>
      </View>

      <View style={styles.card}>
        {permStatus !== 'granted' ? (
          <>
            <Text style={styles.cardTitle}>Camera Permission Required</Text>
            <Text style={styles.cardBody}>
              No images leave the device. Camera is used only for on-device recognition.
            </Text>
            {permStatus === 'denied' ? (
              <Text style={[styles.cardBody, { color: colors.danger, marginTop: spacing.sm }]}>
                Permission denied. Please enable camera access in device Settings.
              </Text>
            ) : (
              <TouchableOpacity style={styles.btn} onPress={requestPermission}>
                <Text style={styles.btnTxt}>Grant Camera Access</Text>
              </TouchableOpacity>
            )}
          </>
        ) : (
          <>
            <Text style={styles.cardTitle}>System Initialization</Text>
            {loading ? (
              <View style={styles.loadRow}>
                <ActivityIndicator color={colors.primary} />
                <Text style={[styles.cardBody, { marginLeft: spacing.md }]}>
                  Loading MobileFaceNet model…
                </Text>
              </View>
            ) : initError ? (
              <>
                <Text style={[styles.cardBody, { color: colors.danger }]}>{initError}</Text>
                <TouchableOpacity
                  style={[styles.btn, { backgroundColor: colors.danger }]}
                  onPress={handleInit}>
                  <Text style={styles.btnTxt}>Retry</Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                <Text style={styles.cardBody}>
                  Loads the 13.6 MB MobileFaceNet model and runs a warm-up pass.
                  Takes ~5 seconds on first launch.
                </Text>
                <TouchableOpacity style={styles.btn} onPress={handleInit}>
                  <Text style={styles.btnTxt}>Initialize System</Text>
                </TouchableOpacity>
              </>
            )}
          </>
        )}
      </View>

      <Text style={styles.footer}>
        NHAI Hackathon 7.0 · All processing on-device · No cloud required
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1, backgroundColor: colors.bg,
    alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  logo: { alignItems: 'center', marginBottom: spacing.xxl },
  logoTitle: {
    fontSize: 52, fontWeight: '900', color: colors.primary, letterSpacing: 6,
  },
  logoSub: { fontSize: 22, fontWeight: '700', color: colors.text, marginTop: -4 },
  tagline: { ...font.caption, marginTop: spacing.sm, textAlign: 'center' },
  card: {
    width: '100%', backgroundColor: colors.surface,
    borderRadius: radius.lg, padding: spacing.xl,
    borderWidth: 1, borderColor: colors.border,
  },
  cardTitle: { ...font.h3, marginBottom: spacing.md },
  cardBody: { ...font.body, color: colors.textMuted, lineHeight: 22 },
  loadRow: { flexDirection: 'row', alignItems: 'center', marginTop: spacing.md },
  btn: {
    marginTop: spacing.lg, backgroundColor: colors.primary,
    borderRadius: radius.md, paddingVertical: 14, alignItems: 'center',
  },
  btnTxt: { color: '#fff', fontSize: 16, fontWeight: '700' },
  footer: { ...font.caption, marginTop: spacing.xxl, textAlign: 'center' },
});
