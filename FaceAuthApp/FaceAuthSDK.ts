/**
 * FaceAuthSDK — the single integration surface for the whole app and for
 * embedding face auth into Datalake 3.0.
 *
 * High-level (UI screens use these — take a captured photo path, do everything):
 *   await FaceAuthSDK.initialize(onnxSession);
 *   await FaceAuthSDK.enrollFromPhoto(photoPath, { employeeId, name, designation });
 *   const r = await FaceAuthSDK.verifyFromPhoto(photoPath);
 *
 * Low-level (Datalake / advanced callers that already have a face bounding box):
 *   await FaceAuthSDK.enroll(imageUri, faceBounds, employeeId);
 *   await FaceAuthSDK.authenticate(imageUri, faceBounds, challenge);
 */

import RNFS from 'react-native-fs';
import ImageResizer from '@bam.tech/react-native-image-resizer';
import FaceDetection, { FaceDetectorOptions } from '@react-native-ml-kit/face-detection';
import { Database, MatchResult } from './Database';
import { FaceProcessor } from './FaceProcessor';
import { SpoofDetector } from './SpoofDetector';
import { SyncService, SyncResult } from './SyncService';
import { l2Normalize } from './core/faceMath';

export interface Timing {
  mlKitMs: number;
  prepMs: number;
  onnxMs: number;
  dbMs: number;
  totalMs: number;
}

export interface PipelineFailure {
  ok: false;
  stage: 'detect' | 'liveness' | 'spoof' | 'match' | 'error';
  message: string;
  detail?: string[];
}

export interface EnrollSuccess {
  ok: true;
  employeeId: string;
  timing: Timing;
}

export interface VerifySuccess {
  ok: true;
  match: MatchResult;
  challenge: string;
  timing: Timing;
}

let _onnx: any = null;
let _threshold = 0.6;
let _spoofEnabled = true;

const DETECT_OPTS: FaceDetectorOptions = {
  performanceMode: 'accurate',
  classificationMode: 'all',
  landmarkMode: 'none',
  contourMode: 'none',
};

