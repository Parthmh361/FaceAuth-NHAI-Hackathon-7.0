import React, { useRef, useState } from 'react';
import {
  View, Text, TextInput, StyleSheet, ActivityIndicator,
  KeyboardAvoidingView, Platform, ScrollView,
} from 'react-native';
import { FaceCamera } from '../components/FaceCamera';
import { FaceAuthSDK } from '../FaceAuthSDK';
import { Card, Header, Button } from '../components/ui';
import { Icon } from '../components/Icon';
import { colors, spacing, radius, font } from '../theme';
import { useApp } from '../context/AppContext';
import type { RootStackScreenProps } from '../navigation/types';

type Phase = 'camera' | 'analyzing' | 'form' | 'saving' | 'done' | 'error';

export function EnrollScreen({ navigation }: RootStackScreenProps<'Enroll'>) {
  const { settings, refresh } = useApp();
  const [phase, setPhase] = useState<Phase>('camera');
  const [employeeId, setEmployeeId] = useState('');
  const [name, setName] = useState('');
  const [designation, setDesignation] = useState('');
  const [error, setError] = useState('');
  const [enrolledName, setEnrolledName] = useState('');

  // The face embedding is computed the instant we capture (while the camera's
  // temp photo still exists) and held here until the form is submitted. This is
  // why enrolment must NOT defer processing to the form — the temp photo can be
  // purged by then, hanging the image pipeline.
  const embeddingRef = useRef<Float32Array | null>(null);

  const handleCapture = async (path: string) => {
    setError('');
    setPhase('analyzing');
    try {
      const r = await FaceAuthSDK.prepareEnrollment(path);
      if (r.ok) {
        embeddingRef.current = r.embedding;
        setPhase('form');
      } else {
        setError(r.message);
        setPhase('error');
      }
    } catch (e: any) {
      setError(e?.message ?? 'Could not analyze the captured face.');
      setPhase('error');
    }
  };

  const handleSubmit = async () => {
    if (!employeeId.trim() || !name.trim()) {
      setError('Employee ID and name are required.');
      return;
    }
    if (!embeddingRef.current) {
      setError('Face data missing — please retake the photo.');
      setPhase('error');
      return;
    }
    setError('');
    setPhase('saving');
    try {
      const r = await FaceAuthSDK.saveEnrollment(embeddingRef.current, {
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
    } catch (e: any) {
      setError(e?.message ?? 'Enrollment failed unexpectedly.');
      setPhase('error');
    }
  };

  const reset = () => {
    embeddingRef.current = null;
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

  if (phase === 'analyzing' || phase === 'saving') {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={[font.body, { marginTop: spacing.lg }]}>
          {phase === 'analyzing' ? 'Analyzing face…' : 'Saving enrollment…'}
        </Text>
      </View>
    );
  }

  if (phase === 'error') {
    return (
      <View style={styles.center}>
        <Icon name="closeCircle" size={68} color={colors.danger} />
        <Text style={[font.h3, { marginTop: spacing.lg, textAlign: 'center', color: colors.danger }]}>
          Enrollment Failed
        </Text>
        <Text style={[font.body, { textAlign: 'center', marginTop: spacing.sm, color: colors.textMuted }]}>
          {error}
        </Text>
        <Button title="Retake Photo" onPress={reset} style={styles.doneBtn} />
        <Button
          title="Cancel"
          variant="ghost"
          onPress={() => navigation.goBack()}
          style={styles.doneBtnGhost}
        />
      </View>
    );
  }

  if (phase === 'done') {
    return (
      <View style={styles.center}>
        <Icon name="checkCircle" size={68} color={colors.success} />
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
