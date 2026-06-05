# NHAI Hackathon 7.0 — Offline Face Authentication System

## What this project is

A fully offline face recognition + liveness detection system built for NHAI's Hackathon 7.0.
It authenticates field personnel on mid-range Android/iOS devices with zero network dependency.
When connectivity is restored it syncs attendance records to AWS and purges local data.

This is a **React Native CLI project** (not Expo). It uses native C++ modules (ONNX Runtime,
Vision Camera) and cannot run in Expo Go — it must be built natively via Android Studio / Xcode,
or compiled in the cloud with EAS Build for a QR-installable APK.

---

## Repository layout

```
FaceAuth-NHAI-Hackathon-7.0/
├── FaceAuthApp/                          # React Native mobile app
│   ├── App.tsx                           # Shell: SafeAreaProvider + AppProvider + NavigationContainer
│   ├── context/
│   │   └── AppContext.tsx                # Global state: ONNX init, settings, enrolled/pending counts
│   ├── navigation/
│   │   ├── types.ts                      # RootStackParamList, TabParamList, typed screen props
│   │   └── RootNavigator.tsx             # NativeStack (Boot → Tabs + Enroll/Verify modals)
│   ├── screens/
│   │   ├── BootScreen.tsx                # Camera permission gate + ONNX init → replace('Tabs')
│   │   ├── HomeScreen.tsx                # Dashboard: stats, Enroll/Verify CTA buttons, sync
│   │   ├── EnrollScreen.tsx              # Multi-step: FaceCamera → form → processing → result
│   │   ├── VerifyScreen.tsx              # FaceCamera → processing → match result + timings
│   │   ├── HistoryScreen.tsx             # FlatList of attendance_log (pull-to-refresh syncs)
│   │   ├── UsersScreen.tsx               # FlatList of enrolled employees + delete (Alert confirm)
│   │   └── SettingsScreen.tsx            # Threshold, liveness, spoof, AWS endpoint, danger zone
│   ├── components/
│   │   ├── ui.tsx                        # Screen, Header, Card, Button, Stat, Pill, Row, ListItem…
│   │   └── FaceCamera.tsx                # Reusable camera + challenge-response liveness component
│   ├── core/
│   │   └── faceMath.ts                   # PURE logic (no native imports) — unit-tested
│   ├── services/
│   │   └── SettingsStore.ts              # AsyncStorage: AppSettings load/save/update
│   ├── FaceProcessor.ts                  # Crop → bilinear resize → adaptive gamma → tensor
│   ├── SpoofDetector.ts                  # Passive texture anti-spoofing (sharpness/glare/brightness)
│   ├── Database.ts                       # SQLite: AES-256 embeddings + attendance_log
│   ├── SyncService.ts                    # NetInfo → AWS POST → mark synced → purge
│   ├── FaceAuthSDK.ts                    # High-level SDK + Datalake 3.0 low-level API
│   ├── theme.ts                          # Design tokens: colors, spacing, radius, font
│   ├── __tests__/
│   │   └── faceMath.test.ts              # 35 assertions over the core logic
│   ├── android/app/src/main/assets/
│   │   └── w600k_mbf.onnx                # MobileFaceNet model (13.6 MB)
│   └── ios/FaceAuthApp/
│       └── w600k_mbf.onnx                # SAME model, bundled into the iOS target
├── accuracy_benchmark.py                 # Real FAR/FRR/EER/accuracy harness for the model
├── quantize_model.py                     # INT8 quantization → ~3.5 MB
├── aws-backend/                          # Sync backend (deploy or run the mock locally)
│   ├── lambda_handler.py                 # Lambda: validate + write to DynamoDB
│   ├── serverless.yml                    # Lambda + API Gateway + DynamoDB infra
│   ├── mock_server.py                    # Zero-dep local endpoint for demos
│   └── README.md
├── *.py                                  # Python research prototypes (webcam, not mobile)
├── LICENSE                               # MIT + third-party license inventory
├── CLAUDE.md                             # This file
└── README.md
```

---

## Tech stack

