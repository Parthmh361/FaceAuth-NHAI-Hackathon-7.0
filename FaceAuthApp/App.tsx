/**
 * NHAI 7.0 — Offline Face Authentication System
 * Step 1 & 2: Camera Preview & Local Storage
 *
 * NO Frame Processors, NO ONNX, NO worklets-core
 * Front camera preview, permission handling, capturing & local filesystem storage.
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

const { width } = Dimensions.get('window');
const GALLERY_IMAGE_SIZE = width / 3 - 4;

// ─── Permission Status Screen ──────────────────────────────────
function PermissionScreen({
  onRequest,
}: {
  onRequest: () => void;
}): React.JSX.Element {
  return (
    <View style={styles.permissionContainer}>
      <StatusBar barStyle="light-content" backgroundColor="#0D0D0D" />
      <View style={styles.iconContainer}>
        <Text style={styles.lockIcon}>🔒</Text>
      </View>
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

// ─── No Device Screen ──────────────────────────────────────────
function NoDeviceScreen(): React.JSX.Element {
  return (
    <View style={styles.permissionContainer}>
      <StatusBar barStyle="light-content" backgroundColor="#0D0D0D" />
      <Text style={styles.lockIcon}>📷</Text>
      <Text style={styles.permissionTitle}>No Camera Found</Text>
      <Text style={styles.permissionDescription}>
        Could not find a camera device. Please ensure you are running on a
        physical device with a front-facing camera.
      </Text>
    </View>
  );
}

// ─── Main App ──────────────────────────────────────────────────
function App(): React.JSX.Element {
  const [cameraPosition, setCameraPosition] =
    useState<CameraPosition>('front');
  const device = useCameraDevice(cameraPosition);
  const { hasPermission, requestPermission } = useCameraPermission();
  
  const cameraRef = useRef<Camera>(null);
  
  const [capturedPhoto, setCapturedPhoto] = useState<string | null>(null);
  const [gallery, setGallery] = useState<string[]>([]);
  const [showGallery, setShowGallery] = useState(false);
  const [enrollName, setEnrollName] = useState('');
  
  // Phase 6: Pseudo-Realtime Tracking State
  const [isTracking, setIsTracking] = useState(false);
  const [faceBounds, setFaceBounds] = useState<any>(null);
  const [livenessMsg, setLivenessMsg] = useState('Position face in frame');
  const [isAligned, setIsAligned] = useState(false);
  const isProcessingFrame = useRef(false);
  const stableFramesCount = useRef(0);
  
  // Phase 2: ONNX Runtime
  const [onnxSession, setOnnxSession] = useState<any>(null);
  const [isInitializingONNX, setIsInitializingONNX] = useState(false);
  
  const initONNX = async () => {
    setIsInitializingONNX(true);
    try {
      // Dynamic import to avoid crash if native module isn't linked
      const { InferenceSession, Tensor } = require('onnxruntime-react-native');
      
      const modelName = 'w600k_mbf.onnx';
      const destPath = `${RNFS.DocumentDirectoryPath}/${modelName}`;
      
      // The ONNX C++ core cannot read directly from compressed APK assets.
      // We must copy it to a real file path first.
      const exists = await RNFS.exists(destPath);
      if (!exists) {
        console.log('Copying ONNX model from assets to internal storage...');
        await RNFS.copyFileAssets(modelName, destPath);
      }
      
      console.log('Loading ONNX Model from:', destPath);
      // We pass the absolute path (or file:// URI) to InferenceSession
      const session = await InferenceSession.create(destPath);
      setOnnxSession(session);
      console.log('ONNX Session created successfully!', session);
      
      // Verification: Run dummy inference (1x3x112x112)
      const dummyInput = new Float32Array(1 * 3 * 112 * 112);
      const tensor = new Tensor('float32', dummyInput, [1, 3, 112, 112]);
      
      const startTime = Date.now();
      const feeds = { 'input.1': tensor }; // The MobileFaceNet model expects the input name 'input.1'
      const results = await session.run(feeds);
      const endTime = Date.now();
      
      const outputTensor: any = Object.values(results)[0];
      
      Alert.alert(
        'ONNX Ready! ✅', 
        `Session created & Dummy inference completed in ${endTime - startTime}ms.\nOutput Shape: [${outputTensor.dims.join(', ')}]`
      );
    } catch (err: any) {
      console.error('Failed to init ONNX:', err);
      Alert.alert('ONNX Error ❌', err.message);
    } finally {
      setIsInitializingONNX(false);
    }
  };

  // Load existing images from filesystem on startup
  useEffect(() => {
    Database.initDB().catch(e => console.error('DB Init Error', e));

    const loadGallery = async () => {
      try {
        const files = await RNFS.readDir(RNFS.DocumentDirectoryPath);
        const images = files
          .filter(f => f.isFile() && f.name.endsWith('.jpg'))
          .sort((a, b) => b.mtime!.getTime() - a.mtime!.getTime()) // Newest first
          .map(f => `file://${f.path}`);
        setGallery(images);
      } catch (err) {
        console.error('Failed to load gallery', err);
      }
    };
    loadGallery();
  }, []);

  // Phase 3: Test Database & Cosine Similarity
  const testDatabase = async () => {
    if (!onnxSession) {
      Alert.alert('Hold on!', 'Please initialize ONNX first.');
      return;
    }

    try {
      const { Tensor } = require('onnxruntime-react-native');
      
      // 1. Generate a "dummy" embedding using ONNX
      const dummyInput = new Float32Array(1 * 3 * 112 * 112);
      const tensor = new Tensor('float32', dummyInput, [1, 3, 112, 112]);
      const results = await onnxSession.run({ 'input.1': tensor });
      const rawEmbedding = Object.values(results)[0] as any;
      const embeddingData = rawEmbedding.data as Float32Array;
      
      // Normalize it
      const norm = Math.sqrt(embeddingData.reduce((sum, val) => sum + val * val, 0));
      const embedding = new Float32Array(embeddingData.map(v => v / (norm || 1)));

      // 2. Save it to SQLite
      const testEmpId = `EMP-${Math.floor(Math.random() * 10000)}`;
      await Database.saveEmbedding(testEmpId, embedding);
      
      // 3. Authenticate against it!
      const startTime = Date.now();
      const match = await Database.authenticateUser(embedding, 0.6);
      const endTime = Date.now();

      if (match) {
        Alert.alert(
          'Phase 3 Verified! 🔐', 
          `Matched ID: ${match.employeeId}\nSimilarity Score: ${(match.score * 100).toFixed(2)}%\nAuth Time: ${endTime - startTime}ms`
        );
      } else {
        Alert.alert('Auth Failed', 'No match found.');
      }

    } catch (e: any) {
      console.error(e);
      Alert.alert('Database Test Error', e.message);
    }
  };

  const clearDatabase = async () => {
    try {
      await Database.clearAllUsers();
      Alert.alert('Success', 'All enrolled users have been deleted.');
    } catch (err: any) {
      Alert.alert('Error', 'Failed to clear database: ' + err.message);
    }
  };

  // Request permission handler
  const handleRequestPermission = useCallback(async () => {
    const granted = await requestPermission();
    if (!granted) {
      Alert.alert(
        'Permission Denied',
        'Camera permission was denied. Please enable it in your device settings.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Open Settings',
            onPress: () => Linking.openSettings(),
          },
        ],
      );
    }
  }, [requestPermission]);

  // Toggle camera position
  const toggleCamera = useCallback(() => {
    setCameraPosition(prev => (prev === 'front' ? 'back' : 'front'));
  }, []);

  const takePhoto = async () => {
    try {
      if (cameraRef.current == null) throw new Error('Camera ref is null');
      
      const photo = await cameraRef.current.takePhoto({
        flash: 'off',
      });
      
      setCapturedPhoto(photo.path);
      setIsTracking(false); // Stop tracking loop once captured
    } catch (e) {
      console.error('Failed to take photo', e);
    }
  };

  const handleRetake = () => {
    setCapturedPhoto(null);
    setFaceBounds(null);
    setIsAligned(false);
    stableFramesCount.current = 0;
  };

  // ─── PSEUDO-REALTIME TRACKING LOOP ──────────────────────────────
  useEffect(() => {
    let interval: NodeJS.Timeout;
    
    if (isTracking && !capturedPhoto) {
      interval = setInterval(async () => {
        if (isProcessingFrame.current || !cameraRef.current) return;
        isProcessingFrame.current = true;
        
        let tempPhotoPath = '';
        try {
          // Take a silent, fast photo for ML Kit
          const photo = await cameraRef.current.takePhoto({ flash: 'off' });
          tempPhotoPath = photo.path;
          
          const faces = await FaceDetection.detect(`file://${photo.path}`, {
            classificationMode: 'all',
            contourMode: 'none',
            landmarkMode: 'none',
            performanceMode: 'fast',
          });
          
          if (faces.length === 1) {
            const face = faces[0];
            
            // Map Bounding Box from Image Coordinates to Screen Coordinates
            // VisionCamera defaults to resizeMode="cover"
            const imgW = photo.width;
            const imgH = photo.height;
            const screenW = width;
            const screenH = Dimensions.get('window').height;
            
            const scaleX = screenW / imgW;
            const scaleY = screenH / imgH;
            const scale = Math.max(scaleX, scaleY);
            
            const scaledW = imgW * scale;
            const scaledH = imgH * scale;
            
            const offsetX = (scaledW - screenW) / 2;
            const offsetY = (scaledH - screenH) / 2;
            
            const mappedBounds = {
              x: face.frame.left * scale - offsetX,
              y: face.frame.top * scale - offsetY,
              width: face.frame.width * scale,
              height: face.frame.height * scale,
            };
            setFaceBounds(mappedBounds);
            
            // Liveness & Alignment Checks
            const pitch = face.pitchAngle ?? 0;
            const yaw = face.yawAngle ?? 0;
            const leftEye = face.leftEyeOpenProbability ?? 0;
            const rightEye = face.rightEyeOpenProbability ?? 0;
            
            if (Math.abs(yaw) > 15) {
              setLivenessMsg('Look straight ahead ❌');
              setIsAligned(false);
              stableFramesCount.current = 0;
            } else if (leftEye < 0.3 || rightEye < 0.3) {
              setLivenessMsg('Keep eyes open ❌');
              setIsAligned(false);
              stableFramesCount.current = 0;
            } else {
              setLivenessMsg('Perfect! Hold still ✅');
              setIsAligned(true);
              stableFramesCount.current += 1;
              
              if (stableFramesCount.current >= 3) {
                // Auto-Capture!
                stableFramesCount.current = 0;
                await takePhoto();
              }
            }
          } else {
            setFaceBounds(null);
            setLivenessMsg(faces.length === 0 ? 'No face detected' : 'Multiple faces detected ❌');
            setIsAligned(false);
            stableFramesCount.current = 0;
          }
        } catch (e) {
          console.log('Frame drop:', e);
        } finally {
          // Cleanup temp photo to prevent storage leak
          if (tempPhotoPath) {
            RNFS.unlink(tempPhotoPath).catch(() => {});
          }
          isProcessingFrame.current = false;
        }
      }, 400); // Process a frame every 400ms (~2.5 FPS)
    }
    
    return () => clearInterval(interval);
  }, [isTracking, capturedPhoto]);

  const processFace = async (action: 'ENROLL' | 'VERIFY') => {
    if (!capturedPhoto) return;
    if (!onnxSession) {
      Alert.alert('Hold on!', 'Please initialize ONNX first using the Top Bar button.');
      return;
    }

    try {
      const fileName = `face_auth_${Date.now()}.jpg`;
      const destPath = `${RNFS.DocumentDirectoryPath}/${fileName}`;

      // Copy from temporary cache to permanent document directory
      await RNFS.copyFile(capturedPhoto, destPath);
      
      const newSavedUri = `file://${destPath}`;
      setGallery(prev => [newSavedUri, ...prev]);
      
      // 2. ML Kit Face Detection & Active Liveness
      const options: FaceDetectorOptions = {
        performanceMode: 'accurate',
        landmarkMode: 'none',
        contourMode: 'none',
        classificationMode: 'all',
      };
      
      const faces = await FaceDetection.detect(newSavedUri, options);
      
      if (faces.length === 0) {
        Alert.alert('Liveness Failed ❌', 'No face detected in the image.');
        setCapturedPhoto(null);
        return;
      }
      if (faces.length > 1) {
        Alert.alert('Liveness Failed ❌', 'Multiple faces detected. Please ensure only one person is in frame.');
        setCapturedPhoto(null);
        return;
      }
      
      const face = faces[0];
      
      // Active Liveness Checks
      const leftEyeOpen = face.leftEyeOpenProbability ?? 0;
      const rightEyeOpen = face.rightEyeOpenProbability ?? 0;
      
      if (leftEyeOpen < 0.2 || rightEyeOpen < 0.2) {
         Alert.alert('Liveness Failed ❌', 'Eyes appear closed (Blink/Spoof attack detected).');
         setCapturedPhoto(null);
         return;
      }
      
      if (Math.abs(face.headEulerAngleY ?? 0) > 20) {
         Alert.alert('Liveness Failed ❌', 'Please look directly at the camera.');
         setCapturedPhoto(null);
         return;
      }

      // 3. Image Cropping & Preprocessing
      const resizedPath = await FaceProcessor.cropAndResizeFace(newSavedUri, face.frame);
      const float32Data = await FaceProcessor.imageToFloat32Array(resizedPath);
      
      // 4. ONNX Inference
      const { Tensor } = require('onnxruntime-react-native');
      const tensor = new Tensor('float32', float32Data, [1, 3, 112, 112]);
      
      const startInference = Date.now();
      const results = await onnxSession.run({ 'input.1': tensor });
      const rawEmbedding = Object.values(results)[0] as any;
      const embeddingData = rawEmbedding.data as Float32Array;
      
      // Normalize
      const norm = Math.sqrt(embeddingData.reduce((sum, val) => sum + val * val, 0));
      const finalEmbedding = new Float32Array(embeddingData.map(v => v / (norm || 1)));
      const endInference = Date.now();

      // 5. Database Logic (Enroll vs Verify)
      if (action === 'ENROLL') {
         const newEmpId = enrollName.trim() || `EMP-${Math.floor(Math.random() * 9000) + 1000}`;
         await Database.saveEmbedding(newEmpId, finalEmbedding);
         Alert.alert(
           'User Enrolled 📝', 
           `Successfully registered face for: ${newEmpId}\nLiveness: Passed ✅`
         );
         setEnrollName('');
      } else {
         const match = await Database.authenticateUser(finalEmbedding, 0.55); // 0.55 threshold
         if (match) {
            Alert.alert(
              'Authentication Success! ✅', 
              `Matched Employee: ${match.employeeId}\nSimilarity Score: ${(match.score * 100).toFixed(1)}%\nLiveness: Passed ✅\nInference: ${endInference - startInference}ms`
            );
         } else {
            Alert.alert('Auth Failed ❌', 'No matching face found in the database. Are you enrolled?');
         }
      }

      setCapturedPhoto(null);
    } catch (err: any) {
      console.error('Failed to process image:', err);
      Alert.alert('Error', err.message || 'Verification Failed');
    }
  };

  // ─── Render ────────────────────────────────────────────────
  if (!hasPermission) {
    return <PermissionScreen onRequest={handleRequestPermission} />;
  }

  if (device == null) {
    return <NoDeviceScreen />;
  }

  // --- Gallery Screen ---
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
            <Image 
              key={idx} 
              source={{ uri }} 
              style={styles.galleryImage} 
            />
          ))}
          {gallery.length === 0 && (
            <Text style={styles.emptyText}>No photos saved yet.</Text>
          )}
        </ScrollView>
      </View>
    );
  }

  // --- Preview Screen ---
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
          <Text style={styles.previewTitle}>Photo Preview</Text>
        </View>
        <View style={styles.previewBottomBar}>
          <TextInput 
             style={styles.enrollInput}
             placeholder="Employee Name/ID (optional)"
             placeholderTextColor="#999"
             value={enrollName}
             onChangeText={setEnrollName}
          />
          <View style={{flexDirection: 'row', gap: 10}}>
             <TouchableOpacity style={styles.retakeButton} onPress={handleRetake}>
               <Text style={styles.retakeButtonText}>Retake</Text>
             </TouchableOpacity>
             <TouchableOpacity style={[styles.verifyButton, {backgroundColor: '#34C759', flex: 1}]} onPress={() => processFace('ENROLL')}>
               <Text style={styles.verifyButtonText}>Enroll</Text>
             </TouchableOpacity>
             <TouchableOpacity style={[styles.verifyButton, {backgroundColor: '#4F8CFF', flex: 1}]} onPress={() => processFace('VERIFY')}>
               <Text style={styles.verifyButtonText}>Verify</Text>
             </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  }

  // --- Main Camera View ---
  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />

      {/* Camera Preview */}
      <Camera
        ref={cameraRef}
        style={StyleSheet.absoluteFill}
        device={device}
        isActive={!capturedPhoto}
        photo={true}
      />

      {/* Pseudo-Realtime UI Overlays */}
      {!capturedPhoto && isTracking && faceBounds && (
        <View style={{
          position: 'absolute',
          left: faceBounds.x,
          top: faceBounds.y,
          width: faceBounds.width,
          height: faceBounds.height,
          borderWidth: 3,
          borderColor: isAligned ? '#34C759' : '#FF3B30',
          borderRadius: 12,
        }} />
      )}

      {!capturedPhoto && isTracking && (
        <View style={{
           position: 'absolute',
           top: 130, // Pushed down to avoid top bar
           alignSelf: 'center',
           backgroundColor: 'rgba(0,0,0,0.7)',
           paddingHorizontal: 16,
           paddingVertical: 8,
           borderRadius: 20
        }}>
           <Text style={{color: isAligned ? '#34C759' : '#FF3B30', fontWeight: 'bold', fontSize: 16}}>
              {livenessMsg}
           </Text>
        </View>
      )}

      {/* Start Tracking Button */}
      {!capturedPhoto && !isTracking && (
        <TouchableOpacity 
          style={{
            position: 'absolute', 
            bottom: 200, 
            alignSelf: 'center', 
            backgroundColor: '#4F8CFF',
            paddingVertical: 14,
            paddingHorizontal: 30,
            borderRadius: 30,
            elevation: 5,
            shadowColor: '#000',
            shadowOpacity: 0.3,
            shadowRadius: 5
          }}
          onPress={() => setIsTracking(true)}
        >
          <Text style={{color: '#FFF', fontWeight: 'bold', fontSize: 16}}>Start Real-Time Tracking</Text>
        </TouchableOpacity>
      )}

      {/* Top Bar */}
      <View style={styles.topBar}>
        <View style={{flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center'}}>
          <View>
            <Text style={styles.topBarTitle}>NHAI Face Auth</Text>
            <Text style={styles.topBarSubtitle}>Offline Mode • Camera Ready</Text>
          </View>
          <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end', flex: 1 }}>
            {!onnxSession && (
              <TouchableOpacity 
                style={[styles.onnxButton, {backgroundColor: '#4F8CFF'}]} 
                onPress={initONNX}
                disabled={isInitializingONNX}
              >
                <Text style={styles.onnxButtonText}>
                  {isInitializingONNX ? 'Load...' : 'Init ONNX'}
                </Text>
              </TouchableOpacity>
            )}
            
            {onnxSession && (
              <>
                <TouchableOpacity 
                  style={[styles.onnxButton, {backgroundColor: '#FF9500'}]} 
                  onPress={testDatabase}
                >
                  <Text style={styles.onnxButtonText}>Test DB</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  style={[styles.onnxButton, {backgroundColor: '#FF3B30'}]} 
                  onPress={clearDatabase}
                >
                  <Text style={styles.onnxButtonText}>Clear DB</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
      </View>

      <TouchableOpacity 
        style={styles.galleryFAB} 
        onPress={() => setShowGallery(true)}
      >
        <Text style={styles.galleryFABText}>🖼️</Text>
      </TouchableOpacity>

      {/* Bottom Controls */}
      <View style={styles.bottomBar}>
        <View style={styles.statusRow}>
          <View style={styles.statusDot} />
          <Text style={styles.statusText}>Camera Active</Text>
        </View>
        
        <View style={styles.captureControls}>
          <TouchableOpacity style={styles.flipButtonSmall} onPress={toggleCamera}>
            <Text style={styles.flipButtonText}>🔄</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.captureButton} onPress={takePhoto}>
            <View style={styles.captureButtonInner} />
          </TouchableOpacity>

          <View style={styles.spacer} />
        </View>

        <Text style={styles.deviceInfo}>
          {device.name} ({cameraPosition})
        </Text>
      </View>
    </View>
  );
}

// ─── Styles ────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
    justifyContent: 'center',
    alignItems: 'center',
  },
  // Permission Screen
  permissionContainer: {
    flex: 1,
    backgroundColor: '#0D0D0D',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  iconContainer: {
    marginBottom: 24,
  },
  lockIcon: {
    fontSize: 64,
    marginBottom: 16,
  },
  permissionTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 12,
    textAlign: 'center',
  },
  permissionDescription: {
    fontSize: 15,
    color: '#999999',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 32,
  },
  permissionButton: {
    backgroundColor: '#4F8CFF',
    paddingVertical: 14,
    paddingHorizontal: 40,
    borderRadius: 12,
  },
  permissionButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  // Camera Overlay
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingTop: Platform.OS === 'android' ? 48 : 60,
    paddingBottom: 16,
    paddingHorizontal: 20,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  topBarTitle: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '700',
  },
  topBarSubtitle: {
    color: '#4F8CFF',
    fontSize: 13,
    fontWeight: '500',
    marginTop: 2,
  },
  galleryFAB: {
    position: 'absolute',
    top: Platform.OS === 'android' ? 60 : 70,
    right: 20,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  galleryFABText: {
    fontSize: 20,
  },
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingBottom: 40,
    paddingTop: 20,
    paddingHorizontal: 20,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#34C759',
    marginRight: 8,
  },
  statusText: {
    color: '#34C759',
    fontSize: 14,
    fontWeight: '600',
  },
  captureControls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    marginBottom: 16,
  },
  flipButtonSmall: {
    backgroundColor: 'rgba(255,255,255,0.15)',
    width: 50,
    height: 50,
    borderRadius: 25,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 30,
  },
  flipButtonText: {
    color: '#FFFFFF',
    fontSize: 20,
  },
  spacer: {
    width: 50,
    marginLeft: 30,
  },
  captureButton: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 4,
    borderColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  captureButtonInner: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#FFFFFF',
  },
  deviceInfo: {
    color: '#666',
    fontSize: 12,
  },
  // Preview Screen
  previewTopBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingTop: Platform.OS === 'android' ? 48 : 60,
    paddingBottom: 16,
    paddingHorizontal: 20,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
  },
  previewTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '600',
  },
  previewBottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingBottom: 40,
    paddingTop: 20,
    paddingHorizontal: 20,
    backgroundColor: 'rgba(0,0,0,0.6)',
    flexDirection: 'column',
    justifyContent: 'center',
    alignItems: 'stretch',
  },
  retakeButton: {
    paddingVertical: 14,
    paddingHorizontal: 30,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  retakeButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  verifyButton: {
    paddingVertical: 14,
    paddingHorizontal: 30,
    borderRadius: 12,
    backgroundColor: '#4F8CFF',
  },
  verifyButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  // Gallery Screen
  galleryHeader: {
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: Platform.OS === 'android' ? 48 : 60,
    paddingBottom: 16,
    paddingHorizontal: 20,
    backgroundColor: '#111',
  },
  galleryTitle: {
    color: '#FFF',
    fontSize: 20,
    fontWeight: '700',
  },
  closeButton: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 8,
  },
  closeButtonText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '600',
  },
  galleryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: 2,
    paddingBottom: 40,
  },
  galleryImage: {
    width: GALLERY_IMAGE_SIZE,
    height: GALLERY_IMAGE_SIZE,
    margin: 2,
    borderRadius: 4,
    backgroundColor: '#333',
  },
  emptyText: {
    color: '#666',
    fontSize: 16,
    marginTop: 40,
    textAlign: 'center',
    width: '100%',
  },
  onnxButton: {
    backgroundColor: '#4F8CFF',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  onnxButtonText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '700',
  },
  enrollInput: {
    backgroundColor: '#333',
    color: '#FFF',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
    width: '100%',
  },
});

export default App;
