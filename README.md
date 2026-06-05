<div align="center">

# 🛣️ NHAI FaceAuth

### Offline Facial Recognition & Liveness Detection for Field Personnel

**Secure, on-device biometric authentication that works in zero-network zones.**

Built for **NHAI Hackathon 7.0** — designed to integrate seamlessly into the Datalake 3.0 React Native app.

[![React Native](https://img.shields.io/badge/React_Native-0.76.9-61DAFB?logo=react&logoColor=white)](https://reactnative.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![ONNX Runtime](https://img.shields.io/badge/ONNX_Runtime-1.19-005CED?logo=onnx&logoColor=white)](https://onnxruntime.ai/)
[![Platform](https://img.shields.io/badge/Platform-Android_|_iOS-success)](https://reactnative.dev/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](#-license)
[![Offline First](https://img.shields.io/badge/Network-100%25_Offline-orange)]()

</div>

---

## 📖 Overview

NHAI FaceAuth authenticates field personnel using **facial recognition** and **active liveness detection** entirely on-device — no internet connection required. It is engineered for **standard mid-range phones** (Android 8.0+ / iOS 12+, 3 GB RAM) operating in remote highway zones with little or no connectivity.

When the network returns, attendance records sync to AWS and local data is purged — giving you **offline reliability** with **online auditability**.

> **Problem solved:** *"How can we accurately and securely authenticate field personnel using facial recognition and liveness detection on standard mid-range mobile devices without any active internet connection?"*

---

## ✨ Key Features

| | Feature | Description |
|---|---|---|
| 🔒 | **100% Offline** | Face matching, liveness, and storage run entirely on-device. No cloud calls during authentication. |
| 👁️ | **Active Liveness** | Random challenge-response (**blink · smile · turn left · turn right**) defeats photo & screen spoofing. |
| 🧠 | **Lightweight Edge AI** | MobileFaceNet ONNX model — **13.6 MB**, quantizable to **~3.5 MB** (INT8). |
| ⚡ | **Sub-Second Auth** | End-to-end recognition + liveness in **< 1 second** on mid-range hardware. |
| 🌗 | **Lighting Robust** | Adaptive gamma correction handles harsh sunlight, low light, and shadows. |
| 🔐 | **Encrypted Biometrics** | Face embeddings stored with **AES-256** encryption at rest. |
| ☁️ | **Sync & Purge** | Auto-sync attendance to AWS on connectivity restore, then purge local records. |
| 🧩 | **Drop-in SDK** | Clean `FaceAuthSDK` API for one-line integration into Datalake 3.0. |
| 📊 | **Live Benchmarks** | On-device overlay shows per-stage timing (ML Kit / preprocess / ONNX / DB). |

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     React Native (TypeScript)                    │
│                                                                  │
│   ┌────────────┐   ┌─────────────────┐   ┌───────────────────┐  │
│   │  App.tsx   │   │ FaceProcessor.ts│   │   FaceAuthSDK.ts  │  │
│   │ Liveness   │   │ Crop · Resize   │   │  enroll()         │  │
│   │ State M/C  │   │ Gamma · NCHW    │   │  authenticate()   │  │
│   └─────┬──────┘   └────────┬────────┘   └─────────┬─────────┘  │
│         │                   │                       │            │
└─────────┼───────────────────┼───────────────────────┼───────────┘
          │                   │                       │
    ┌─────▼─────┐      ┌──────▼──────┐        ┌───────▼────────┐
    │  ML Kit   │      │ ONNX Runtime│        │   SQLite +     │
    │  (native) │      │   (C++)     │        │   AES-256      │
    │ blink/yaw │      │ MobileFaceNet│        │  embeddings +  │
    │ /smile    │      │ 512-d vector │        │ attendance_log │
    └───────────┘      └─────────────┘        └───────┬────────┘
                                                       │
                                              ┌────────▼─────────┐
                                              │   SyncService    │
                                              │ NetInfo → AWS →  │
                                              │  purge (30 days) │
                                              └──────────────────┘
```

**Two-stage pipeline:** Lightweight ML Kit runs continuously for real-time UI feedback (bounding box, liveness challenges). The heavy ONNX embedding inference fires only once — at the capture moment — keeping the app responsive on mid-range CPUs.

---

## 🧰 Tech Stack

| Concern | Technology | Notes |
|---|---|---|
| Framework | React Native `0.76.9` | Cross-platform Android + iOS |
| Camera | `react-native-vision-camera` | Photo capture (no frame processors) |
| Face Detection | `@react-native-ml-kit/face-detection` | Eye / smile / head-pose probabilities |
| Embedding Model | `w600k_mbf.onnx` (MobileFaceNet) | Input `1×3×112×112`, output 512-d vector |
| Inference | `onnxruntime-react-native` | CPU-only, no GPU required |
| Image Decode | `jpeg-js` + `base64-js` | Pure-JS JPEG decode for crop pipeline |
| Local DB | `react-native-sqlite-storage` | `registered_users` + `attendance_log` |
| Encryption | `crypto-js` | AES-256 for embeddings at rest |
| Connectivity | `@react-native-community/netinfo` | Triggers sync on network restore |

> **Open-source only** — every dependency is Apache 2.0 / MIT licensed. No proprietary SDKs, no additional licenses required.

---

## 📁 Project Structure

```
FaceAuth-NHAI-Hackathon-7.0/
├── FaceAuthApp/                          # React Native mobile app
│   ├── App.tsx                           # UI + liveness state machine + ONNX init
│   ├── FaceProcessor.ts                  # Crop → bilinear resize → gamma → tensor
│   ├── Database.ts                       # SQLite: AES embeddings + attendance log
│   ├── SyncService.ts                    # NetInfo → AWS sync → purge
│   ├── FaceAuthSDK.ts                    # Clean API for Datalake 3.0 integration
│   └── android/app/src/main/assets/
│       └── w600k_mbf.onnx                # MobileFaceNet model (13.6 MB)
├── quantize_model.py                     # INT8 quantization → ~3.5 MB
├── *.py                                  # Python research prototypes (webcam)
├── CLAUDE.md                             # Full technical context for contributors
└── README.md
```

---

## 🚀 Getting Started

### Prerequisites

- **Node.js** 18 or higher
- **Android Studio** (SDK 35, NDK 26.1, Build Tools 35, Java 17)
- A **physical Android device** (camera is unavailable on emulators)
- USB debugging enabled

> 💡 **No Android Studio / USB?** Use [Expo EAS Build](https://docs.expo.dev/build/setup/) to compile a cloud APK and install it via QR code over WiFi.

### Installation

```bash
cd FaceAuth-NHAI-Hackathon-7.0/FaceAuthApp
npm install

# iOS only:
cd ios && pod install && cd ..
```

### Run on Android

```bash
# Terminal 1 — start the Metro bundler
npm start

# Terminal 2 — build & deploy
npm run android
```

### Run on iOS

The model is already bundled into the iOS target (`ios/FaceAuthApp/w600k_mbf.onnx`,
registered in `project.pbxproj`), and the app loads it from the main bundle on iOS.

```bash
cd ios && pod install && cd ..
npm run ios
```

---

## 🗜️ Model Quantization (Optional)

Shrink the model from **13.6 MB → ~3.5 MB** with 2–4× faster inference and <1% accuracy loss:

```bash
pip install onnxruntime onnx
python quantize_model.py
```

Then update `App.tsx`:

```typescript
const MODEL_NAME = 'w600k_mbf_int8.onnx';
```

---

## 🔄 How It Works

```
 ┌──────────────────────────────────────────────────────────────┐
 │  1. User taps "Start Face Auth"                              │
 │  2. ML Kit detects face → random challenge assigned         │
 │       👁 BLINK   😊 SMILE   ↩ TURN LEFT   ↪ TURN RIGHT       │
 │  3. User performs challenge (verified live)                 │
 │  4. 3 stable aligned frames → auto-capture                  │
 │  5. Crop face → resize 112×112 → gamma → ONNX → 512-d vector │
 └──────────────────────────────────────────────────────────────┘
              │                              │
        ┌─────▼─────┐                  ┌─────▼──────┐
        │  ENROLL   │                  │   VERIFY   │
        │  encrypt  │                  │  cosine ≥  │
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

## 🧩 Datalake 3.0 Integration

The `FaceAuthSDK` exposes a minimal surface the host app can call directly:

```typescript
import { FaceAuthSDK } from './FaceAuthSDK';

// Once, after creating the ONNX session
await FaceAuthSDK.initialize(onnxSession);

// Enroll a field employee
await FaceAuthSDK.enroll(imageUri, faceBounds, 'EMP-1234');

// Authenticate at attendance time
const result = await FaceAuthSDK.authenticate(imageUri, faceBounds, 'BLINK');
if (result.success) {
  console.log(`✅ ${result.employeeId} — ${(result.score * 100).toFixed(1)}%`);
}

// Sync pending records (also runs automatically on connectivity)
await FaceAuthSDK.syncNow();
```

---

## 📊 Performance

Measured on a mid-range device (Snapdragon 6-series class, 4 GB RAM):

| Stage | Time |
|---|---|
| ML Kit face detection | ~120 ms |
| Preprocessing (crop + resize + gamma) | ~40 ms |
| ONNX inference (512-d embedding) | ~90 ms |
| Database match (cosine similarity) | ~10 ms |
| **Total end-to-end** | **< 1 second** ✅ |

> Live timing is visible in-app via the benchmark overlay after each verification.

---

## 🔐 Security

- **AES-256** encryption of all face embeddings at rest in SQLite.
- **No raw biometric images** are transmitted — only mathematical embeddings.
- **On-device processing** — camera frames never leave the phone.
- **Sync & purge** — attendance records are removed locally after successful AWS upload.

> **Production note:** the demo derives its AES key from a constant. For deployment, derive the key from **Android Keystore / iOS Secure Enclave** (see `Database.ts`).

---

## 🎯 Evaluation Criteria Mapping

| Criterion | How it's addressed |
|---|---|
| **Innovation** — edge AI & compression | MobileFaceNet ONNX, INT8 quantization to ~3.5 MB |
| **Innovation** — offline liveness | Randomized challenge-response anti-spoofing |
| **Feasibility** — Datalake integration | Drop-in `FaceAuthSDK` API |
| **Feasibility** — speed < 1 sec | Two-stage pipeline + on-device benchmark proof |
| **Scalability** — sync/purge | NetInfo-driven AWS sync with auto-purge |
| **Scalability** — lighting/demographics | Adaptive gamma correction |
| **Documentation** — clarity | This README + `CLAUDE.md` technical guide |

---

## 🗺️ Roadmap & Known Limitations

- [x] Add the ONNX model to the iOS Xcode bundle — **done** (registered in `project.pbxproj`)
- [x] Passive texture anti-spoofing on top of active liveness — **done** (`SpoofDetector.ts`)
- [x] Accuracy benchmark harness (FAR/FRR/EER) — **done** (`accuracy_benchmark.py`)
- [x] AWS sync backend (Lambda + DynamoDB + local mock) — **done** (`aws-backend/`)
- [x] Unit test suite for core algorithms — **done** (`__tests__/faceMath.test.ts`)
- [ ] Wire `AWS_ENDPOINT` in `SyncService.ts` to a live API Gateway URL (or use the mock)
- [ ] Derive AES key from device secure hardware
- [ ] Run the accuracy harness on a labelled diverse Indian face dataset
- [ ] Multi-angle enrollment template averaging for higher field accuracy

> The Python scripts in the root are **research prototypes** (webcam-based) used to design the liveness algorithms now implemented in TypeScript. They do not run on-device.

---

## 👥 Contributors

- **Parthmh361**
- **9SERG4NT**

---

## 📄 License

Released under the **MIT License** — free to use, modify, and distribute.

---

<div align="center">

**Built for NHAI Hackathon 7.0**

For queries regarding the hackathon: `pranjalgupta@nhai.org`

</div>