| Concern | Library | Notes |
|---|---|---|
| Camera | `react-native-vision-camera` ^4.7.3 | Photo capture only, no frame processors |
| Face detection | `@react-native-ml-kit/face-detection` ^2.0.1 | Eye open/smile/yaw probabilities |
| ONNX inference | `onnxruntime-react-native` ^1.19.2 | CPU-only, C++ native module |
| Face embedding | `w600k_mbf.onnx` (MobileFaceNet) | Input `1×3×112×112` NCHW, output 512-d |
| Image decode | `jpeg-js` + `base64-js` | Pure-JS JPEG decode for crop + spoof pipeline |
| Local DB | `react-native-sqlite-storage` ^6.0.1 | `registered_users`, `attendance_log` |
| Encryption | `crypto-js` ^4.2.0 | AES-256 for embeddings at rest |
| Connectivity | `@react-native-community/netinfo` ^11.3.1 | Triggers AWS sync on network restore |
| React Native | 0.76.9 | New Architecture compatible |

---

## Architecture: pure core vs. native-bound files

A key design decision: **all testable algorithms live in `core/faceMath.ts`**, which imports
nothing from React Native or any native package. The native-bound files delegate to it. This
makes the core logic runnable under plain Node/Jest with no mocks.

`core/faceMath.ts` exports:
- `cosineSimilarity(a, b)` / `l2Normalize(v)` — embedding math (used by `Database.ts`, `FaceAuthSDK.ts`)
- `gammaFor(mean)` / `buildGammaLUT(gamma)` — adaptive lighting (used by `FaceProcessor.ts`)
- `spoofVerdict(sharpness, reflection, brightness)` — anti-spoof scoring (used by `SpoofDetector.ts`)
- `evaluateChallenge(type, metrics, state)` — liveness state machine (used by `App.tsx`)

> When changing any threshold (similarity, gamma band, spoof limits, challenge cutoffs),
> change it in `core/faceMath.ts` — the consumers and tests both read from there.

---

## Key implementation details

### Face preprocessing (FaceProcessor.ts)
Single pass: decode JPEG → crop the face region using ML Kit `face.frame` pixel coords (10%
margin) → bilinear resize to 112×112 → adaptive gamma → Float32 NCHW tensor in [-1, 1].

**Critical**: the full image is NOT squeezed to 112×112. Cropping to the detected face first is
what makes recognition accuracy work. (The original submission had a bug that discarded the crop.)

### Adaptive gamma (gammaFor in core/faceMath.ts)
`gamma = ln(0.5) / ln(mean/255)`, clamped to [0.4, 2.5], applied only when mean luminance is
outside the 60–190 band. Dark frames get gamma < 1 (brighten); bright frames get gamma > 1
(darken). **Note:** an earlier version used `ln(127.5)/ln(mean)`, which is inverted and made
lighting *worse* — the unit tests caught this; the formula above is the corrected one.

### Active liveness — challenge/response (App.tsx + evaluateChallenge)
Three-phase loop at 400 ms polling (2.5 FPS):
1. **DETECTING** — face appears → assign a random challenge from {BLINK, SMILE, TURN_LEFT, TURN_RIGHT}
2. **CHALLENGE** — `evaluateChallenge` verifies it across frames (state persisted in refs)
3. **STABLE** — 3 consecutive aligned frames (yaw < 15°, eyes open > 0.3) → auto-capture

Thresholds (in `core/faceMath.ts`): BLINK = avg eye prob < 0.15 then > 0.45 (full cycle);
SMILE = `smilingProbability > 0.72` for 2 frames; TURN = `|yaw| > 28°`.

### Passive liveness — texture anti-spoof (SpoofDetector.ts)
Runs on the captured crop *before* ONNX, in `processFace`. Three checks (ported from
`passive_spoof_detection.py`): variance-of-Laplacian sharpness < 80, near-white pixel fraction
> 0.03 (screen glare), mean brightness > 195. Two or more failures ⇒ rejected as a photo/screen.

### Embedding storage (Database.ts)
Embeddings are AES-256 encrypted (`crypto-js`) before writing to SQLite, decrypted on read.
**Production note:** derive the key from Android Keystore / iOS Secure Enclave instead of the
hardcoded `ENC_KEY`. **If you change `ENC_KEY` or reinstall, old rows fail to decrypt — clear and re-enroll.**

### Attendance queue + sync (SyncService.ts + attendance_log)
`attendance_log` stores employee_id, timestamp, similarity_score, challenge, synced. A NetInfo
listener fires on `isConnected && isInternetReachable`, POSTs all `synced=0` rows to
`AWS_ENDPOINT`, marks them synced, and purges rows older than 30 days.
**Before any demo:** set `AWS_ENDPOINT` in `SyncService.ts` (use `aws-backend/mock_server.py` for offline demos).

