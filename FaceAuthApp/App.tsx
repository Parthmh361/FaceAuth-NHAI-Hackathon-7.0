/**
 * NHAI Hackathon 7.0 — Offline Face Authentication System
 * Features: Challenge-response liveness · AES-256 encrypted embeddings
 *           Offline attendance queue · AWS sync on connectivity restore
 *           Adaptive gamma preprocessing · Performance benchmark overlay
 */

import React, { useCallback, useRef, useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  StatusBar,
  Platform,
  Linking,
  Alert,
  Image,
  ScrollView,
  Dimensions,
  TextInput,
} from 'react-native';
import {
  Camera,
  useCameraDevice,
  useCameraPermission,
  CameraPosition,
} from 'react-native-vision-camera';
import RNFS from 'react-native-fs';
import FaceDetection, { FaceDetectorOptions } from '@react-native-ml-kit/face-detection';
import { Database } from './Database';
import { FaceProcessor } from './FaceProcessor';
import { SpoofDetector } from './SpoofDetector';
import { SyncService } from './SyncService';
import { evaluateChallenge } from './core/faceMath';

const { width } = Dimensions.get('window');
const GALLERY_IMAGE_SIZE = width / 3 - 4;
const MODEL_NAME = 'w600k_mbf.onnx'; // swap to 'w600k_mbf_int8.onnx' after quantization

// ─── Challenge-response config ──────────────────────────────────
type ChallengeType = 'BLINK' | 'SMILE' | 'TURN_LEFT' | 'TURN_RIGHT';
const CHALLENGES: ChallengeType[] = ['BLINK', 'SMILE', 'TURN_LEFT', 'TURN_RIGHT'];

const CHALLENGE_PROMPTS: Record<ChallengeType, string> = {
  BLINK: 'Please BLINK',
  SMILE: 'Please SMILE',
  TURN_LEFT: 'Turn HEAD LEFT',
  TURN_RIGHT: 'Turn HEAD RIGHT',
};
const CHALLENGE_ICONS: Record<ChallengeType, string> = {
  BLINK: '👁',
  SMILE: '😊',
  TURN_LEFT: '↩',
  TURN_RIGHT: '↪',
};

interface Benchmark {
  mlKitMs: number;
  prepMs: number;
  onnxMs: number;
  dbMs: number;
  totalMs: number;
}

// ─── Permission Screen ───────────────────────────────────────────
function PermissionScreen({ onRequest }: { onRequest: () => void }) {
  return (
    <View style={styles.permissionContainer}>
      <StatusBar barStyle="light-content" backgroundColor="#0D0D0D" />
      <Text style={styles.lockIcon}>🔒</Text>
      <Text style={styles.permissionTitle}>Camera Access Required</Text>
      <Text style={styles.permissionDescription}>
        This app needs camera access to perform offline face authentication.
        Your camera data never leaves this device.
      </Text>
      <TouchableOpacity style={styles.permissionButton} onPress={onRequest}>
        <Text style={styles.permissionButtonText}>Grant Camera Access</Text>
      </TouchableOpacity>
    </View>
  );
}

function NoDeviceScreen() {
  return (
    <View style={styles.permissionContainer}>
      <StatusBar barStyle="light-content" backgroundColor="#0D0D0D" />
      <Text style={styles.lockIcon}>📷</Text>
      <Text style={styles.permissionTitle}>No Camera Found</Text>
      <Text style={styles.permissionDescription}>
        Please run on a physical device with a front-facing camera.
      </Text>
    </View>
  );
}