export const FaceAuthSDK = {
  async initialize(
    onnxSession: any,
    opts?: { threshold?: number; spoofEnabled?: boolean; onSync?: (r: SyncResult) => void },
  ): Promise<void> {
    _onnx = onnxSession;
    if (opts?.threshold != null) _threshold = opts.threshold;
    if (opts?.spoofEnabled != null) _spoofEnabled = opts.spoofEnabled;
    await Database.initDB();
    SyncService.start(opts?.onSync);
  },

  setThreshold(t: number) { _threshold = t; },
  setSpoofEnabled(b: boolean) { _spoofEnabled = b; },
  isReady() { return _onnx != null; },

  // ── Shared pipeline: photo path → 512-d embedding (+ liveness/spoof gate) ──
  async _embedFromPhoto(
    photoPath: string,
  ): Promise<
    | { ok: true; embedding: Float32Array; timing: Timing }
    | PipelineFailure
  > {
    if (!_onnx) return { ok: false, stage: 'error', message: 'Model not initialized' };

    const t0 = Date.now();
    let procPath: string | null = null;
    try {
      const srcUri = photoPath.startsWith('file://') ? photoPath : `file://${photoPath}`;

      // Guard: if the captured photo no longer exists (e.g. the OS purged the
      // camera's temp file), bail out with a clear error. Without this, the
      // native image resizer can hang forever on a missing path.
      const rawPath = photoPath.startsWith('file://') ? photoPath.slice(7) : photoPath;
      if (!(await RNFS.exists(rawPath))) {
        return { ok: false, stage: 'error', message: 'Captured photo expired — please retake.' };
      }

      // Downscale ONCE (native) before any JS pixel work — avoids the UI freeze
      // that full-res JPEG decoding in pure JS caused.
      const resized = await ImageResizer.createResizedImage(
        srcUri, 640, 640, 'JPEG', 90, 0, undefined, false,
        { mode: 'contain', onlyScaleDown: true },
      );
      const procUri = resized.uri;
      procPath = resized.path;

      const mlT = Date.now();
      const faces = await FaceDetection.detect(procUri, DETECT_OPTS);
      const mlKitMs = Date.now() - mlT;

      if (faces.length === 0) return { ok: false, stage: 'detect', message: 'No face detected' };
      if (faces.length > 1) return { ok: false, stage: 'detect', message: 'Multiple faces in frame' };

      const face = faces[0];
      const le = face.leftEyeOpenProbability ?? 1;
      const re = face.rightEyeOpenProbability ?? 1;
      if (le < 0.2 || re < 0.2) return { ok: false, stage: 'liveness', message: 'Eyes appear closed' };
      // `rotationY` is the yaw (ML Kit has no `headEulerAngleY`); reject only
      // strongly off-axis faces so a near-frontal capture still enrols/verifies.
      if (Math.abs(face.rotationY ?? 0) > 30) {
        return { ok: false, stage: 'liveness', message: 'Look directly at the camera' };
      }

      if (_spoofEnabled) {
        const spoof = await SpoofDetector.analyze(procUri, face.frame);
        if (!spoof.isLive) {
          return { ok: false, stage: 'spoof', message: 'Photo/screen suspected', detail: spoof.reasons };
        }
      }

      const prepT = Date.now();
      const floatData = await FaceProcessor.cropResizeAndNormalize(procUri, face.frame);
      const prepMs = Date.now() - prepT;

      const { Tensor } = require('onnxruntime-react-native');
      const onnxT = Date.now();
      const out = await _onnx.run({ 'input.1': new Tensor('float32', floatData, [1, 3, 112, 112]) });
      const onnxMs = Date.now() - onnxT;

      const raw = (Object.values(out)[0] as any).data as Float32Array;
      const embedding = l2Normalize(raw);

      return {
        ok: true,
        embedding,
        timing: { mlKitMs, prepMs, onnxMs, dbMs: 0, totalMs: Date.now() - t0 },
      };
    } catch (e: any) {
      return { ok: false, stage: 'error', message: e.message ?? 'Processing failed' };
    } finally {
      if (procPath) RNFS.unlink(procPath).catch(() => {});
    }
  },

  async enrollFromPhoto(
    photoPath: string,
    who: { employeeId: string; name: string; designation: string },
  ): Promise<EnrollSuccess | PipelineFailure> {
    const r = await this._embedFromPhoto(photoPath);
    if (!r.ok) return r;
    await Database.enrollEmployee(who.employeeId, who.name, who.designation, r.embedding);
    return { ok: true, employeeId: who.employeeId, timing: r.timing };
  },

  /**
   * Run the full face pipeline on a freshly-captured photo and return the
   * embedding WITHOUT saving. Call this immediately after capture (while the
   * temp photo still exists), then persist later with saveEnrollment().
   */
  async prepareEnrollment(
    photoPath: string,
  ): Promise<{ ok: true; embedding: Float32Array; timing: Timing } | PipelineFailure> {
    const r = await this._embedFromPhoto(photoPath);
    if (!r.ok) return r;
    // Reject re-enrolling a face that already belongs to someone, so the same
    // person can't be added twice under different IDs.
    const existing = await Database.authenticateUser(r.embedding, _threshold);
    if (existing) {
      return {
        ok: false,
        stage: 'match',
        message: `This face is already enrolled as ${existing.name} (${existing.employeeId}).`,
      };
    }
    return r;
  },

  /** Persist a pre-computed embedding (from prepareEnrollment) to the DB. */
  async saveEnrollment(
    embedding: Float32Array,
    who: { employeeId: string; name: string; designation: string },
  ): Promise<EnrollSuccess | PipelineFailure> {
    try {
      await Database.enrollEmployee(who.employeeId, who.name, who.designation, embedding);
      return { ok: true, employeeId: who.employeeId, timing: { mlKitMs: 0, prepMs: 0, onnxMs: 0, dbMs: 0, totalMs: 0 } };
    } catch (e: any) {
      return { ok: false, stage: 'error', message: e?.message ?? 'Failed to save enrollment' };
    }
  },

  async verifyFromPhoto(
    photoPath: string,
    challenge = 'NONE',
  ): Promise<VerifySuccess | PipelineFailure> {
    const r = await this._embedFromPhoto(photoPath);
    if (!r.ok) return r;

    const dbT = Date.now();
    const match = await Database.authenticateUser(r.embedding, _threshold);
    const timing = { ...r.timing, dbMs: Date.now() - dbT };
    if (!match) return { ok: false, stage: 'match', message: 'No matching face enrolled' };

    await Database.logAttendance({
      employeeId: match.employeeId,
      employeeName: match.name,
      timestamp: Date.now(),
      similarityScore: match.score,
      challenge,
    });
    return { ok: true, match, challenge, timing };
  },

  // ── Low-level API (Datalake integration; caller supplies the face box) ──
  async enroll(imageUri: string, faceBounds: any, employeeId: string) {
    if (!_onnx) return { success: false, error: 'SDK not initialized' };
    try {
      const { Tensor } = require('onnxruntime-react-native');
      const floatData = await FaceProcessor.cropResizeAndNormalize(imageUri, faceBounds);
      const out = await _onnx.run({ 'input.1': new Tensor('float32', floatData, [1, 3, 112, 112]) });
      const embedding = l2Normalize((Object.values(out)[0] as any).data as Float32Array);
      await Database.saveEmbedding(employeeId, embedding);
      return { success: true, employeeId };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  },

  async authenticate(imageUri: string, faceBounds: any, challenge: string) {
    if (!_onnx) return { success: false, error: 'SDK not initialized' };
    try {
      const { Tensor } = require('onnxruntime-react-native');
      const floatData = await FaceProcessor.cropResizeAndNormalize(imageUri, faceBounds);
      const out = await _onnx.run({ 'input.1': new Tensor('float32', floatData, [1, 3, 112, 112]) });
      const embedding = l2Normalize((Object.values(out)[0] as any).data as Float32Array);
      const match = await Database.authenticateUser(embedding, _threshold);
      if (!match) return { success: false, error: 'No matching face found' };
      await Database.logAttendance({
        employeeId: match.employeeId, employeeName: match.name,
        timestamp: Date.now(), similarityScore: match.score, challenge,
      });
      return { success: true, employeeId: match.employeeId, score: match.score };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  },

  async syncNow(): Promise<SyncResult> { return SyncService.syncPending(); },
  async enrolledCount(): Promise<number> { return Database.countEmployees(); },
  async pendingSyncCount(): Promise<number> { return Database.getPendingCount(); },
  async clearAll(): Promise<void> { await Database.clearAllUsers(); },
};