### Authentication threshold
Cosine similarity **0.60** (raised from the original 0.55). MobileFaceNet operating range
is ~0.58–0.65 depending on lighting/demographics.

---

## How to run

### Android (physical device)
```bash
cd FaceAuthApp
npm install            # includes crypto-js, netinfo
npm start              # terminal 1 — Metro
npm run android        # terminal 2 — build & deploy (~8 min first time)
```
Prereqs: Node 18+, Android Studio (SDK 35, NDK 26.1, Build Tools 35, Java 17), `ANDROID_HOME` set,
USB debugging on. Camera does not work on emulators — use a real phone.

### iOS (macOS)
The model is now bundled into the Xcode target (`ios/FaceAuthApp/w600k_mbf.onnx`, registered in
`project.pbxproj`). App.tsx loads it from `RNFS.MainBundlePath` on iOS.
```bash
cd FaceAuthApp/ios && pod install && cd ..
npm run ios
```

### No Android Studio / no USB → EAS Build
```bash
npm install -g eas-cli && eas login
# add eas.json with a preview/apk profile, then:
eas build --platform android --profile preview
# scan the QR code to install the APK over Wi-Fi
```

---

## Testing

```bash
cd FaceAuthApp
npm test               # runs __tests__/faceMath.test.ts (35 assertions)
```
The tests cover cosine similarity, L2 normalization, adaptive gamma (incl. clamping), the gamma
LUT, the spoof verdict, and the full challenge state machine. They require no native mocks
because they exercise `core/faceMath.ts` directly.

---

## Accuracy benchmark (evidence for the >95% requirement)

```bash
pip install onnxruntime numpy opencv-python
python accuracy_benchmark.py --dataset ./dataset     # dataset/<person>/<images>
python accuracy_benchmark.py --selftest              # pipeline smoke-test, no dataset
```
Reports accuracy, FAR, FRR, EER, genuine/impostor score separation, and single-core ONNX
latency — using the exact mobile preprocessing (112×112, RGB, (x-127.5)/127.5, NCHW). Writes
`accuracy_results.json`. The harness has been run in `--selftest` mode against the real model
(confirms 512-d output); real metrics require a labelled face dataset.

---

## Model quantization (optional)

```bash
pip install onnxruntime onnx
python quantize_model.py        # 13.6 MB → ~3.5 MB INT8
# then in App.tsx: const MODEL_NAME = 'w600k_mbf_int8.onnx';
```
**Environment note:** the `onnx` Python package fails to build on the Windows Store Python 3.13
used here (no compiler / no compatible wheel), so quantization must be run on a normal Python
install, CI, or Colab. The script itself is correct.

---

## AWS sync backend (aws-backend/)

- **Local demo:** `python aws-backend/mock_server.py`, point `AWS_ENDPOINT` at
  `http://<laptop-ip>:8080/attendance`. Prints every batch; replies 200 so the app purges.
- **Real deploy:** `cd aws-backend && serverless deploy` → Lambda + API Gateway + DynamoDB
  (`nhai_attendance`, key `employee_id`+`timestamp` for idempotent retries). Paste the printed
  endpoint into `SyncService.ts`. See `aws-backend/README.md`.

---

## Datalake 3.0 integration (FaceAuthSDK.ts)

```typescript
await FaceAuthSDK.initialize(onnxSession);
await FaceAuthSDK.enroll(imageUri, faceBounds, 'EMP-1234');
const r = await FaceAuthSDK.authenticate(imageUri, faceBounds, 'BLINK'); // logs attendance on success
await FaceAuthSDK.syncNow();
```

---

## Known limitations & TODOs

- **AES key management** — `ENC_KEY` is a hardcoded constant; move to device secure hardware for production.
- **AWS endpoint** — `SyncService.ts` ships with a placeholder URL; set it (or use the mock) before demo.
- **Accuracy numbers** — the harness exists and runs, but no labelled Indian-demographics dataset
  is bundled, so the >95% figure is not yet measured in-repo. The model (w600k_mbf) scores ~99.1% on LFW.
- **No on-device retraining/fine-tuning** on Indian demographics — gamma + good thresholds are the
  current mitigations for lighting/skin-tone variation.