// ─── Main App ─────────────────────────────────────────────────────
function App(): React.JSX.Element {
  const [cameraPosition, setCameraPosition] = useState<CameraPosition>('front');
  const device = useCameraDevice(cameraPosition);
  const { hasPermission, requestPermission } = useCameraPermission();

  const cameraRef = useRef<Camera>(null);

  // UI state
  const [capturedPhoto, setCapturedPhoto] = useState<string | null>(null);
  const [gallery, setGallery] = useState<string[]>([]);
  const [showGallery, setShowGallery] = useState(false);
  const [enrollName, setEnrollName] = useState('');

  // ONNX
  const [onnxSession, setOnnxSession] = useState<any>(null);
  const [isInitializingONNX, setIsInitializingONNX] = useState(false);

  // Tracking / liveness
  const [isTracking, setIsTracking] = useState(false);
  const [faceBounds, setFaceBounds] = useState<any>(null);
  const [livenessMsg, setLivenessMsg] = useState('Position face in frame');
  const [isAligned, setIsAligned] = useState(false);
  const isProcessingFrame = useRef(false);
  const stableFramesCount = useRef(0);

  // Challenge-response liveness
  const [challenge, setChallenge] = useState<ChallengeType | null>(null);
  const [challengeCompleted, setChallengeCompleted] = useState(false);
  const challengeRef = useRef<ChallengeType | null>(null);
  const challengeCompletedRef = useRef(false);
  const blinkWasClosed = useRef(false);
  const smileFrames = useRef(0);

  // Sync status
  const [pendingCount, setPendingCount] = useState(0);
  const [syncMsg, setSyncMsg] = useState('');

  // Benchmark overlay
  const [benchmark, setBenchmark] = useState<Benchmark | null>(null);
  const [showBenchmark, setShowBenchmark] = useState(false);

  // Keep refs in sync with state (so interval callbacks always read latest values)
  useEffect(() => { challengeRef.current = challenge; }, [challenge]);
  useEffect(() => { challengeCompletedRef.current = challengeCompleted; }, [challengeCompleted]);

  // ─── Init: DB + gallery + SyncService ────────────────────────
  useEffect(() => {
    Database.initDB().catch(e => console.error('DB init error', e));

    RNFS.readDir(RNFS.DocumentDirectoryPath).then(files => {
      const imgs = files
        .filter(f => f.isFile() && f.name.endsWith('.jpg'))
        .sort((a, b) => b.mtime!.getTime() - a.mtime!.getTime())
        .map(f => `file://${f.path}`);
      setGallery(imgs);
    }).catch(() => {});

    SyncService.start(result => {
      if (result.synced > 0) {
        setSyncMsg(`Synced ${result.synced} records`);
        refreshPendingCount();
        setTimeout(() => setSyncMsg(''), 4000);
      }
    });

    refreshPendingCount();
    return () => SyncService.stop();
  }, []);

  const refreshPendingCount = async () => {
    try {
      const n = await Database.getPendingCount();
      setPendingCount(n);
    } catch {}
  };

  // ─── ONNX initialisation ──────────────────────────────────────
  const initONNX = async () => {
    setIsInitializingONNX(true);
    try {
      const { InferenceSession, Tensor } = require('onnxruntime-react-native');
      const destPath = `${RNFS.DocumentDirectoryPath}/${MODEL_NAME}`;

      // Android: copy from compressed APK assets to a real file path.
      // iOS: model must be added to the Xcode bundle; access via RNFS.MainBundlePath.
      if (Platform.OS === 'android') {
        if (!(await RNFS.exists(destPath))) {
          await RNFS.copyFileAssets(MODEL_NAME, destPath);
        }
      }

      const modelPath =
        Platform.OS === 'ios'
          ? `${RNFS.MainBundlePath}/${MODEL_NAME}`
          : destPath;

      const session = await InferenceSession.create(modelPath);

      // Warm-up pass to load weights into L1/L2 cache
      const dummy = new Float32Array(1 * 3 * 112 * 112);
      const t = new Tensor('float32', dummy, [1, 3, 112, 112]);
      const t0 = Date.now();
      await session.run({ 'input.1': t });
      const warmupMs = Date.now() - t0;

      setOnnxSession(session);
      Alert.alert('ONNX Ready', `Model loaded. Warm-up: ${warmupMs}ms`);
    } catch (err: any) {
      Alert.alert('ONNX Error', err.message);
    } finally {
      setIsInitializingONNX(false);
    }
  };

  // ─── Pseudo-realtime tracking loop (400ms / 2.5 FPS) ─────────
  useEffect(() => {
    let interval: NodeJS.Timeout;

    if (isTracking && !capturedPhoto) {
      interval = setInterval(async () => {
        if (isProcessingFrame.current || !cameraRef.current) return;
        isProcessingFrame.current = true;

        let tempPath = '';
        try {
          const photo = await cameraRef.current.takePhoto({ flash: 'off' });
          tempPath = photo.path;

          const faces = await FaceDetection.detect(`file://${photo.path}`, {
            classificationMode: 'all',
            contourMode: 'none',
            landmarkMode: 'none',
            performanceMode: 'fast',
          });

          if (faces.length !== 1) {
            setFaceBounds(null);
            setLivenessMsg(faces.length === 0 ? 'No face detected' : 'Multiple faces detected');
            setIsAligned(false);
            stableFramesCount.current = 0;
            return;
          }

          const face = faces[0];

          // Map bounding box from image → screen coordinates
          const imgW = photo.width;
          const imgH = photo.height;
          const screenH = Dimensions.get('window').height;
          const scale = Math.max(width / imgW, screenH / imgH);
          const offX = (imgW * scale - width) / 2;
          const offY = (imgH * scale - screenH) / 2;
          setFaceBounds({
            x: face.frame.left * scale - offX,
            y: face.frame.top * scale - offY,
            width: face.frame.width * scale,
            height: face.frame.height * scale,
          });

          const yaw = face.yawAngle ?? 0;
          const leftEye = face.leftEyeOpenProbability ?? 0;
          const rightEye = face.rightEyeOpenProbability ?? 0;
          const smile = face.smilingProbability ?? 0;

          // Phase 1 — assign random challenge on first face detection
          if (!challengeRef.current) {
            const picked = CHALLENGES[Math.floor(Math.random() * CHALLENGES.length)];
            challengeRef.current = picked;
            setChallenge(picked);
            setLivenessMsg(CHALLENGE_PROMPTS[picked]);
            setIsAligned(false);
            stableFramesCount.current = 0;
            return;
          }

          // Phase 2 — verify the challenge
          if (!challengeCompletedRef.current) {
            // Delegate to the pure, unit-tested state machine in core/faceMath
            const step = evaluateChallenge(
              challengeRef.current,
              { leftEye, rightEye, smile, yaw },
              { blinkClosed: blinkWasClosed.current, smileStreak: smileFrames.current },
            );
            blinkWasClosed.current = step.state.blinkClosed;
            smileFrames.current = step.state.smileStreak;
            const done = step.passed;

            if (challengeRef.current === 'BLINK') {
              setLivenessMsg(blinkWasClosed.current ? 'Eyes closing... open them!' : 'Please BLINK 👁');
            } else if (challengeRef.current === 'SMILE') {
              setLivenessMsg('Please SMILE 😊');
            } else if (challengeRef.current === 'TURN_LEFT') {
              setLivenessMsg('Turn head LEFT ↩');
            } else {
              setLivenessMsg('Turn head RIGHT ↪');
            }

            if (done) {
              challengeCompletedRef.current = true;
              setChallengeCompleted(true);
              setLivenessMsg('Challenge passed! Hold still…');
              stableFramesCount.current = 0;
            }
            setIsAligned(false);
            return;
          }

          // Phase 3 — stable alignment check → auto-capture
          if (Math.abs(yaw) > 15) {
            setLivenessMsg('Look straight ahead');
            setIsAligned(false);
            stableFramesCount.current = 0;
          } else if (leftEye < 0.3 || rightEye < 0.3) {
            setLivenessMsg('Keep eyes open');
            setIsAligned(false);
            stableFramesCount.current = 0;
          } else {
            setLivenessMsg('Perfect! Capturing…');
            setIsAligned(true);
            stableFramesCount.current += 1;
            if (stableFramesCount.current >= 3) {
              stableFramesCount.current = 0;
              await takePhotoSilent();
            }
          }
        } catch (e) {
          console.log('Frame drop:', e);
        } finally {
          if (tempPath) RNFS.unlink(tempPath).catch(() => {});
          isProcessingFrame.current = false;
        }
      }, 400);
    }

    return () => clearInterval(interval);
  }, [isTracking, capturedPhoto]);

  const takePhotoSilent = async () => {
    try {
      if (!cameraRef.current) return;
      const photo = await cameraRef.current.takePhoto({ flash: 'off' });
      setCapturedPhoto(photo.path);
      setIsTracking(false);
    } catch (e) {
      console.error('takePhoto failed', e);
    }
  };

  const handleRetake = () => {
    setCapturedPhoto(null);
    setFaceBounds(null);
    setIsAligned(false);
    setChallenge(null);
    setChallengeCompleted(false);
    challengeRef.current = null;
    challengeCompletedRef.current = false;
    blinkWasClosed.current = false;
    smileFrames.current = 0;
    stableFramesCount.current = 0;
    setBenchmark(null);
    setShowBenchmark(false);
  };

  const handleRequestPermission = useCallback(async () => {
    const granted = await requestPermission();
    if (!granted) {
      Alert.alert('Permission Denied', 'Enable camera in device settings.', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Open Settings', onPress: () => Linking.openSettings() },
      ]);
    }
  }, [requestPermission]);

  // ─── Enroll / Verify ──────────────────────────────────────────
  const processFace = async (action: 'ENROLL' | 'VERIFY') => {
    if (!capturedPhoto) return;
    if (!onnxSession) {
      Alert.alert('Not ready', 'Please initialise ONNX first.');
      return;
    }

    const completedChallenge = challengeRef.current ?? 'NONE';
    const t0 = Date.now();

    try {
      const fileName = `face_auth_${Date.now()}.jpg`;
      const savedPath = `${RNFS.DocumentDirectoryPath}/${fileName}`;
      await RNFS.copyFile(capturedPhoto, savedPath);
      const savedUri = `file://${savedPath}`;
      setGallery(prev => [`file://${savedPath}`, ...prev]);

      // ML Kit: liveness check on saved photo
      const mlT = Date.now();
      const opts: FaceDetectorOptions = {
        performanceMode: 'accurate',
        classificationMode: 'all',
        landmarkMode: 'none',
        contourMode: 'none',
      };
      const faces = await FaceDetection.detect(savedUri, opts);
      const mlKitMs = Date.now() - mlT;

      if (faces.length === 0) {
        Alert.alert('Liveness Failed', 'No face detected.');
        setCapturedPhoto(null);
        return;
      }
      if (faces.length > 1) {
        Alert.alert('Liveness Failed', 'Multiple faces detected.');
        setCapturedPhoto(null);
        return;
      }

      const face = faces[0];
      const leftEye = face.leftEyeOpenProbability ?? 0;
      const rightEye = face.rightEyeOpenProbability ?? 0;
      if (leftEye < 0.2 || rightEye < 0.2) {
        Alert.alert('Liveness Failed', 'Eyes appear closed (possible spoof).');
        setCapturedPhoto(null);
        return;
      }
      if (Math.abs(face.headEulerAngleY ?? 0) > 20) {
        Alert.alert('Liveness Failed', 'Please look directly at the camera.');
        setCapturedPhoto(null);
        return;
      }

      // Passive anti-spoofing: reject printed photos / screens before embedding
      const spoof = await SpoofDetector.analyze(savedUri, face.frame);
      if (!spoof.isLive) {
        Alert.alert(
          'Spoof Detected ❌',
          `This looks like a photo or screen.\nReasons: ${spoof.reasons.join(', ')}`,
        );
        setCapturedPhoto(null);
        return;
      }

      // Preprocessing: crop + bilinear resize + adaptive gamma
      const prepT = Date.now();
      const floatData = await FaceProcessor.cropResizeAndNormalize(savedUri, face.frame);
      const prepMs = Date.now() - prepT;

      // ONNX inference
      const { Tensor } = require('onnxruntime-react-native');
      const tensor = new Tensor('float32', floatData, [1, 3, 112, 112]);
      const onnxT = Date.now();
      const results = await onnxSession.run({ 'input.1': tensor });
      const onnxMs = Date.now() - onnxT;

      const raw = (Object.values(results)[0] as any).data as Float32Array;
      const norm = Math.sqrt(raw.reduce((s: number, v: number) => s + v * v, 0));
      const embedding = new Float32Array(raw.map((v: number) => v / (norm || 1)));

      if (action === 'ENROLL') {
        const empId = enrollName.trim() || `EMP-${Math.floor(Math.random() * 9000) + 1000}`;
        await Database.saveEmbedding(empId, embedding);
        Alert.alert('Enrolled', `Face registered for: ${empId}\nChallenge: ${completedChallenge} ✅`);
        setEnrollName('');
      } else {
        const dbT = Date.now();
        const match = await Database.authenticateUser(embedding, 0.60);
        const dbMs = Date.now() - dbT;
        const totalMs = Date.now() - t0;

        const bm: Benchmark = { mlKitMs, prepMs, onnxMs, dbMs, totalMs };
        setBenchmark(bm);
        setShowBenchmark(true);

        if (match) {
          await Database.logAttendance({
            employeeId: match.employeeId,
            timestamp: Date.now(),
            similarityScore: match.score,
            challenge: completedChallenge,
          });
          refreshPendingCount();

          Alert.alert(
            'Authenticated ✅',
            `Employee: ${match.employeeId}\nScore: ${(match.score * 100).toFixed(1)}%\nChallenge: ${completedChallenge}\nTotal: ${totalMs}ms`,
          );
        } else {
          Alert.alert('Auth Failed', 'No matching face found.');
        }
      }
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Processing failed');
    } finally {
      setCapturedPhoto(null);
    }
  };

  const handleManualSync = async () => {
    setSyncMsg('Syncing…');
    const result = await SyncService.syncPending();
    refreshPendingCount();
    setSyncMsg(
      result.synced > 0
        ? `Synced ${result.synced} records`
        : result.errors > 0
        ? 'Sync failed (no network?)'
        : 'Nothing to sync',
    );
    setTimeout(() => setSyncMsg(''), 4000);
  };

  const clearDatabase = () => {
    Alert.alert('Clear All Data', 'Delete all enrolled users?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Clear', style: 'destructive', onPress: async () => {
          await Database.clearAllUsers();
          Alert.alert('Done', 'All users deleted.');
        },
      },
    ]);
  };

  // ─── Render guards ─────────────────────────────────────────────
  if (!hasPermission) return <PermissionScreen onRequest={handleRequestPermission} />;
  if (!device) return <NoDeviceScreen />;

  // Gallery screen
  if (showGallery) {
    return (
      <View style={styles.container}>
        <StatusBar barStyle="light-content" backgroundColor="#0D0D0D" />
        <View style={styles.galleryHeader}>
          <Text style={styles.galleryTitle}>Local Storage ({gallery.length})</Text>
          <TouchableOpacity onPress={() => setShowGallery(false)} style={styles.closeButton}>
            <Text style={styles.closeButtonText}>Close</Text>
          </TouchableOpacity>
        </View>
        <ScrollView contentContainerStyle={styles.galleryGrid}>
          {gallery.map((uri, idx) => (
            <Image key={idx} source={{ uri }} style={styles.galleryImage} />
          ))}
          {gallery.length === 0 && (
            <Text style={styles.emptyText}>No photos saved yet.</Text>
          )}
        </ScrollView>
      </View>
    );
  }

  // Preview / enroll-verify screen
  if (capturedPhoto) {
    return (
      <View style={styles.container}>
        <StatusBar barStyle="light-content" backgroundColor="#000" />
        <Image
          source={{ uri: `file://${capturedPhoto}` }}
          style={StyleSheet.absoluteFill}
          resizeMode="cover"
        />
        <View style={styles.previewTopBar}>
          <Text style={styles.previewTitle}>Review Photo</Text>
          {challenge && (
            <Text style={styles.challengeBadge}>
              {CHALLENGE_ICONS[challenge]} {challenge} ✅
            </Text>
          )}
        </View>

        {/* Benchmark overlay (tap to dismiss) */}
        {showBenchmark && benchmark && (
          <TouchableOpacity style={styles.benchmarkCard} onPress={() => setShowBenchmark(false)}>
            <Text style={styles.benchmarkTitle}>Performance</Text>
            <Text style={styles.benchmarkRow}>ML Kit   {benchmark.mlKitMs}ms</Text>
            <Text style={styles.benchmarkRow}>Preproc  {benchmark.prepMs}ms</Text>
            <Text style={styles.benchmarkRow}>ONNX     {benchmark.onnxMs}ms</Text>
            <Text style={styles.benchmarkRow}>DB       {benchmark.dbMs}ms</Text>
            <Text style={[styles.benchmarkRow, styles.benchmarkTotal]}>
              TOTAL    {benchmark.totalMs}ms {benchmark.totalMs < 1000 ? '✅' : '⚠️'}
            </Text>
            <Text style={styles.benchmarkDismiss}>tap to dismiss</Text>
          </TouchableOpacity>
        )}

        <View style={styles.previewBottomBar}>
          <TextInput
            style={styles.enrollInput}
            placeholder="Employee Name / ID (for enroll)"
            placeholderTextColor="#999"
            value={enrollName}
            onChangeText={setEnrollName}
          />
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <TouchableOpacity style={styles.retakeButton} onPress={handleRetake}>
              <Text style={styles.retakeButtonText}>Retake</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionButton, { backgroundColor: '#34C759' }]}
              onPress={() => processFace('ENROLL')}>
              <Text style={styles.actionButtonText}>Enroll</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionButton, { backgroundColor: '#4F8CFF' }]}
              onPress={() => processFace('VERIFY')}>
              <Text style={styles.actionButtonText}>Verify</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  }

  // ─── Main camera view ─────────────────────────────────────────
  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />

      <Camera
        ref={cameraRef}
        style={StyleSheet.absoluteFill}
        device={device}
        isActive={!capturedPhoto}
        photo
      />

      {/* Face bounding box overlay */}
      {isTracking && faceBounds && (
        <View
          style={{
            position: 'absolute',
            left: faceBounds.x,
            top: faceBounds.y,
            width: faceBounds.width,
            height: faceBounds.height,
            borderWidth: 3,
            borderColor: isAligned ? '#34C759' : challengeCompleted ? '#FFD60A' : '#FF3B30',
            borderRadius: 12,
          }}
        />
      )}

      {/* Challenge card */}
      {isTracking && challenge && !challengeCompleted && (
        <View style={styles.challengeCard}>
          <Text style={styles.challengeIcon}>{CHALLENGE_ICONS[challenge]}</Text>
          <Text style={styles.challengeText}>{CHALLENGE_PROMPTS[challenge]}</Text>
        </View>
      )}
      {isTracking && challengeCompleted && (
        <View style={[styles.challengeCard, { backgroundColor: 'rgba(52,199,89,0.85)' }]}>
          <Text style={styles.challengeIcon}>✅</Text>
          <Text style={styles.challengeText}>Challenge passed!</Text>
        </View>
      )}

      {/* Liveness status pill */}
      {isTracking && (
        <View style={styles.livenessPill}>
          <Text style={[styles.livenessPillText, { color: isAligned ? '#34C759' : '#FFFFFF' }]}>
            {livenessMsg}
          </Text>
        </View>
      )}

      {/* Start tracking button */}
      {!isTracking && (
        <TouchableOpacity style={styles.startTrackingBtn} onPress={() => setIsTracking(true)}>
          <Text style={styles.startTrackingText}>Start Face Auth</Text>
        </TouchableOpacity>
      )}

      {/* Top bar */}
      <View style={styles.topBar}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <View>
            <Text style={styles.topBarTitle}>NHAI Face Auth</Text>
            <Text style={styles.topBarSubtitle}>
              Offline Mode{pendingCount > 0 ? ` · ${pendingCount} pending sync` : ''}
            </Text>
            {syncMsg !== '' && <Text style={styles.syncMsg}>{syncMsg}</Text>}
          </View>
          <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end', flex: 1 }}>
            {!onnxSession ? (
              <TouchableOpacity
                style={[styles.topBtn, { backgroundColor: '#4F8CFF' }]}
                onPress={initONNX}
                disabled={isInitializingONNX}>
                <Text style={styles.topBtnText}>
                  {isInitializingONNX ? 'Loading…' : 'Init ONNX'}
                </Text>
              </TouchableOpacity>
            ) : (
              <>
                <TouchableOpacity
                  style={[styles.topBtn, { backgroundColor: '#30D158' }]}
                  onPress={handleManualSync}>
                  <Text style={styles.topBtnText}>Sync{pendingCount > 0 ? ` (${pendingCount})` : ''}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.topBtn, { backgroundColor: '#FF3B30' }]}
                  onPress={clearDatabase}>
                  <Text style={styles.topBtnText}>Clear DB</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
      </View>

      {/* Gallery FAB */}
      <TouchableOpacity style={styles.galleryFAB} onPress={() => setShowGallery(true)}>
        <Text style={{ fontSize: 20 }}>🖼️</Text>
      </TouchableOpacity>

      {/* Bottom controls */}
      <View style={styles.bottomBar}>
        <View style={styles.captureControls}>
          <TouchableOpacity
            style={styles.flipBtn}
            onPress={() => setCameraPosition(p => p === 'front' ? 'back' : 'front')}>
            <Text style={{ fontSize: 20, color: '#FFF' }}>🔄</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.captureButton} onPress={takePhotoSilent}>
            <View style={styles.captureInner} />
          </TouchableOpacity>
          <View style={{ width: 50 }} />
        </View>
        <Text style={styles.deviceInfo}>{device.name} ({cameraPosition})</Text>
      </View>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000', justifyContent: 'center', alignItems: 'center' },

  // Permission
  permissionContainer: {
    flex: 1, backgroundColor: '#0D0D0D', justifyContent: 'center',
    alignItems: 'center', paddingHorizontal: 32,
  },
  lockIcon: { fontSize: 64, marginBottom: 16 },
  permissionTitle: { fontSize: 24, fontWeight: '700', color: '#FFF', marginBottom: 12, textAlign: 'center' },
  permissionDescription: { fontSize: 15, color: '#999', textAlign: 'center', lineHeight: 22, marginBottom: 32 },
  permissionButton: { backgroundColor: '#4F8CFF', paddingVertical: 14, paddingHorizontal: 40, borderRadius: 12 },
  permissionButtonText: { color: '#FFF', fontSize: 16, fontWeight: '600' },

  // Top bar
  topBar: {
    position: 'absolute', top: 0, left: 0, right: 0,
    paddingTop: Platform.OS === 'android' ? 48 : 60,
    paddingBottom: 12, paddingHorizontal: 16,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  topBarTitle: { color: '#FFF', fontSize: 18, fontWeight: '700' },
  topBarSubtitle: { color: '#4F8CFF', fontSize: 12, fontWeight: '500', marginTop: 2 },
  syncMsg: { color: '#30D158', fontSize: 11, marginTop: 2 },
  topBtn: { paddingHorizontal: 11, paddingVertical: 7, borderRadius: 8 },
  topBtnText: { color: '#FFF', fontSize: 12, fontWeight: '700' },

  // Challenge card
  challengeCard: {
    position: 'absolute', top: 160, alignSelf: 'center',
    backgroundColor: 'rgba(0,0,0,0.82)', borderRadius: 20,
    paddingHorizontal: 28, paddingVertical: 14, alignItems: 'center',
    borderWidth: 1.5, borderColor: '#FFD60A',
  },
  challengeIcon: { fontSize: 36, marginBottom: 6 },
  challengeText: { color: '#FFD60A', fontSize: 18, fontWeight: '800', letterSpacing: 0.5 },

  // Liveness pill
  livenessPill: {
    position: 'absolute', top: 270, alignSelf: 'center',
    backgroundColor: 'rgba(0,0,0,0.65)',
    paddingHorizontal: 16, paddingVertical: 7, borderRadius: 20,
  },
  livenessPillText: { fontWeight: '700', fontSize: 15 },

  // Start button
  startTrackingBtn: {
    position: 'absolute', bottom: 200, alignSelf: 'center',
    backgroundColor: '#4F8CFF', paddingVertical: 14, paddingHorizontal: 32,
    borderRadius: 30, elevation: 5,
  },
  startTrackingText: { color: '#FFF', fontWeight: '700', fontSize: 16 },

  // Gallery FAB
  galleryFAB: {
    position: 'absolute', top: Platform.OS === 'android' ? 58 : 70, right: 16,
    width: 42, height: 42, borderRadius: 21,
    backgroundColor: 'rgba(255,255,255,0.18)',
    justifyContent: 'center', alignItems: 'center',
  },

  // Bottom bar
  bottomBar: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    paddingBottom: 40, paddingTop: 16, paddingHorizontal: 20,
    backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center',
  },
  captureControls: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'center', width: '100%', marginBottom: 12,
  },
  flipBtn: {
    backgroundColor: 'rgba(255,255,255,0.15)', width: 50, height: 50,
    borderRadius: 25, justifyContent: 'center', alignItems: 'center', marginRight: 30,
  },
  captureButton: {
    width: 80, height: 80, borderRadius: 40,
    borderWidth: 4, borderColor: '#FFF', justifyContent: 'center', alignItems: 'center',
  },
  captureInner: { width: 64, height: 64, borderRadius: 32, backgroundColor: '#FFF' },
  deviceInfo: { color: '#555', fontSize: 12 },

  // Preview screen
  previewTopBar: {
    position: 'absolute', top: 0, left: 0, right: 0,
    paddingTop: Platform.OS === 'android' ? 48 : 60,
    paddingBottom: 12, paddingHorizontal: 20,
    backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center',
  },
  previewTitle: { color: '#FFF', fontSize: 18, fontWeight: '600' },
  challengeBadge: {
    color: '#34C759', fontSize: 13, fontWeight: '600', marginTop: 4,
    backgroundColor: 'rgba(52,199,89,0.15)', paddingHorizontal: 10,
    paddingVertical: 3, borderRadius: 10,
  },
  previewBottomBar: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    paddingBottom: 40, paddingTop: 16, paddingHorizontal: 16,
    backgroundColor: 'rgba(0,0,0,0.65)',
  },
  enrollInput: {
    backgroundColor: '#333', color: '#FFF', borderRadius: 8,
    padding: 11, marginBottom: 10, width: '100%',
  },
  retakeButton: {
    paddingVertical: 13, paddingHorizontal: 22, borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  retakeButtonText: { color: '#FFF', fontSize: 15, fontWeight: '600' },
  actionButton: { flex: 1, paddingVertical: 13, borderRadius: 10, alignItems: 'center' },
  actionButtonText: { color: '#FFF', fontSize: 15, fontWeight: '700' },

  // Benchmark overlay
  benchmarkCard: {
    position: 'absolute', top: 120, alignSelf: 'center',
    backgroundColor: 'rgba(15,15,15,0.92)',
    borderRadius: 16, paddingHorizontal: 24, paddingVertical: 16,
    borderWidth: 1, borderColor: '#333', minWidth: 210,
  },
  benchmarkTitle: { color: '#FFF', fontWeight: '700', fontSize: 14, marginBottom: 8 },
  benchmarkRow: { color: '#AAA', fontSize: 13, fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace', marginBottom: 3 },
  benchmarkTotal: { color: '#34C759', fontWeight: '700', marginTop: 4 },
  benchmarkDismiss: { color: '#555', fontSize: 11, marginTop: 8, textAlign: 'center' },

  // Gallery screen
  galleryHeader: {
    width: '100%', flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: Platform.OS === 'android' ? 48 : 60,
    paddingBottom: 14, paddingHorizontal: 20, backgroundColor: '#111',
  },
  galleryTitle: { color: '#FFF', fontSize: 20, fontWeight: '700' },
  closeButton: { paddingVertical: 6, paddingHorizontal: 12, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 8 },
  closeButtonText: { color: '#FFF', fontSize: 14, fontWeight: '600' },
  galleryGrid: { flexDirection: 'row', flexWrap: 'wrap', padding: 2, paddingBottom: 40 },
  galleryImage: { width: GALLERY_IMAGE_SIZE, height: GALLERY_IMAGE_SIZE, margin: 2, borderRadius: 4, backgroundColor: '#333' },
  emptyText: { color: '#666', fontSize: 16, marginTop: 40, textAlign: 'center', width: '100%' },
});

export default App;
