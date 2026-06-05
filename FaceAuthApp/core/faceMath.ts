/**
 * Pure, dependency-free core algorithms for NHAI FaceAuth.
 *
 * This module intentionally imports nothing from React Native or any native
 * package, so every function here is directly unit-testable under Node/Jest
 * without mocks. The native-bound files (Database, FaceProcessor, SpoofDetector,
 * App) delegate their core math to these functions.
 */

export type Vec = Float32Array | number[];

// ── Embedding math ──────────────────────────────────────────────────
export function cosineSimilarity(a: Vec, b: Vec): number {
  if (a.length !== b.length) throw new Error('Vector lengths must match');
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

export function l2Normalize(v: Vec): Float32Array {
  let norm = 0;
  for (let i = 0; i < v.length; i++) norm += v[i] * v[i];
  norm = Math.sqrt(norm) || 1;
  const out = new Float32Array(v.length);
  for (let i = 0; i < v.length; i++) out[i] = v[i] / norm;
  return out;
}

// ── Adaptive gamma (lighting robustness) ────────────────────────────
export const GAMMA_LOW = 60;
export const GAMMA_HIGH = 190;

/**
 * Returns the gamma exponent to apply (out = (in/255)^gamma * 255) so that the
 * image's mean luminance is nudged toward the mid-point (127.5). Returns 1.0
 * (a no-op) when the image is already well-exposed.
 *
 * Derivation: we want (mean/255)^gamma = 0.5  ⇒  gamma = ln(0.5) / ln(mean/255).
 * Dark images (mean low) yield gamma < 1 (brightens); bright images yield
 * gamma > 1 (darkens). Clamped to a safe [0.4, 2.5] range.
 */
export function gammaFor(meanLuminance: number): number {
  if (meanLuminance >= GAMMA_LOW && meanLuminance <= GAMMA_HIGH) return 1.0;
  const meanNorm = Math.max(1, meanLuminance) / 255;
  const raw = Math.log(0.5) / Math.log(meanNorm);
  return Math.max(0.4, Math.min(2.5, raw));
}

export function buildGammaLUT(gamma: number): Uint8Array {
  const lut = new Uint8Array(256);
  for (let i = 0; i < 256; i++) lut[i] = Math.round(255 * Math.pow(i / 255, gamma));
  return lut;
}

// ── Passive anti-spoofing verdict ───────────────────────────────────
export const SHARPNESS_MIN = 80;
export const REFLECTION_MAX = 0.03;
export const BRIGHTNESS_MAX = 195;

export interface SpoofVerdict {
  isLive: boolean;
  spoofScore: number;
  reasons: string[];
}

export function spoofVerdict(
  sharpness: number,
  reflection: number,
  brightness: number,
): SpoofVerdict {
  let spoofScore = 0;
  const reasons: string[] = [];
  if (sharpness < SHARPNESS_MIN) { spoofScore++; reasons.push('low texture sharpness'); }
  if (reflection > REFLECTION_MAX) { spoofScore++; reasons.push('screen glare detected'); }
  if (brightness > BRIGHTNESS_MAX) { spoofScore++; reasons.push('abnormal brightness'); }
  return { isLive: spoofScore < 2, spoofScore, reasons };
}

// ── Challenge-response liveness state machine ───────────────────────
export type ChallengeType = 'BLINK' | 'SMILE' | 'TURN_LEFT' | 'TURN_RIGHT';

export const BLINK_CLOSED = 0.15;
export const BLINK_OPEN = 0.45;
export const SMILE_MIN = 0.72;
export const SMILE_STREAK = 2;
export const TURN_YAW = 28;

export interface FaceMetrics {
  leftEye: number;
  rightEye: number;
  smile: number;
  yaw: number;
}

export interface ChallengeState {
  blinkClosed: boolean;
  smileStreak: number;
}

export interface ChallengeStep {
  passed: boolean;
  state: ChallengeState;
}

/**
 * Pure evaluation of one polling frame against the active challenge.
 * Caller persists `state` between frames (in refs) and passes it back in.
 */
export function evaluateChallenge(
  type: ChallengeType,
  m: FaceMetrics,
  state: ChallengeState,
): ChallengeStep {
  let { blinkClosed, smileStreak } = state;
  let passed = false;

  switch (type) {
    case 'BLINK': {
      const avgEye = (m.leftEye + m.rightEye) / 2;
      if (avgEye < BLINK_CLOSED) {
        blinkClosed = true;
      } else if (blinkClosed && avgEye > BLINK_OPEN) {
        passed = true;
        blinkClosed = false;
      }
      break;
    }
    case 'SMILE':
      smileStreak = m.smile > SMILE_MIN ? smileStreak + 1 : 0;
      passed = smileStreak >= SMILE_STREAK;
      break;
    case 'TURN_LEFT':
      passed = m.yaw < -TURN_YAW;
      break;
    case 'TURN_RIGHT':
      passed = m.yaw > TURN_YAW;
      break;
  }

  return { passed, state: { blinkClosed, smileStreak } };
}
