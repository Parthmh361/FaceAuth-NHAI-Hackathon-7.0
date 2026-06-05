<div align="center">

# NHAI FaceAuth

### Offline Facial Recognition & Liveness Detection for Field Personnel

**Secure, on-device biometric authentication that works in zero-network zones.**

Built for **NHAI Hackathon 7.0** — designed to integrate seamlessly into the Datalake 3.0 React Native app.

[![React Native](https://img.shields.io/badge/React_Native-0.76.9-61DAFB?logo=react&logoColor=white)](https://reactnative.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![ONNX Runtime](https://img.shields.io/badge/ONNX_Runtime-1.19-005CED?logo=onnx&logoColor=white)](https://onnxruntime.ai/)
[![Platform](https://img.shields.io/badge/Platform-Android_|_iOS-success)](https://reactnative.dev/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](#license)
[![Offline First](https://img.shields.io/badge/Network-100%25_Offline-orange)]()

</div>

---

## 📲 Download APK

> **Quick install — no build required.**

| | |
|---|---|
| **Pre-built APK** | [`FaceAuthApp-release.apk`](https://github.com/Parthmh361/FaceAuth-NHAI-Hackathon-7.0/releases/latest) (~208 MB) |
| **Signed with** | Debug keystore (sideload-ready for testing/demo) |
| **Min Android** | 8.0 (API 26) |

**To install:** Download the APK → transfer to your Android phone → open → enable "Install from unknown sources" when prompted → install.

The APK is also available locally in the repo root as `FaceAuthApp-release.apk` after building.

---

## Overview

NHAI FaceAuth authenticates field personnel using **facial recognition** and **active liveness detection** entirely on-device — no internet connection required. It is engineered for **standard mid-range phones** (Android 8.0+ / iOS 12+, 3 GB RAM) operating in remote highway zones with little or no connectivity.

When the network returns, attendance records sync to AWS and local data is purged — giving you **offline reliability** with **online auditability**.

> **Problem solved:** *"How can we accurately and securely authenticate field personnel using facial recognition and liveness detection on standard mid-range mobile devices without any active internet connection?"*

---

## Key Features

| | Feature | Description |
|---|---|---|
| 🔒 | **100% Offline** | Face matching, liveness, and storage run entirely on-device. No cloud calls during authentication. |
| 👁️ | **Active Liveness** | Random challenge-response (**blink · turn left · turn right**) defeats photo & screen spoofing. |
| 🧠 | **Lightweight Edge AI** | MobileFaceNet ONNX model — **13.6 MB** FP32, quantizable to **~3.5 MB** INT8. |
| ⚡ | **Sub-Second Auth** | End-to-end recognition + liveness in **< 1 second** on mid-range hardware. |
| 🌗 | **Lighting Robust** | Adaptive gamma correction handles harsh sunlight, low light, and shadows. |
| 🔐 | **Encrypted Biometrics** | Face embeddings stored with **AES-256-CBC** encryption at rest. |
| ☁️ | **Sync & Purge** | Auto-sync attendance to AWS on connectivity restore, then purge local records. |
| 🧩 | **Drop-in SDK** | Clean `FaceAuthSDK` API for one-line integration into Datalake 3.0. |
| 📊 | **Live Benchmarks** | Per-stage timing overlay after every verification (ML Kit / preprocess / ONNX / DB). |

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                React Native — 100% Offline                       │
│                                                                  │
│   ┌──────────────┐   ┌─────────────────┐   ┌─────────────────┐  │
│   │  Enroll /    │   │ FaceProcessor   │   │  FaceAuthSDK    │  │
│   │  Verify      │   │ Crop · Resize   │   │  enroll         │  │
│   │  Screens     │   │ Gamma · NCHW    │   │  authenticate   │  │
│   └──────┬───────┘   └───────┬─────────┘   └────────┬────────┘  │
│          │                   │                       │           │
└──────────┼───────────────────┼───────────────────────┼──────────┘
           │                   │                       │
     ┌─────▼─────┐      ┌──────▼──────┐        ┌───────▼────────┐
     │  ML Kit   │      │ ONNX Runtime│        │   SQLite +     │
     │  (native) │      │   (C++)     │        │   AES-256      │
     │ blink/yaw │      │ MobileFaceNet│       │  employees +   │
     │  /pitch   │      │ 512-d vector │       │ attendance_log │
     └───────────┘      └─────────────┘        └───────┬────────┘
                                                        │
                                               ┌────────▼─────────┐
                                               │   SyncService    │
                                               │ NetInfo → AWS →  │
                                               │  purge (30 days) │
                                               └──────────────────┘
```

**Two-stage pipeline:** Lightweight ML Kit runs continuously for real-time UI feedback (bounding box, liveness challenges). The ONNX embedding inference fires **once** — at the capture moment — keeping the app responsive on mid-range CPUs.

---

## How It Works

```
 ┌──────────────────────────────────────────────────────────────┐
 │  1. User taps "Enroll Employee" or "Verify & Check-In"       │
 │  2. ML Kit detects face → random challenge assigned          │
 │             👁 BLINK   ↩ TURN LEFT   ↪ TURN RIGHT            │
 │  3. User performs challenge (verified live)                  │
 │  4. 3 stable aligned frames (yaw<15° pitch<18° roll<18°)     │
 │     → auto-capture (no manual button)                        │
 │  5. Crop face → resize 112×112 → gamma → ONNX → 512-d vector │
 └──────────────────────────────────────────────────────────────┘
              │                              │
        ┌─────▼─────┐                  ┌─────▼──────┐
        │  ENROLL   │                  │   VERIFY   │
        │  AES-256  │                  │  cosine ≥  │
        │  → SQLite │                  │   0.60     │
        └───────────┘                  └─────┬──────┘
                                             │ match
                                       ┌─────▼─────────┐
                                       │ log attendance│
                                       │ → sync to AWS │
                                       │ → purge local │
                                       └───────────────┘
```

---

## Tech Stack

| Concern | Technology | Notes |
|---|---|---|
| Framework | React Native `0.76.9` | Cross-platform Android + iOS; New Architecture compatible |
| Camera | `react-native-vision-camera` ^4.7.3 | Photo capture; no frame processors needed |
| Face Detection | `@react-native-ml-kit/face-detection` ^2.0.1 | Eye open prob, yaw/pitch/roll, bbox |
| Embedding Model | `w600k_mbf.onnx` (MobileFaceNet) | Input `1×3×112×112` NCHW; output 512-d vector |
| Inference | `onnxruntime-react-native` ^1.19.2 | CPU-only C++ — no GPU required |
| Image Resize | `@bam.tech/react-native-image-resizer` | Native one-pass downscale before JS pixel work |
| Image Decode | `jpeg-js` + `base64-js` | Pure-JS JPEG decode for crop + spoof pipeline |
| Local DB | `react-native-sqlite-storage` ^6.0.1 | `employees` + `attendance_log`; forward-migration safe |
| Encryption | `crypto-js` ^4.2.0 | AES-256-CBC for embeddings at rest |
| Connectivity | `@react-native-community/netinfo` ^11.3.1 | Triggers sync on network restore |
| Navigation | `@react-navigation/native` + `native-stack` + `bottom-tabs` | Typed stack + tab navigator |
| Settings | `@react-native-async-storage/async-storage` | Persistent app settings |

> **Open-source only** — every dependency is Apache 2.0 / MIT licensed. No proprietary SDKs or additional licenses required.

---

## Repository Structure

```
FaceAuth-NHAI-Hackathon-7.0/
│
├── FaceAuthApp/                          # React Native mobile app (TypeScript)
│   ├── App.tsx                           # Shell: SafeAreaProvider + AppProvider + NavigationContainer
│   ├── index.js                          # RN entry point
│   │
│   ├── context/
│   │   └── AppContext.tsx                # ONNX session, settings, enrolled/pending counts, syncNow
│   │
│   ├── navigation/
│   │   ├── types.ts                      # Typed RootStackParamList + TabParamList
│   │   └── RootNavigator.tsx             # NativeStack (Boot → Tabs) + Enroll/Verify modals
│   │
│   ├── screens/
│   │   ├── BootScreen.tsx                # Camera permission gate + ONNX warm-up → Tabs
│   │   ├── HomeScreen.tsx                # Dashboard: enrolled count, pending sync, CTA buttons
│   │   ├── EnrollScreen.tsx              # Multi-step: camera → form → SDK → result
│   │   ├── VerifyScreen.tsx              # Camera → SDK match → result card with timing breakdown
│   │   ├── HistoryScreen.tsx             # Attendance log FlatList; pull-to-refresh syncs AWS
│   │   ├── UsersScreen.tsx               # Enrolled employees list; delete with Alert confirm
│   │   └── SettingsScreen.tsx            # Threshold, liveness, spoof, camera, AWS endpoint
│   │
│   ├── components/
│   │   ├── FaceCamera.tsx                # Reusable camera + challenge-response liveness component
│   │   ├── Icon.tsx                      # Pure-View icon set (no image assets / no rebuild needed)
│   │   └── ui.tsx                        # Screen, Header, Card, Button, Stat, Pill, Row, EmptyState
│   │
│   ├── core/
│   │   └── faceMath.ts                   # PURE logic — no native imports, fully unit-tested
│   │                                     # cosineSimilarity · l2Normalize · gammaFor ·
│   │                                     # spoofVerdict · evaluateChallenge
│   │
│   ├── services/
│   │   └── SettingsStore.ts              # AsyncStorage: AppSettings load / save / update
│   │
│   ├── FaceProcessor.ts                  # Crop → bilinear 112×112 → adaptive gamma → NCHW tensor
│   ├── SpoofDetector.ts                  # Passive texture anti-spoof (sharpness / glare / brightness)
│   ├── Database.ts                       # SQLite: AES-256 embeddings + attendance_log; migrations
│   ├── SyncService.ts                    # NetInfo listener → AWS POST → mark synced → purge
│   ├── FaceAuthSDK.ts                    # Public SDK: enrollFromPhoto · verifyFromPhoto · syncNow
│   ├── theme.ts                          # Design tokens: colors, spacing, radius, font
│   │
│   ├── __tests__/
│   │   └── faceMath.test.ts              # 25 assertions over core algorithms (Node/Jest, no mocks)
│   │
│   ├── android/app/src/main/assets/
│   │   └── w600k_mbf.onnx                # MobileFaceNet model (13.6 MB)
│   └── ios/FaceAuthApp/
│       └── w600k_mbf.onnx                # Same model — registered in project.pbxproj
│
├── aws-backend/                          # Serverless sync backend
│   ├── lambda_handler.py                 # Lambda: validate payload → write to DynamoDB
│   ├── serverless.yml                    # One-command deploy: Lambda + API Gateway + DynamoDB
│   ├── mock_server.py                    # Zero-dependency local HTTP server for offline demos
│   └── README.md                         # Deploy + config instructions
│
├── docs/
│   ├── ARCHITECTURE.md                   # System architecture with Mermaid diagrams
│   ├── BENCHMARKS.md                     # Performance and accuracy target tables
│   └── SUBMISSION.md                     # Complete hackathon submission document
│
├── FaceAuthApp-release.apk               # ⬇ Pre-built release APK (~208 MB)
├── accuracy_benchmark.py                 # FAR / FRR / EER / accuracy harness for the ONNX model
├── quantize_model.py                     # INT8 dynamic quantization (13.6 MB → ~3.5 MB)
│
│   # ── Python research prototypes (webcam-only, not on-device) ──────────
│   # Their algorithms are now implemented in TypeScript (core/faceMath.ts,
│   # SpoofDetector.ts). These files are kept for reference only.
├── blink_detection.py
├── smile_detection.py
├── head_pose_detection.py
├── passive_spoof_detection.py
├── depth_liveness.py
├── combined_pipeline.py
├── compare_faces.py
├── register_user.py
├── benchmark_pipeline.py
└── test_facenet.py
│
├── LICENSE                               # MIT + third-party license inventory
└── README.md                             # This file
```

---

## App Screens

| Screen | Role |
|---|---|
| **Boot** | Checks camera permission, initialises ONNX session (one warm-up inference), then replaces itself with the tab navigator. |
| **Home** | Dashboard: enrolled employee count, pending-sync count, last sync message. "Enroll Employee" and "Verify & Check-In" CTA cards. Manual sync button. |
| **Enroll** | Modal — four phases: `FaceCamera` liveness capture → analyzing spinner → employee ID/name/designation form → result (or retry on error). Embedding computed at capture time, before the form. |
| **Verify** | Modal — `FaceCamera` liveness capture → identity match → result card with employee details, confidence %, and per-stage timing breakdown. |
| **History** | Attendance log (newest first). Shows employee name, timestamp, match confidence, liveness challenge. Pull-to-refresh triggers AWS sync. |
| **Users** | Enrolled employees list with name, designation, enrolled date. Tap × to delete (Alert confirm). Navigate to Enroll for new registrations. |
| **Settings** | Match threshold slider (0.40–0.90), liveness toggle, spoof-check toggle, default camera position, AWS endpoint input, admin PIN, danger-zone wipe. |

---

## Getting Started

### Option A — Install pre-built APK (fastest)

1. Download [`FaceAuthApp-release.apk`](https://github.com/Parthmh361/FaceAuth-NHAI-Hackathon-7.0/releases/latest) (~208 MB)
2. Transfer to your Android phone (USB / AirDrop / cloud storage)
3. Open the APK → enable "Install from unknown sources" → install
4. Launch the app, grant camera permission, and you're ready to go

### Option B — Build from source

#### Prerequisites

- **Node.js** 18 or higher
- **Android Studio** (SDK 35, NDK 26.1, Build Tools 35, Java 17)
- A **physical Android device** — Android 8.0+ (camera is unavailable on emulators)
- USB debugging enabled on the device

#### Install & run on Android

```bash
cd FaceAuthApp
npm install

# Terminal 1 — Metro bundler
npm start

# Terminal 2 — build and deploy to device
npm run android
# First build: ~8 min (NDK compilation of ONNX Runtime + Vision Camera)
```

#### Build release APK

```bash
cd FaceAuthApp/android
./gradlew assembleRelease
# APK output: android/app/build/outputs/apk/release/app-release.apk
```

### Run on iOS

```bash
cd FaceAuthApp/ios && pod install && cd ..
npm run ios
```

The ONNX model is bundled as a resource in the Xcode target and loaded from the main bundle on iOS.

### First launch

1. Grant camera permission when prompted.
2. Tap **Initialize System** — copies the model to app storage and runs a warm-up inference (~5 s first time).
3. You land on the Home dashboard.

---

## Datalake 3.0 Integration

`FaceAuthSDK` is the single public surface. Bundle the ONNX asset and call four methods:

```typescript
import { FaceAuthSDK } from './FaceAuthSDK';
import { InferenceSession } from 'onnxruntime-react-native';

// Once, at app startup
const session = await InferenceSession.create(modelPath);
await FaceAuthSDK.initialize(session, { threshold: 0.60, spoofEnabled: true });

// Enroll a field employee (low-level: caller supplies ML Kit face bounds)
await FaceAuthSDK.enroll(imageUri, faceBounds, 'EMP-1234');

// Authenticate + log attendance in one call
const result = await FaceAuthSDK.authenticate(imageUri, faceBounds, 'BLINK');
if (result.success) {
  console.log(`${result.employeeId} — ${(result.score * 100).toFixed(1)}%`);
}

// Sync pending records (also fires automatically via NetInfo listener)
await FaceAuthSDK.syncNow();
```

See [docs/SUBMISSION.md](docs/SUBMISSION.md) §9 for the full API reference including the high-level `enrollFromPhoto` / `verifyFromPhoto` methods used by the app's own screens.

---

## Security

- **AES-256-CBC** encryption of all face embeddings before writing to SQLite; decrypted only in memory at match time.
- **Raw images never stored or transmitted** — only the 512-dimensional embedding vector is kept, and it is encrypted.
- **Only attendance metadata syncs to AWS** — employee ID, timestamp, match score, liveness challenge. No biometric data leaves the device.
- **Sync & purge** — attendance records older than 30 days are deleted locally after a successful upload.

> **Production note:** the demo derives the AES key from a hardcoded constant. For deployment, derive it from **Android Keystore / iOS Secure Enclave** (see `Database.ts` for the swap point).

---

## Performance

| Stage | Estimate |
|---|---|
| ML Kit face detection | ~120–250 ms |
| Preprocessing (crop + resize + gamma) | ~80–200 ms |
| ONNX inference (512-d embedding) | ~60–150 ms |
| Database match (cosine over all enrolled) | < 5 ms |
| **Total end-to-end** | **< 1 second ✅** |

Live timing is shown in the app after each Verify — see the per-stage breakdown on the result card.

---

## Testing

```bash
cd FaceAuthApp
npm test      # runs __tests__/faceMath.test.ts (25 assertions)
```

The tests cover `cosineSimilarity`, `l2Normalize`, `gammaFor`, `buildGammaLUT`, `spoofVerdict`, and the full liveness `evaluateChallenge` state machine. No native mocks — `core/faceMath.ts` imports nothing from React Native.

---

## AWS Backend

### Local demo (no AWS account needed)

```bash
python aws-backend/mock_server.py
# prints every batch received; replies 200 so the app marks records synced
```

Set **Settings → AWS Endpoint** to `http://<laptop-ip>:8080/attendance`.

### Deploy to AWS

```bash
cd aws-backend
npm install -g serverless
serverless deploy --stage prod
# paste the printed endpoint URL into Settings → AWS Endpoint
```

Creates: Lambda + API Gateway + DynamoDB (`nhai_attendance`, PK `employee_id` + SK `timestamp` — idempotent retries). See [`aws-backend/README.md`](aws-backend/README.md) for full details.

---

## Accuracy Benchmark

```bash
pip install onnxruntime numpy opencv-python

# Pipeline smoke test (no dataset needed)
python accuracy_benchmark.py --selftest

# Full FAR / FRR / EER evaluation
# Prepare: dataset/<person_name>/<img1.jpg> ...
python accuracy_benchmark.py --dataset ./dataset
```

Reports accuracy, FAR, FRR, EER, genuine/impostor score separation, and single-core ONNX latency using the exact mobile preprocessing pipeline. Writes `accuracy_results.json`.

---

## Model Quantization (Optional)

```bash
pip install onnxruntime onnx
python quantize_model.py   # 13.6 MB → ~3.5 MB INT8
```

Then in `context/AppContext.tsx`:

```typescript
const MODEL_NAME = 'w600k_mbf_int8.onnx';
```

---

## Documentation

| Document | Contents |
|---|---|
| [`docs/SUBMISSION.md`](docs/SUBMISSION.md) | Complete hackathon submission: all algorithms, API reference, security design, evaluation criteria mapping |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | System architecture with Mermaid diagrams, enrollment/verify/sync flow |
| [`docs/BENCHMARKS.md`](docs/BENCHMARKS.md) | Performance and accuracy target tables with instrumentation guide |

---

## Evaluation Criteria Mapping

| Criterion | How it is addressed |
|---|---|
| **Innovation** — edge AI & compression | MobileFaceNet ONNX 13.6 MB; INT8 path to ~3.5 MB |
| **Innovation** — offline liveness | Randomised challenge-response (BLINK / TURN) + passive texture anti-spoof |
| **Innovation** — field accuracy | Adaptive gamma; three-axis pose enforcement; texture-gated spoof verdict for sunlight |
| **Feasibility** — Datalake integration | Drop-in `FaceAuthSDK` — 4 methods, no UI required |
| **Feasibility** — speed < 1 s | Two-stage pipeline; per-stage timing visible in-app |
| **Feasibility** — no GPU / mid-range | CPU-only ONNX Runtime; tested on Snapdragon 6-series class hardware |
| **Scalability** — sync / purge | NetInfo-driven AWS sync; idempotent DynamoDB write; 30-day auto-purge |
| **Scalability** — growing workforce | Add users = new DB row; no retraining; cosine 1:N scan |
| **Documentation** | This README + full `docs/` folder |

---

## Known Limitations

| Item | Status |
|---|---|
| AES key is hardcoded | Move to Android Keystore / iOS Secure Enclave for production |
| AWS endpoint is a placeholder | Set it in Settings or use `mock_server.py` before demo |
| INT8 model not bundled | `ConvInteger` not in ORT CPU kernel; static QDQ quantization is the production fix |
| Accuracy on Indian demographics | Harness exists; run against a labelled dataset to get measured numbers |

---

## Contributors

- **Parthmh361**
- **9SERG4NT**

---

## License

Released under the **MIT License** — free to use, modify, and distribute. See [`LICENSE`](LICENSE) for the full text and third-party license inventory.

---

<div align="center">

**Built for NHAI Hackathon 7.0**

Queries: `pranjalgupta@nhai.org`

</div>
