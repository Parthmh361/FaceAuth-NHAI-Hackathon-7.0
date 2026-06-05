/**
 * Reusable camera + challenge-response liveness capture surface.
 * Shared by the Enroll and Verify screens. It drives the pseudo-realtime
 * tracking loop, runs the random liveness challenge, and calls onCapture()
 * with the full-resolution photo path once the user passes + holds still.
 *
 * The heavy embedding/match work is intentionally NOT here — the screen takes
 * the returned photo path and hands it to FaceAuthSDK.
 */
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Dimensions, Platform } from 'react-native';
import {
  Camera, useCameraDevice, CameraPosition,
} from 'react-native-vision-camera';
import RNFS from 'react-native-fs';
import FaceDetection from '@react-native-ml-kit/face-detection';
import { colors, radius, spacing } from '../theme';
import { evaluateChallenge, ChallengeType } from '../core/faceMath';

const { width } = Dimensions.get('window');

const CHALLENGES: ChallengeType[] = ['BLINK', 'SMILE', 'TURN_LEFT', 'TURN_RIGHT'];
const PROMPTS: Record<ChallengeType, string> = {
  BLINK: 'Please BLINK', SMILE: 'Please SMILE',
  TURN_LEFT: 'Turn head LEFT', TURN_RIGHT: 'Turn head RIGHT',
};
const ICONS: Record<ChallengeType, string> = {
  BLINK: '👁', SMILE: '😊', TURN_LEFT: '↩', TURN_RIGHT: '↪',
};

