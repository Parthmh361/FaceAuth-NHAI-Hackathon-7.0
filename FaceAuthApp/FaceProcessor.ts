import RNFS from 'react-native-fs';
import * as base64 from 'base64-js';
import { gammaFor, buildGammaLUT } from './core/faceMath';

function bilinearResize(
  src: Uint8Array,
  srcW: number,
  srcH: number,
  dstW: number,
  dstH: number,
): Uint8Array {
  const dst = new Uint8Array(dstW * dstH * 4);
  const xRatio = srcW / dstW;
  const yRatio = srcH / dstH;

  for (let y = 0; y < dstH; y++) {
    for (let x = 0; x < dstW; x++) {
      const sx = x * xRatio;
      const sy = y * yRatio;
      const x0 = Math.floor(sx);
      const y0 = Math.floor(sy);
      const x1 = Math.min(x0 + 1, srcW - 1);
      const y1 = Math.min(y0 + 1, srcH - 1);
      const xf = sx - x0;
      const yf = sy - y0;
      const di = (y * dstW + x) * 4;
      for (let c = 0; c < 3; c++) {
        const p00 = src[(y0 * srcW + x0) * 4 + c];
        const p01 = src[(y0 * srcW + x1) * 4 + c];
        const p10 = src[(y1 * srcW + x0) * 4 + c];
        const p11 = src[(y1 * srcW + x1) * 4 + c];
        dst[di + c] = Math.round(
          p00 * (1 - xf) * (1 - yf) +
          p01 * xf * (1 - yf) +
          p10 * (1 - xf) * yf +
          p11 * xf * yf,
        );
      }
      dst[di + 3] = 255;
    }
  }
  return dst;
}

// Gamma-LUT correction for harsh outdoor / low-light conditions.
// Only fires when mean luminance is outside the well-exposed band.
function applyAdaptiveGamma(data: Uint8Array, n: number): void {
  let lum = 0;
  for (let i = 0; i < n; i++) {
    lum += data[i * 4] * 0.299 + data[i * 4 + 1] * 0.587 + data[i * 4 + 2] * 0.114;
  }
  const gamma = gammaFor(lum / n);
  if (gamma === 1.0) return;

  const lut = buildGammaLUT(gamma);
  for (let i = 0; i < n; i++) {
    data[i * 4] = lut[data[i * 4]];
    data[i * 4 + 1] = lut[data[i * 4 + 1]];
    data[i * 4 + 2] = lut[data[i * 4 + 2]];
  }
}

export class FaceProcessor {
  /**
   * Single-pass pipeline: crop face region from the full photo using ML Kit
   * bounding box, bilinear-resize to 112×112, apply adaptive gamma for lighting
   * robustness, then return a Float32Array in NCHW format for ONNX inference.
   *
   * Replaces the old two-step cropAndResizeFace + imageToFloat32Array that
   * discarded the crop coordinates and squeezed the full image to 112×112.
   */
  static async cropResizeAndNormalize(
    imageUri: string,
    frame: { top: number; left: number; width: number; height: number },
  ): Promise<Float32Array> {
    const jpeg = require('jpeg-js');
    const path = imageUri.startsWith('file://') ? imageUri.slice(7) : imageUri;
    const b64 = await RNFS.readFile(path, 'base64');
    const bytes = base64.toByteArray(b64);
    const { data, width: imgW, height: imgH } = jpeg.decode(bytes, { useTArray: true });

    // 20% margin around detected bounding box
    const mx = frame.width * 0.1;
    const my = frame.height * 0.1;
    const cropX = Math.max(0, Math.floor(frame.left - mx));
    const cropY = Math.max(0, Math.floor(frame.top - my));
    const cropW = Math.min(imgW - cropX, Math.ceil(frame.width + mx * 2));
    const cropH = Math.min(imgH - cropY, Math.ceil(frame.height + my * 2));

    if (cropW <= 0 || cropH <= 0) {
      throw new Error(`Invalid face crop region: ${cropW}x${cropH}`);
    }

    // Extract the face region from the decoded RGBA pixel buffer
    const crop = new Uint8Array(cropW * cropH * 4);
    for (let y = 0; y < cropH; y++) {
      for (let x = 0; x < cropW; x++) {
        const si = ((cropY + y) * imgW + (cropX + x)) * 4;
        const di = (y * cropW + x) * 4;
        crop[di] = data[si];
        crop[di + 1] = data[si + 1];
        crop[di + 2] = data[si + 2];
        crop[di + 3] = 255;
      }
    }

    applyAdaptiveGamma(crop, cropW * cropH);

    const resized = bilinearResize(crop, cropW, cropH, 112, 112);
    const C = 112 * 112;
    const tensor = new Float32Array(3 * C);
    for (let i = 0; i < C; i++) {
      tensor[i] = (resized[i * 4] - 127.5) / 127.5;
      tensor[i + C] = (resized[i * 4 + 1] - 127.5) / 127.5;
      tensor[i + C * 2] = (resized[i * 4 + 2] - 127.5) / 127.5;
    }
    return tensor;
  }
}
