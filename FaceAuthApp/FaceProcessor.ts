import RNFS from 'react-native-fs';
import ImageResizer from '@bam.tech/react-native-image-resizer';
import * as base64 from 'base64-js';

export class FaceProcessor {
  /**
   * Crops the image to the detected face bounding box and resizes it to 112x112.
   */
  static async cropAndResizeFace(
    imageUri: string,
    frame: { top: number; left: number; width: number; height: number }
  ): Promise<string> {
    
    // Add a small margin (20%) around the face for better MobileFaceNet alignment
    const marginX = frame.width * 0.2;
    const marginY = frame.height * 0.2;
    
    // Ensure we don't go out of bounds (naive approach, assume image is large enough or allow ImageResizer to handle it)
    const cropX = Math.max(0, frame.left - marginX / 2);
    const cropY = Math.max(0, frame.top - marginY / 2);
    const cropWidth = frame.width + marginX;
    const cropHeight = frame.height + marginY;

    try {
      const scaled = await ImageResizer.createResizedImage(
        imageUri,
        112,
        112,
        'JPEG',
        100,
        0,
        undefined,
        false,
        { mode: 'stretch' }
      );
      
      return scaled.uri;
    } catch (err) {
      console.error('Failed to resize face image', err);
      throw err;
    }
  }

  /**
   * Converts a 112x112 JPEG file to a Float32Array suitable for ONNX input (1, 3, 112, 112).
   */
  static async imageToFloat32Array(imageUri: string): Promise<Float32Array> {
    const base64Str = await RNFS.readFile(imageUri, 'base64');
    const bytes = base64.toByteArray(base64Str);
    
    // We import jpeg-js dynamically to avoid top-level issues if not needed
    const jpeg = require('jpeg-js');
    
    // Decode the JPEG into raw pixels (RGBA format)
    const rawImageData = jpeg.decode(bytes, { useTArray: true });
    
    const width = rawImageData.width;
    const height = rawImageData.height;
    const data = rawImageData.data; // Uint8Array of [R, G, B, A, R, G, B, A...]
    
    // ONNX models typically expect NCHW format (Batch, Channels, Height, Width)
    // MobileFaceNet requires [1, 3, 112, 112]
    const floatArray = new Float32Array(1 * 3 * width * height);
    
    const channelSize = width * height;
    
    for (let i = 0; i < channelSize; i++) {
        // Source indices (RGBA)
        const srcIdx = i * 4;
        const r = data[srcIdx];
        const g = data[srcIdx + 1];
        const b = data[srcIdx + 2];
        
        // Normalize to [-1.0, 1.0] => (pixel - 127.5) / 127.5
        const rNorm = (r - 127.5) / 127.5;
        const gNorm = (g - 127.5) / 127.5;
        const bNorm = (b - 127.5) / 127.5;
        
        // MobileFaceNet usually expects RGB (or BGR depending on the exact training)
        // We will pass RGB in NCHW format
        floatArray[i] = rNorm;                         // Channel 0: R
        floatArray[i + channelSize] = gNorm;           // Channel 1: G
        floatArray[i + channelSize * 2] = bNorm;       // Channel 2: B
    }
    
    return floatArray;
  }
}