export function FaceCamera({
  cameraPosition = 'front',
  livenessEnabled = true,
  actionLabel,
  onCapture,
  onCancel,
}: {
  cameraPosition?: CameraPosition;
  livenessEnabled?: boolean;
  actionLabel: string;
  onCapture: (photoPath: string) => void;
  onCancel: () => void;
}) {
  const device = useCameraDevice(cameraPosition);
  const cameraRef = useRef<Camera>(null);

  const [faceBounds, setFaceBounds] = useState<any>(null);
  const [msg, setMsg] = useState('Position your face in the frame');
  const [aligned, setAligned] = useState(false);
  const [challenge, setChallenge] = useState<ChallengeType | null>(null);
  const [challengeDone, setChallengeDone] = useState(false);
  const [captured, setCaptured] = useState(false);

  const busy = useRef(false);
  const stable = useRef(0);
  const challengeRef = useRef<ChallengeType | null>(null);
  const doneRef = useRef(false);
  const blinkClosed = useRef(false);
  const smileStreak = useRef(0);
  const capturedRef = useRef(false);

  const capture = async () => {
    if (!cameraRef.current || capturedRef.current) return;
    capturedRef.current = true;
    setCaptured(true);
    try {
      const photo = await cameraRef.current.takePhoto({ flash: 'off' });
      onCapture(photo.path);
    } catch {
      capturedRef.current = false;
      setCaptured(false);
    }
  };

  useEffect(() => {
    // If liveness is disabled, skip straight to the stable-hold phase.
    if (!livenessEnabled) { doneRef.current = true; setChallengeDone(true); }

    const interval = setInterval(async () => {
      if (busy.current || !cameraRef.current || capturedRef.current) return;
      busy.current = true;
      let tmp = '';
      try {
        const photo = await cameraRef.current.takePhoto({ flash: 'off' });
        tmp = photo.path;
        const faces = await FaceDetection.detect(`file://${photo.path}`, {
          classificationMode: 'all', contourMode: 'none',
          landmarkMode: 'none', performanceMode: 'fast',
        });

        if (faces.length !== 1) {
          setFaceBounds(null);
          setMsg(faces.length === 0 ? 'No face detected' : 'Multiple faces detected');
          setAligned(false); stable.current = 0;
          return;
        }

        const face = faces[0];
        const screenH = Dimensions.get('window').height;
        const scale = Math.max(width / photo.width, screenH / photo.height);
        const offX = (photo.width * scale - width) / 2;
        const offY = (photo.height * scale - screenH) / 2;
        setFaceBounds({
          x: face.frame.left * scale - offX, y: face.frame.top * scale - offY,
          width: face.frame.width * scale, height: face.frame.height * scale,
        });

        const yaw = face.yawAngle ?? 0;
        const le = face.leftEyeOpenProbability ?? 0;
        const re = face.rightEyeOpenProbability ?? 0;
        const smile = face.smilingProbability ?? 0;

        // Phase 1 — assign a random challenge
        if (livenessEnabled && !challengeRef.current) {
          const picked = CHALLENGES[Math.floor(Math.random() * CHALLENGES.length)];
          challengeRef.current = picked; setChallenge(picked);
          setMsg(PROMPTS[picked]); setAligned(false); stable.current = 0;
          return;
        }

        // Phase 2 — verify the challenge
        if (livenessEnabled && !doneRef.current && challengeRef.current) {
          const step = evaluateChallenge(
            challengeRef.current, { leftEye: le, rightEye: re, smile, yaw },
            { blinkClosed: blinkClosed.current, smileStreak: smileStreak.current },
          );
          blinkClosed.current = step.state.blinkClosed;
          smileStreak.current = step.state.smileStreak;
          if (step.passed) {
            doneRef.current = true; setChallengeDone(true);
            setMsg('Challenge passed! Hold still…'); stable.current = 0;
          } else {
            setMsg(PROMPTS[challengeRef.current]);
          }
          setAligned(false);
          return;
        }

        // Phase 3 — stable alignment → capture
        if (Math.abs(yaw) > 15) {
          setMsg('Look straight ahead'); setAligned(false); stable.current = 0;
        } else if (le < 0.3 || re < 0.3) {
          setMsg('Keep your eyes open'); setAligned(false); stable.current = 0;
        } else {
          setMsg('Perfect! Capturing…'); setAligned(true);
          stable.current += 1;
          if (stable.current >= 3) { stable.current = 0; await capture(); }
        }
      } catch {
        // frame dropped — ignore
      } finally {
        if (tmp) RNFS.unlink(tmp).catch(() => {});
        busy.current = false;
      }
    }, 400);

    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [livenessEnabled]);

  if (!device) {
    return (
      <View style={styles.center}>
        <Text style={{ color: colors.text, fontSize: 16 }}>No camera device available</Text>
        <TouchableOpacity onPress={onCancel} style={styles.cancelBtn}>
          <Text style={styles.cancelText}>Go back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={StyleSheet.absoluteFill}>
      <Camera
        ref={cameraRef} style={StyleSheet.absoluteFill}
        device={device} isActive={!captured} photo
      />

      {faceBounds && (
        <View style={{
          position: 'absolute', left: faceBounds.x, top: faceBounds.y,
          width: faceBounds.width, height: faceBounds.height,
          borderWidth: 3, borderRadius: radius.md,
          borderColor: aligned ? colors.success : challengeDone ? colors.accent : colors.danger,
        }} />
      )}

      {/* Challenge card */}
      {livenessEnabled && challenge && !challengeDone && (
        <View style={styles.challengeCard}>
          <Text style={styles.challengeIcon}>{ICONS[challenge]}</Text>
          <Text style={styles.challengeText}>{PROMPTS[challenge]}</Text>
        </View>
      )}
      {challengeDone && (
        <View style={[styles.challengeCard, { backgroundColor: colors.success + 'E0', borderColor: colors.success }]}>
          <Text style={styles.challengeIcon}>✅</Text>
          <Text style={[styles.challengeText, { color: '#fff' }]}>Liveness verified</Text>
        </View>
      )}

      {/* Status + controls */}
      <View style={styles.topBar}>
        <TouchableOpacity onPress={onCancel}><Text style={styles.cancelText}>✕ Cancel</Text></TouchableOpacity>
        <Text style={styles.action}>{actionLabel}</Text>
        <View style={{ width: 60 }} />
      </View>

      <View style={styles.bottom}>
        <View style={styles.msgPill}>
          <Text style={[styles.msgText, { color: aligned ? colors.success : '#fff' }]}>{msg}</Text>
        </View>
        <TouchableOpacity style={styles.shutter} onPress={capture}>
          <View style={styles.shutterInner} />
        </TouchableOpacity>
        <Text style={styles.hint}>Auto-captures when liveness passes & you hold still</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
  topBar: {
    position: 'absolute', top: Platform.OS === 'android' ? 40 : 56, left: 0, right: 0,
    paddingHorizontal: spacing.lg, flexDirection: 'row',
    alignItems: 'center', justifyContent: 'space-between',
  },
  action: { color: '#fff', fontSize: 16, fontWeight: '700' },
  cancelBtn: { marginTop: spacing.lg, padding: spacing.md },
  cancelText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  challengeCard: {
    position: 'absolute', top: 150, alignSelf: 'center', alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.82)', borderRadius: radius.xl,
    paddingHorizontal: 28, paddingVertical: 14, borderWidth: 1.5, borderColor: colors.accent,
  },
  challengeIcon: { fontSize: 34, marginBottom: 4 },
  challengeText: { color: colors.accent, fontSize: 18, fontWeight: '800' },
  bottom: {
    position: 'absolute', bottom: 44, left: 0, right: 0, alignItems: 'center',
  },
  msgPill: {
    backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm, borderRadius: radius.pill, marginBottom: spacing.lg,
  },
  msgText: { fontWeight: '700', fontSize: 15 },
  shutter: {
    width: 76, height: 76, borderRadius: 38, borderWidth: 4,
    borderColor: '#fff', alignItems: 'center', justifyContent: 'center',
  },
  shutterInner: { width: 60, height: 60, borderRadius: 30, backgroundColor: '#fff' },
  hint: { color: 'rgba(255,255,255,0.6)', fontSize: 12, marginTop: spacing.md },
});