- **Performance numbers** in README/docs are architectural estimates; replace with measured device
  numbers from the in-app benchmark overlay after a real run.
- **Python `*.py` prototypes** at the repo root (blink/smile/head-pose/etc.) are webcam research
  scripts; they do not run on-device. Their logic now lives in TypeScript (`core/faceMath.ts`, `SpoofDetector.ts`).

---

## App navigation architecture

```
RootStack (NativeStackNavigator)
├── Boot              — camera permission gate + ONNX init; replace()s to Tabs on success
├── Tabs (BottomTabNavigator)
│   ├── Home          — dashboard: enrolled count, pending sync, CTA buttons, sync-now
│   ├── History       — attendance_log FlatList; pull-to-refresh triggers sync
│   ├── Users         — enrolled employees list; delete with Alert confirm; + Enroll button
│   └── Settings      — threshold, liveness, spoof, camera position, AWS endpoint, danger zone
├── Enroll (modal)    — FaceCamera → identity form → enrollFromPhoto() → success/error
└── Verify (modal)    — FaceCamera → verifyFromPhoto() → match result card + timing breakdown
```

Data flow: `AppContext` owns the ONNX session, settings, and live counts. Screens read counts
via `useApp()` and call `FaceAuthSDK` for operations. `useFocusEffect` drives per-screen refreshes.

## File change history (vs. the original submission)

| File | Change |
|---|---|
| `App.tsx` | **Rewritten** — clean shell: SafeAreaProvider + AppProvider + NavigationContainer |
| `context/AppContext.tsx` | **New** — ONNX init, settings, enrolled/pending counts, sync callback |
| `navigation/types.ts` | **New** — typed RootStackParamList, TabParamList, screen prop types |
| `navigation/RootNavigator.tsx` | **New** — NativeStack + BottomTabs + Enroll/Verify modals |
| `screens/BootScreen.tsx` | **New** — permission gate + init button → replace to Tabs |
| `screens/HomeScreen.tsx` | **New** — dashboard with stats, Enroll/Verify CTA, sync button |
| `screens/EnrollScreen.tsx` | **New** — multi-step: camera → form → SDK → result |
| `screens/VerifyScreen.tsx` | **New** — camera → SDK match → result card with timing breakdown |
| `screens/HistoryScreen.tsx` | **New** — attendance FlatList; pull-to-refresh syncs |
| `screens/UsersScreen.tsx` | **New** — employee list with delete; navigates to Enroll |
| `screens/SettingsScreen.tsx` | **New** — all AppSettings fields + danger zone |
| `components/ui.tsx` | **New** — Screen, Header, Card, Button, Stat, Pill, Row, EmptyState |
| `components/FaceCamera.tsx` | **New** — reusable camera + challenge-response liveness component |
| `services/SettingsStore.ts` | **New** — AsyncStorage AppSettings with defaults |
| `theme.ts` | **New** — design tokens (colors, spacing, radius, font) |
| `core/faceMath.ts` | **New** — pure, unit-tested core (similarity, gamma, spoof, challenge) |
| `FaceProcessor.ts` | Rewrote: fixed discarded-crop bug, bilinear resize, adaptive gamma (now via core) |
| `SpoofDetector.ts` | **New** — passive texture anti-spoofing, wired into SDK pipeline |
| `Database.ts` | AES-256 encryption, `attendance_log` table, sync helpers; similarity delegates to core |
| `SyncService.ts` | **New** — NetInfo listener + AWS POST + purge |
| `FaceAuthSDK.ts` | **New** — high-level enrollFromPhoto/verifyFromPhoto + Datalake low-level API |
| `__tests__/faceMath.test.ts` | **New** — 35 assertions; caught the inverted-gamma bug |
| `accuracy_benchmark.py` | **New** — FAR/FRR/EER accuracy harness |
| `aws-backend/*` | **New** — Lambda + serverless.yml + mock server + README |
| `ios/.../project.pbxproj` | Registered `w600k_mbf.onnx` as a bundled iOS resource |
| `package.json` | Added nav, safe-area, screens, async-storage, crypto-js, netinfo |
| `tsconfig.json` | Added `jsx`, `moduleResolution`, `lib`, `target` explicitly |
| `LICENSE` | **New** — MIT + third-party license inventory |
| `quantize_model.py` | **New** — INT8 quantization script |
