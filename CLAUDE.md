# NHAI Hackathon 7.0 — Offline Face Authentication System

## What this project is

A fully offline face recognition + liveness detection system built for NHAI's Hackathon 7.0.
It authenticates field personnel on mid-range Android/iOS devices with zero network dependency.
When connectivity is restored it syncs attendance records to AWS and purges local data.

This is a **React Native CLI project** (not Expo). It uses native C++ modules (ONNX Runtime,
Vision Camera) and cannot run in Expo Go — it must be built natively via Android Studio / Xcode.

---

## Repository layout

```
FaceAuth-NHAI-Hackathon-7.0/
├── FaceAuthApp/                         ← React Native mobile app
│   ├── App.tsx                          ← Main UI, liveness state machine, ONNX init
│   ├── FaceProcessor.ts                 ← Face crop + bilinear resize + adaptive gamma
│   ├── Database.ts                      ← SQLite: AES-256 embeddings + attendance_log
│   ├── SyncService.ts                   ← NetInfo-based AWS sync + purge
│   ├── FaceAuthSDK.ts                   ← Clean API wrapper for Datalake 3.0 integration
│   ├── android/app/src/main/assets/
│   │   └── w600k_mbf.onnx               ← MobileFaceNet (13.6 MB float32)
│   │                                       swap for w600k_mbf_int8.onnx after quantization
│   ├── ios/FaceAuthApp/                 ← iOS bundle (add ONNX model here via Xcode)
│   ├── package.json
│   └── tsconfig.json
├── quantize_model.py                    ← INT8 quantization script (13.6 MB → ~3.5 MB)
├── blink_detection.py                   ← Python prototype (webcam, not mobile)
├── combined_pipeline.py                 ← Python trust-score pipeline (not mobile)
├── compare_faces.py / register_user.py  ← Python face matching utilities
└── README.md
```

---

## Tech stack

| Concern | Library | Notes |
|---|---|---|
| Camera | `react-native-vision-camera` ^4.7.3 | Photo capture only, no frame processors |
| Face detection | `@react-native-ml-kit/face-detection` ^2.0.1 | Eye open/smile/yaw probabilities |
| ONNX inference | `onnxruntime-react-native` ^1.19.2 | CPU-only, C++ native module |
| Face embedding | `w600k_mbf.onnx` (MobileFaceNet) | Input: 1×3×112×112 NCHW, output: 512-d vector |
| Image decode | `jpeg-js` + `base64-js` | Pure JS JPEG decode for crop pipeline |
| Local DB | `react-native-sqlite-storage` ^6.0.1 | Two tables: registered_users, attendance_log |
| Encryption | `crypto-js` ^4.2.0 | AES-256 for embeddings at rest |
| Connectivity | `@react-native-community/netinfo` ^11.3.1 | Triggers AWS sync on network restore |
| React Native | 0.76.9 | New Architecture compatible |

---

## Key architectural decisions

### Face preprocessing pipeline (FaceProcessor.ts)
Single-pass: decode JPEG → extract face crop using ML Kit bounding box → bilinear resize to
112×112 → adaptive gamma correction for outdoor lighting → Float32 NCHW tensor [-1, 1].

**Critical**: The full image is NOT squeezed to 112×112. The ML Kit `face.frame` (image-space
pixel coordinates) is used to crop first, then resize. This is what makes accuracy work.

### Liveness detection (App.tsx tracking loop)
Three-phase state machine at 400ms polling (2.5 FPS):
1. **DETECTING** — face appears, assign random challenge from {BLINK, SMILE, TURN_LEFT, TURN_RIGHT}
2. **CHALLENGE** — verify user performed the challenge via ML Kit probabilities
3. **STABLE** — 3 consecutive aligned frames (yaw < 15°, eyes open > 0.3) → auto-capture

Challenge detection thresholds:
- BLINK: avg eye prob drops < 0.15 then rises > 0.45 (full blink cycle)
- SMILE: `smilingProbability > 0.72` for 2 consecutive frames
- TURN_LEFT/RIGHT: `yawAngle < -28` or `> 28` for 1 frame

**State refs vs state**: challenge and challengeCompleted are tracked via refs inside the
setInterval closure to avoid stale closure issues, with React state kept in sync for UI updates.

### Embedding storage (Database.ts)
Embeddings are AES-256 encrypted with `crypto-js` before writing to SQLite.
In production, derive the key from Android Keystore / iOS Secure Enclave.
Current key: hardcoded constant (`ENC_KEY`) — acceptable for hackathon demo.

**If you re-install the app or change ENC_KEY, old enrolled users will fail to decrypt.
Clear the database and re-enroll all users.**

### Attendance queue + sync (SyncService.ts)
`attendance_log` table stores: employee_id, timestamp, similarity_score, challenge, synced.
`SyncService.start()` attaches a NetInfo listener. When `isConnected && isInternetReachable`,
it POSTs all `synced=0` records to `AWS_ENDPOINT`, marks them `synced=1`, purges records
older than 30 days.

**Before demo**: set `AWS_ENDPOINT` in `SyncService.ts` to your actual API Gateway URL.

