import RNFS from 'react-native-fs';
import * as base64 from 'base64-js';
import { spoofVerdict } from './core/faceMath';

/**
 * Passive texture anti-spoofing — ported from passive_spoof_detection.py.
 *
 * Runs three cheap, purely-local checks on the captured face crop to catch
 * printed photos and phone/laptop screens BEFORE the ONNX embedding step:
 *
 *   1. Sharpness  — variance of the Laplacian. Photos/screens are softer.
 *   2. Reflection — fraction of near-white pixels. Screens/glossy prints glare.
 *   3. Brightness — mean luminance. Backlit screens read abnormally bright.
 *
 * Each failed check adds to a spoof score; score >= 2 is treated as a spoof.
 * This complements the active challenge-response liveness in App.tsx.
 */

export interface SpoofResult {
  isLive: boolean;
  spoofScore: number;       // 0–3 (higher = more likely fake)
  sharpness: number;        // variance of Laplacian
  reflection: number;       // fraction of pixels > 240
  brightness: number;       // mean grayscale 0–255
  reasons: string[];
}

export class SpoofDetector {
  static async analyze(
    imageUri: string,
    frame: { top: number; left: number; width: number; height: number },
  ): Promise<SpoofResult> {
    const jpeg = require('jpeg-js');
    const path = imageUri.startsWith('file://') ? imageUri.slice(7) : imageUri;
    const b64 = await RNFS.readFile(path, 'base64');
    const { data, width: imgW, height: imgH } = jpeg.decode(
      base64.toByteArray(b64),
      { useTArray: true },
    );

    // Crop the face region (same 10% margin convention as FaceProcessor)
    const mx = frame.width * 0.1;
    const my = frame.height * 0.1;
    const cx = Math.max(0, Math.floor(frame.left - mx));
    const cy = Math.max(0, Math.floor(frame.top - my));
    const cw = Math.min(imgW - cx, Math.ceil(frame.width + mx * 2));
    const ch = Math.min(imgH - cy, Math.ceil(frame.height + my * 2));

    // Build grayscale buffer of the crop
    const gray = new Float32Array(cw * ch);
    let brightSum = 0;
    let brightCount = 0;
    for (let y = 0; y < ch; y++) {
      for (let x = 0; x < cw; x++) {
        const si = ((cy + y) * imgW + (cx + x)) * 4;
        const g = data[si] * 0.299 + data[si + 1] * 0.587 + data[si + 2] * 0.114;
        gray[y * cw + x] = g;
        brightSum += g;
        if (g > 240) brightCount++;
      }
    }

    const brightness = brightSum / (cw * ch);
    const reflection = brightCount / (cw * ch);
    const sharpness = laplacianVariance(gray, cw, ch);

    const verdict = spoofVerdict(sharpness, reflection, brightness);

    return {
      isLive: verdict.isLive,
      spoofScore: verdict.spoofScore,
      sharpness: Math.round(sharpness),
      reflection: Number(reflection.toFixed(4)),
      brightness: Math.round(brightness),
      reasons: verdict.reasons,
    };
  }
}

/** Variance of the 3x3 Laplacian — a classic focus/texture measure. */
function laplacianVariance(gray: Float32Array, w: number, h: number): number {
  const lap: number[] = [];
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const v = 4 * gray[i] - gray[i - 1] - gray[i + 1] - gray[i - w] - gray[i + w];
      lap.push(v);
    }
  }
  if (lap.length === 0) return 0;
  const mean = lap.reduce((s, v) => s + v, 0) / lap.length;
  const variance = lap.reduce((s, v) => s + (v - mean) * (v - mean), 0) / lap.length;
  return variance;
}
