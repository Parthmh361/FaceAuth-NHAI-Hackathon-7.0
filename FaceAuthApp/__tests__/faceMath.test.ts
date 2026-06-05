/**
 * Unit tests for the pure core algorithms (no native modules required).
 * Run: npm test
 */

import {
  cosineSimilarity,
  l2Normalize,
  gammaFor,
  buildGammaLUT,
  spoofVerdict,
  evaluateChallenge,
  ChallengeState,
} from '../core/faceMath';

describe('cosineSimilarity', () => {
  it('returns 1 for identical vectors', () => {
    const v = new Float32Array([1, 2, 3, 4]);
    expect(cosineSimilarity(v, v)).toBeCloseTo(1, 6);
  });

  it('returns 0 for orthogonal vectors', () => {
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0, 6);
  });

  it('returns -1 for opposite vectors', () => {
    expect(cosineSimilarity([1, 1], [-1, -1])).toBeCloseTo(-1, 6);
  });

  it('returns 0 when a vector is all zeros', () => {
    expect(cosineSimilarity([0, 0, 0], [1, 2, 3])).toBe(0);
  });

  it('throws on length mismatch', () => {
    expect(() => cosineSimilarity([1, 2], [1, 2, 3])).toThrow();
  });

  it('is scale-invariant', () => {
    expect(cosineSimilarity([1, 2, 3], [2, 4, 6])).toBeCloseTo(1, 6);
  });
});

describe('l2Normalize', () => {
  it('produces a unit-length vector', () => {
    const out = l2Normalize([3, 4]); // norm 5
    expect(out[0]).toBeCloseTo(0.6, 6);
    expect(out[1]).toBeCloseTo(0.8, 6);
    const mag = Math.hypot(out[0], out[1]);
    expect(mag).toBeCloseTo(1, 6);
  });

  it('handles the zero vector without NaN', () => {
    const out = l2Normalize([0, 0, 0]);
    expect(Array.from(out)).toEqual([0, 0, 0]);
  });
});

describe('gammaFor (adaptive lighting)', () => {
  it('is a no-op for well-exposed images', () => {
    expect(gammaFor(120)).toBe(1.0);
    expect(gammaFor(60)).toBe(1.0);
    expect(gammaFor(190)).toBe(1.0);
  });

  it('brightens dark images (gamma < 1)', () => {
    expect(gammaFor(30)).toBeLessThan(1.0);
  });

  it('darkens over-bright images (gamma > 1)', () => {
    expect(gammaFor(230)).toBeGreaterThan(1.0);
  });

  it('clamps to the safe [0.4, 2.5] range', () => {
    expect(gammaFor(1)).toBeLessThanOrEqual(2.5);
    expect(gammaFor(255)).toBeLessThanOrEqual(2.5);
    expect(gammaFor(2)).toBeGreaterThanOrEqual(0.4);
  });
});

describe('buildGammaLUT', () => {
  it('is identity for gamma = 1', () => {
    const lut = buildGammaLUT(1);
    expect(lut[0]).toBe(0);
    expect(lut[128]).toBe(128);
    expect(lut[255]).toBe(255);
  });

  it('always maps endpoints to 0 and 255', () => {
    const lut = buildGammaLUT(0.5);
    expect(lut[0]).toBe(0);
    expect(lut[255]).toBe(255);
  });
});

describe('spoofVerdict (passive anti-spoofing)', () => {
  it('passes a sharp, well-lit real face', () => {
    const v = spoofVerdict(150, 0.001, 110);
    expect(v.isLive).toBe(true);
    expect(v.spoofScore).toBe(0);
  });

  it('flags a blurry low-texture photo + glare as spoof', () => {
    const v = spoofVerdict(40, 0.08, 110);
    expect(v.isLive).toBe(false);
    expect(v.spoofScore).toBe(2);
    expect(v.reasons).toContain('low texture sharpness');
    expect(v.reasons).toContain('screen glare detected');
  });

  it('flags a soft over-bright backlit screen as spoof', () => {
    const v = spoofVerdict(50, 0.001, 240); // soft + over-bright
    expect(v.isLive).toBe(false);
    expect(v.reasons).toContain('abnormal brightness');
  });

  it('treats a single soft check (no artefact) as still live', () => {
    const v = spoofVerdict(40, 0.001, 110); // only sharpness fails
    expect(v.isLive).toBe(true);
    expect(v.spoofScore).toBe(1);
  });

  it('does NOT reject a sharp face in harsh sunlight (bright + glare but textured)', () => {
    const v = spoofVerdict(180, 0.06, 235); // sharp skin, sunlit, some glare
    expect(v.isLive).toBe(true); // sharpness gates the verdict
  });
});

describe('evaluateChallenge', () => {
  const fresh: ChallengeState = { blinkClosed: false, smileStreak: 0 };
  const eyesOpen = { leftEye: 0.9, rightEye: 0.9, smile: 0, yaw: 0 };
  const eyesShut = { leftEye: 0.05, rightEye: 0.05, smile: 0, yaw: 0 };

  it('BLINK requires a close-then-open cycle', () => {
    // open only — should not pass
    let step = evaluateChallenge('BLINK', eyesOpen, fresh);
    expect(step.passed).toBe(false);

    // eyes close — arm the blink, not yet passed
    step = evaluateChallenge('BLINK', eyesShut, fresh);
    expect(step.passed).toBe(false);
    expect(step.state.blinkClosed).toBe(true);

    // eyes reopen — blink completes
    step = evaluateChallenge('BLINK', eyesOpen, step.state);
    expect(step.passed).toBe(true);
    expect(step.state.blinkClosed).toBe(false);
  });

  it('BLINK does not pass on open eyes alone (anti-photo)', () => {
    const step = evaluateChallenge('BLINK', eyesOpen, fresh);
    expect(step.passed).toBe(false);
  });

  it('SMILE needs two consecutive smiling frames', () => {
    const smiling = { leftEye: 0.9, rightEye: 0.9, smile: 0.9, yaw: 0 };
    let step = evaluateChallenge('SMILE', smiling, fresh);
    expect(step.passed).toBe(false);           // streak 1
    step = evaluateChallenge('SMILE', smiling, step.state);
    expect(step.passed).toBe(true);            // streak 2
  });

  it('SMILE streak resets when the smile drops', () => {
    const smiling = { leftEye: 0.9, rightEye: 0.9, smile: 0.9, yaw: 0 };
    const neutral = { leftEye: 0.9, rightEye: 0.9, smile: 0.1, yaw: 0 };
    let step = evaluateChallenge('SMILE', smiling, fresh);   // streak 1
    step = evaluateChallenge('SMILE', neutral, step.state);  // reset to 0
    expect(step.state.smileStreak).toBe(0);
    expect(step.passed).toBe(false);
  });

  it('TURN_LEFT passes only on strong negative yaw', () => {
    expect(evaluateChallenge('TURN_LEFT', { leftEye: 0.9, rightEye: 0.9, smile: 0, yaw: -35 }, fresh).passed).toBe(true);
    expect(evaluateChallenge('TURN_LEFT', { leftEye: 0.9, rightEye: 0.9, smile: 0, yaw: -10 }, fresh).passed).toBe(false);
  });

  it('TURN_RIGHT passes only on strong positive yaw', () => {
    expect(evaluateChallenge('TURN_RIGHT', { leftEye: 0.9, rightEye: 0.9, smile: 0, yaw: 35 }, fresh).passed).toBe(true);
    expect(evaluateChallenge('TURN_RIGHT', { leftEye: 0.9, rightEye: 0.9, smile: 0, yaw: 10 }, fresh).passed).toBe(false);
  });
});
