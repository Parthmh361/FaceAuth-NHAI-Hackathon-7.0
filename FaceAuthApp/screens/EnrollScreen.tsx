import React, { useState } from 'react';
import {
  View, Text, TextInput, StyleSheet, ActivityIndicator,
  KeyboardAvoidingView, Platform, ScrollView,
} from 'react-native';
import { FaceCamera } from '../components/FaceCamera';
import { FaceAuthSDK } from '../FaceAuthSDK';
import { Card, Header, Button } from '../components/ui';
import { colors, spacing, radius, font } from '../theme';
import { useApp } from '../context/AppContext';
import type { RootStackScreenProps } from '../navigation/types';

type Phase = 'camera' | 'form' | 'processing' | 'done' | 'error';

export function EnrollScreen({ navigation }: RootStackScreenProps<'Enroll'>) {
  const { settings, refresh } = useApp();
  const [phase, setPhase] = useState<Phase>('camera');
  const [photoPath, setPhotoPath] = useState('');
  const [employeeId, setEmployeeId] = useState('');
  const [name, setName] = useState('');
  const [designation, setDesignation] = useState('');
  const [error, setError] = useState('');
  const [enrolledName, setEnrolledName] = useState('');

  const handleCapture = (path: string) => {
    setPhotoPath(path);
    setPhase('form');
  };

  const handleSubmit = async () => {
    if (!employeeId.trim() || !name.trim()) {
      setError('Employee ID and name are required.');
      return;
    }
    setError('');
    setPhase('processing');
    const r = await FaceAuthSDK.enrollFromPhoto(photoPath, {
      employeeId: employeeId.trim(),
      name: name.trim(),
      designation: designation.trim(),
    });
    if (r.ok) {
      setEnrolledName(name.trim());
      await refresh();
      setPhase('done');
    } else {
      setError(r.message);
      setPhase('error');
    }
  };

  const reset = () => {
    setPhotoPath('');
    setEmployeeId('');
    setName('');
    setDesignation('');
    setError('');
    setPhase('camera');
  };

  if (phase === 'camera') {
    return (
      <FaceCamera
        cameraPosition={settings.cameraPosition}
        livenessEnabled={settings.livenessEnabled}
        actionLabel="Enroll Employee"
        onCapture={handleCapture}
        onCancel={() => navigation.goBack()}
      />
    );
  }

  if (phase === 'processing') {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={[font.body, { marginTop: spacing.lg }]}>Processing face…</Text>
      </View>
    );
  }

  if (phase === 'done') {
    return (
      <View style={styles.center}>
        <Text style={styles.bigIcon}>✅</Text>
        <Text style={[font.h2, { marginTop: spacing.lg, textAlign: 'center' }]}>
          {enrolledName} enrolled!
        </Text>
        <Text style={[font.label, { textAlign: 'center', marginTop: spacing.sm }]}>
          Face profile saved securely on device.
        </Text>
        <Button title="Enroll Another" onPress={reset} style={styles.doneBtn} />
        <Button
          title="Done"
          variant="ghost"
          onPress={() => navigation.goBack()}
          style={styles.doneBtnGhost}
        />
      </View>
    );
  }

  // form (and error recovery — user can re-submit after seeing error)
  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.bg }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.formScroll}>
        <Header title="Employee Details" />
        <Text style={[font.label, { marginBottom: spacing.md }]}>
          Face captured successfully. Enter the employee's details.
        </Text>

        <Card>
          <Text style={font.label}>Employee ID *</Text>
          <TextInput
            style={styles.input}
            placeholder="EMP-001"
            placeholderTextColor={colors.textFaint}
            value={employeeId}
            onChangeText={setEmployeeId}
            autoCapitalize="characters"
          />

          <Text style={[font.label, { marginTop: spacing.md }]}>Full Name *</Text>
          <TextInput
            style={styles.input}
            placeholder="Rajesh Kumar"
            placeholderTextColor={colors.textFaint}
            value={name}
            onChangeText={setName}
            autoCapitalize="words"
          />

          <Text style={[font.label, { marginTop: spacing.md }]}>Designation</Text>
          <TextInput
            style={styles.input}
            placeholder="Field Engineer"
            placeholderTextColor={colors.textFaint}
            value={designation}
            onChangeText={setDesignation}
            autoCapitalize="words"
          />

          {error ? <Text style={styles.errText}>{error}</Text> : null}

          <Button title="Enroll" onPress={handleSubmit} style={{ marginTop: spacing.lg }} />
          <Button
            title="Retake Photo"
            variant="ghost"
            onPress={() => setPhase('camera')}
            style={{ marginTop: spacing.sm }}
          />
        </Card>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1, backgroundColor: colors.bg,
    alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  bigIcon: { fontSize: 64 },
  formScroll: { padding: spacing.lg, paddingBottom: spacing.xxl },
  input: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md, borderWidth: 1, borderColor: colors.border,
    paddingHorizontal: spacing.md, paddingVertical: 12,
    color: colors.text, fontSize: 15, marginTop: spacing.xs,
  },
  errText: { color: colors.danger, ...font.caption, marginTop: spacing.sm },
  doneBtn: { marginTop: spacing.xl, width: 240 },
  doneBtnGhost: { marginTop: spacing.sm, width: 240 },
});