### Authentication threshold
Cosine similarity threshold: **0.60** (raised from original 0.55 to reduce false positives).
MobileFaceNet typical operating range: 0.58–0.65 depending on lighting/demographics.

---

## How to run

### Prerequisites
- Node.js 18+
- Android Studio (SDK 35, NDK 26.1, Build Tools 35, Java 17)
- `ANDROID_HOME` environment variable set
- Physical Android device (camera doesn't work on emulator)
- USB Debugging enabled on device

### First-time setup
```bash
cd FaceAuth-NHAI-Hackathon-7.0/FaceAuthApp
npm install          # installs all JS deps including crypto-js, netinfo
# For iOS only:
cd ios && pod install && cd ..
```

### Run on Android
```bash
# Terminal 1
npm start            # Metro bundler

# Terminal 2
npm run android      # Gradle build + deploy (~8 min first time, ~30s after)
```

### Run on iOS
iOS requires the ONNX model to be added to the Xcode bundle manually:
1. Open `ios/FaceAuthApp.xcworkspace` in Xcode
2. Drag `android/app/src/main/assets/w600k_mbf.onnx` into the Xcode project
3. Ensure "Copy items if needed" and "Add to target: FaceAuthApp" are checked
4. `npm run ios`

---

## Model quantization (optional but recommended for demo)

Reduces model from 13.6 MB → ~3.5 MB, 2–4× faster inference:

```bash
cd FaceAuth-NHAI-Hackathon-7.0
pip install onnxruntime onnx
python quantize_model.py
```

Then in `App.tsx` change:
```typescript
const MODEL_NAME = 'w600k_mbf_int8.onnx';
```

---

## Authentication flow (end-to-end)

```
User taps "Start Face Auth"
  → Camera polls at 400ms
  → ML Kit detects face → random challenge assigned (BLINK / SMILE / TURN_LEFT / TURN_RIGHT)
  → User performs challenge (verified via ML Kit probabilities)
  → 3 stable aligned frames → auto-capture
  → User presses Enroll or Verify

ENROLL path:
  crop+resize face → ONNX → 512-d embedding → AES-encrypt → SQLite

VERIFY path:
  crop+resize face → ONNX → 512-d embedding → cosine similarity vs all enrolled
  threshold 0.60 → match/no-match → log to attendance_log
  → on network: SyncService posts to AWS → purge synced records
```

---

## Known limitations & TODOs

- **iOS model path**: iOS build will fail until `w600k_mbf.onnx` is added to the Xcode bundle.
  The code already handles the `RNFS.MainBundlePath` path on iOS.
- **AES key management**: `ENC_KEY` in `Database.ts` is a hardcoded constant. Production
  deployment must derive this from the device's secure hardware (Android Keystore / iOS SE).
- **AWS endpoint**: `SyncService.ts` has a placeholder URL. Set it before demo.
- **Accuracy benchmarks**: No formal accuracy benchmark against an Indian face dataset exists
  in this repo. The MobileFaceNet w600k model achieves ~99.1% on LFW; field accuracy on
  diverse Indian demographics under outdoor lighting is estimated at 95%+ with gamma correction.
- **Python scripts** (`combined_pipeline.py`, etc.) are research prototypes running on webcam.
  They do not run on the mobile device. They were used to prototype the liveness algorithms
  that are now implemented in TypeScript in App.tsx.

---

## Evaluation criteria mapping

| Criterion | Implementation |
|---|---|
| Edge AI model efficiency | MobileFaceNet ONNX 13.6 MB; INT8 quantization → ~3.5 MB |
| Liveness detection | Random challenge-response: BLINK / SMILE / TURN_LEFT / TURN_RIGHT |
| Integration (Datalake 3.0) | `FaceAuthSDK.ts` exposes `initialize`, `enroll`, `authenticate`, `syncNow` |
| Performance < 1 sec | Benchmark overlay in app shows per-stage timing (ML Kit / preproc / ONNX / DB) |
| Lighting robustness | Adaptive gamma correction in `FaceProcessor.ts` |
| Offline-to-online sync | `SyncService.ts` + `attendance_log` table with NetInfo listener |
| Encrypted biometrics | AES-256 embeddings in SQLite via `crypto-js` |
| Open source only | All dependencies Apache 2.0 / MIT licensed |

---

## File change history (what was changed from the original submission)

| File | Change |
|---|---|
| `FaceProcessor.ts` | Complete rewrite: fixed crop bug, added bilinear resize, adaptive gamma |
| `Database.ts` | Added AES-256 encryption, `attendance_log` table, sync helper methods |
| `SyncService.ts` | New file: NetInfo listener + AWS POST + purge |
| `FaceAuthSDK.ts` | New file: clean SDK wrapper for Datalake integration |
| `App.tsx` | Challenge-response liveness, benchmark overlay, sync button, threshold 0.60 |
| `package.json` | Added `crypto-js`, `@react-native-community/netinfo` |
| `AndroidManifest.xml` | Added `ACCESS_NETWORK_STATE` permission |
| `tsconfig.json` | Added `lib: ES2019`, `target: ES2017` override |
| `quantize_model.py` | New file: INT8 quantization script |
