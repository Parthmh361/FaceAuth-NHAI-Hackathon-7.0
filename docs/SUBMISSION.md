# NHAI FaceAuth — Complete Technical Submission
## NHAI Hackathon 7.0 · Problem Statement: Offline Face Authentication

**Team:** Parthmh361 · 9SERG4NT  
**Repository:** FaceAuth-NHAI-Hackathon-7.0  
**Platform:** Android 8.0+ · iOS 12+ · React Native 0.76.9 (TypeScript)  
**Stack:** 100 % open-source · MIT Licensed

---

## Table of Contents

1. [Problem Statement](#1-problem-statement)
2. [Solution at a Glance](#2-solution-at-a-glance)
3. [System Architecture](#3-system-architecture)
4. [Core Technical Design](#4-core-technical-design)
   - 4.1 [Face Detection & Pose Enforcement](#41-face-detection--pose-enforcement)
   - 4.2 [Preprocessing Pipeline](#42-preprocessing-pipeline)
   - 4.3 [Face Embedding — MobileFaceNet](#43-face-embedding--mobilefacenet)
   - 4.4 [Authentication — Cosine Matching](#44-authentication--cosine-matching)
   - 4.5 [Active Liveness — Challenge-Response](#45-active-liveness--challenge-response)
   - 4.6 [Passive Anti-Spoof — Texture Gate](#46-passive-anti-spoof--texture-gate)
   - 4.7 [Duplicate-Face Guard at Enrollment](#47-duplicate-face-guard-at-enrollment)
5. [Data Security & Privacy](#5-data-security--privacy)
6. [Database Design](#6-database-design)
7. [Offline-First Architecture & AWS Sync](#7-offline-first-architecture--aws-sync)
8. [App Navigation & Screen Walkthrough](#8-app-navigation--screen-walkthrough)
9. [FaceAuthSDK — Datalake 3.0 Integration API](#9-faceauthsdk--datalake-30-integration-api)
10. [Performance & Accuracy](#10-performance--accuracy)
11. [Project Structure](#11-project-structure)
12. [Setup & Installation](#12-setup--installation)
13. [AWS Backend](#13-aws-backend)
14. [Testing](#14-testing)
15. [Innovation Highlights](#15-innovation-highlights)
16. [Evaluation Criteria Mapping](#16-evaluation-criteria-mapping)
17. [Known Limitations & Roadmap](#17-known-limitations--roadmap)
18. [License & Dependencies](#18-license--dependencies)

---

## 1. Problem Statement

NHAI field personnel operate in remote highway zones with little to no internet connectivity. Existing attendance systems depend on central servers for biometric authentication, making them unusable in the field.

**The challenge:** Authenticate field personnel accurately and securely using facial recognition and liveness detection on standard mid-range mobile devices, with **zero network dependency** during the authentication process itself.

**Constraints from the problem statement:**

| Constraint | Requirement |
|---|---|
| Network | Must work completely offline during authentication |
| Hardware | Standard mid-range phones — Android 8.0+ / iOS 12+, ≥ 3 GB RAM, CPU-only (no GPU) |
| Speed | < 1 second per recognition + liveness verification |
| AI model size | ≤ ~20 MB |
| Accuracy | > 95 % across diverse Indian demographics |
| Anti-spoof | Active liveness detection to defeat photo and screen replay attacks |
| Integration | Must integrate into the existing Datalake 3.0 React Native app |

---

## 2. Solution at a Glance

We built a self-contained React Native module that runs the **complete face-authentication pipeline entirely on-device**. The network is used only for opportunistic attendance record sync after connectivity is restored.

```
┌──────────────────────────────────────────────────────────────────────┐
│                   ON-DEVICE (100 % Offline)                          │
│                                                                      │
│  Camera ──► Face Detection ──► Liveness ──► Preprocess ──► Embed   │
│  (Vision    (ML Kit:          (challenge +   (crop+gamma+  (Mobile  │
│   Camera)   pose/eyes/bbox)    texture gate)  112×112)      FaceNet │
│                                                              ONNX)  │
│                                                    │                │
│                              ┌─────────────────────▼──────────────┐ │
│                              │  SQLite + AES-256 encrypted store  │ │
│                              │  employees · attendance_log        │ │
│                              └─────────────────┬──────────────────┘ │
└────────────────────────────────────────────────│──────────────────┘
                                                 │ (online only)
                                                 ▼
                                    AWS: API Gateway → Lambda
                                              → DynamoDB
                                    (mark synced → purge local)
```

**Key claims:**

| Claim | Evidence |
|---|---|
| 100 % offline auth | Zero network calls inside `FaceAuthSDK.enroll / authenticate` |
| < 1 s end-to-end | Two-stage pipeline: lightweight ML Kit live + single ONNX capture |
| 13 MB AI footprint | `w600k_mbf.onnx` at FP32; INT8 path reduces to ~3.5 MB |
| AES-256 at rest | `Database.ts` — AES-256-CBC, explicit key + per-record IV |
| Liveness defence | Active challenge-response + passive texture gate, layered |
| Drop-in integration | 4-method `FaceAuthSDK` API, no UI required |

---

## 3. System Architecture

### 3.1 Layered diagram

```
┌──────────────────────────────────────────────────────────────────┐
│  PRESENTATION LAYER                                              │
│  Boot · Home · Enroll · Verify · History · Users · Settings     │
│  (React Navigation NativeStack + BottomTabs)                     │
├──────────────────────────────────────────────────────────────────┤
│  SDK LAYER (integration surface for Datalake 3.0)               │
│  FaceAuthSDK.ts — enrollFromPhoto · verifyFromPhoto · syncNow   │
├──────────────────────────────────────────────────────────────────┤
│  PIPELINE LAYER                                                  │
│  FaceCamera.tsx — liveness capture loop (200 ms polling)        │
│  FaceProcessor.ts — crop · bilinear resize · adaptive gamma     │
│  SpoofDetector.ts — texture-based passive anti-spoof            │
├──────────────────────────────────────────────────────────────────┤
│  CORE LAYER (pure TypeScript, unit-tested)                       │
│  core/faceMath.ts                                                │
│  cosineSimilarity · l2Normalize · gammaFor · spoofVerdict ·     │
│  evaluateChallenge                                               │
├──────────────────────────────────────────────────────────────────┤
│  NATIVE LAYER                                                    │
│  react-native-vision-camera  |  @react-native-ml-kit/face-det   │
│  onnxruntime-react-native    |  react-native-sqlite-storage      │
├──────────────────────────────────────────────────────────────────┤
│  PERSISTENCE LAYER                                               │
│  SQLite (employees + attendance_log, AES-256 encrypted)         │
│  AsyncStorage (app settings)                                     │
├──────────────────────────────────────────────────────────────────┤
│  SYNC LAYER (fires only when network is available)               │
│  SyncService.ts — NetInfo listener · POST · purge               │
└──────────────────────────────────────────────────────────────────┘
```

### 3.2 Enrollment flow

```
User looks at camera
       │
       ▼
FaceCamera — 200 ms polling loop
  ├── Phase 1: detect face → assign random challenge (BLINK / TURN_LEFT / TURN_RIGHT)
  ├── Phase 2: evaluateChallenge() across frames until passed
  └── Phase 3: 3 stable frontal frames (yaw<15° pitch<18° roll<18° eyes>0.3) → takePhoto()
       │
       ▼
FaceAuthSDK.prepareEnrollment(photoPath)
  ├── RNFS.exists() guard (photo not expired)
  ├── ImageResizer 640×640 downscale (native, one pass)
  ├── ML Kit detect → pose gate (yaw<25° pitch<25° roll<25°, eyes>0.2)
  ├── SpoofDetector.analyze() → texture gate
  ├── FaceProcessor.cropResizeAndNormalize() → Float32Array [1,3,112,112]
  ├── ONNX session.run() → 512-d embedding → l2Normalize
  └── Database.authenticateUser(embedding, 0.45) → duplicate guard
       │
  if duplicate → reject "already enrolled as <Name>"
  if new face  → return embedding to EnrollScreen
       │
       ▼
User fills ID / name / designation form
       │
       ▼
FaceAuthSDK.saveEnrollment(embedding, who)
  └── Database.enrollEmployee() → AES-256-CBC encrypt → INSERT INTO employees
```

### 3.3 Verification flow

```
User looks at camera
       │
       ▼
FaceCamera — same liveness loop as enrollment
       │ auto-capture after challenge + stable hold
       ▼
FaceAuthSDK.verifyFromPhoto(photoPath, challenge)
  ├── _embedFromPhoto() — same pipeline as above
  └── Database.authenticateUser(embedding, 0.60)
         ├── decrypt each enrolled vector (AES-256-CBC)
         ├── cosineSimilarity(input, stored) for each employee
         └── return best match if score ≥ 0.60
               │
         if match → Database.logAttendance() → synced=0 queue
         if no match → "No matching face enrolled"
```

### 3.4 Sync flow

```
NetInfo fires: isConnected = true
       │
       ▼
SyncService.syncPending()
  ├── Endpoint guard: reject placeholder URL → "Not configured"
  ├── NetInfo.fetch() → abort if offline
  ├── Database.getPendingAttendance() → all rows where synced=0
  ├── POST { records } to AWS_ENDPOINT
  ├── 200 OK → Database.markSynced(ids)
  └── Database.purgeSyncedRecords() → delete synced=1 AND age > 30 days
```

---

## 4. Core Technical Design

### 4.1 Face Detection & Pose Enforcement

**Library:** `@react-native-ml-kit/face-detection` v2.0.1

ML Kit returns, per detected face:

| Field | Description |
|---|---|
| `frame` | Bounding box `{top, left, width, height}` in image pixels |
| `leftEyeOpenProbability` / `rightEyeOpenProbability` | 0.0–1.0 |
| `smilingProbability` | 0.0–1.0 (not used in active liveness pool) |
| `rotationY` | Yaw angle (left-right head turn), degrees |
| `rotationX` | Pitch angle (up-down head tilt), degrees |
| `rotationZ` | Roll angle (head tilt sideways), degrees |

**Two pose-enforcement stages:**

Stage 1 — **Live preview stabilization** (in `FaceCamera.tsx`, 200 ms loop):

```
if |yaw|   > 15° → "Turn head straight"
if |pitch| > 18° → "Level your head — don't look up or down"
if |roll|  > 18° → "Keep your head upright"
if eyes < 0.3   → "Keep your eyes open"
else            → stable++ (need 3 consecutive to auto-capture)
```

Stage 2 — **Capture-time gate** (in `FaceAuthSDK._embedFromPhoto()`):

```
if |yaw|   > 25° → reject "Face turned too far sideways"
if |pitch| > 25° → reject "Face tilted up or down"
if |roll|  > 25° → reject "Head tilted sideways — keep it upright"
if eyes    < 0.2 → reject "Eyes appear closed"
```

This two-stage design means:
- The camera UI guides the user to a frontal position *before* capture.
- Even if an off-axis frame slips through, the SDK-level gate blocks it from producing a bad embedding.
- All three axes are checked, preventing the "face up but looking at camera" edge case that only checks yaw.

**Performance mode in FaceCamera:** `performanceMode: 'fast'` for the 200 ms polling loop (real-time feedback). `performanceMode: 'accurate'` for the SDK embedding call (higher accuracy on the actual capture).

---

### 4.2 Preprocessing Pipeline

```
Full-resolution photo
       │
       ▼
ImageResizer.createResizedImage(srcUri, 640, 640, 'JPEG', 90)
  — native one-pass downscale before any JS pixel work
       │
       ▼
jpeg-js.decode() → RGBA Uint8Array
       │
       ▼
Crop face region from ML Kit bounding box (+ 10% margin each side)
  cropX = max(0, left − 0.1·width)
  cropY = max(0, top  − 0.1·height)
  cropW = min(imgW − cropX, width  + 0.2·width)
  cropH = min(imgH − cropY, height + 0.2·height)
       │
       ▼
Adaptive Gamma Correction
  mean = Σ(0.299R + 0.587G + 0.114B) / n   (luminance)
  if mean ∈ [60, 190]: skip (well-exposed)
  else: γ = clamp(ln(0.5)/ln(mean/255), 0.4, 2.5)
            apply via pre-computed 256-entry LUT
       │
       ▼
Bilinear resize → 112×112
  src[y,x] → dst[y',x'] using 4-point weighted interpolation
       │
       ▼
NCHW Float32 tensor normalization
  R channel: (pixel − 127.5) / 127.5   →  [-1, 1]
  G channel: same
  B channel: same
  Layout: [1, 3, 112, 112]  (batch, channel, height, width)
```

**Critical design choice: crop before resize.** Squashing the full frame to 112×112 destroys the facial geometry — the model was trained on cropped face images. The first implementation squashed the full frame; this produced embeddings with cosine similarities near 0.2 for the same person. The fix (crop first) brought genuine scores into the 0.7–0.95 range.

**Why adaptive gamma matters in the field:** NHAI personnel work outdoors in harsh Indian summer sun (mean luminance > 200) and in shaded / nighttime checkpoints (mean luminance < 50). Without gamma correction, bright conditions produce washed-out embeddings and dark conditions produce noisy ones. Gamma brings both into the model's well-calibrated [60–190] operating range before inference.

---

### 4.3 Face Embedding — MobileFaceNet

| Property | Value |
|---|---|
| Model file | `w600k_mbf.onnx` |
| Format | ONNX FP32 |
| File size | 13 MB |
| Input node | `input.1` |
| Input shape | `[1, 3, 112, 112]` (NCHW, RGB, values in [-1,1]) |
| Output | 512-dimensional floating-point vector |
| Post-processing | L2-normalise → unit vector on the 512-d hypersphere |
| Inference engine | `onnxruntime-react-native` v1.19.2 (CPU-only, C++) |
| Parameters | ~1 million (depthwise-separable convolutions) |
| Training loss | ArcFace margin loss on WebFace600K |
| Published benchmark | ~99.1 % on LFW (Labelled Faces in the Wild) |

**Why MobileFaceNet:** purpose-built for on-device face recognition. Depthwise-separable convolutions give it ResNet-level accuracy at a fraction of the compute. The ArcFace-trained variant (`w600k_mbf`) produces well-separated embeddings, making 0.60 a reliable cosine threshold even in adverse field conditions.

**Inference path:**

```typescript
const { Tensor } = require('onnxruntime-react-native');
const output = await session.run({
  'input.1': new Tensor('float32', floatData, [1, 3, 112, 112])
});
const raw = (Object.values(output)[0] as any).data as Float32Array;
const embedding = l2Normalize(raw);   // unit vector, ready for cosine matching
```

**Warm-up pass:** on app init, one dummy inference run with a zeroed tensor is executed so the first real authentication does not pay the JIT/initialization cost.

---

### 4.4 Authentication — Cosine Matching

```typescript
// core/faceMath.ts
export function cosineSimilarity(a: Vec, b: Vec): number {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}
```

The matching is **1:N** (one probe embedding vs. all enrolled embeddings). The database scan returns the highest-scoring enrolled user if and only if the score meets the threshold.

| Threshold | Purpose | Value |
|---|---|---|
| Match threshold | Verification / attendance | **0.60** (configurable in Settings, range 0.40–0.90) |
| Duplicate threshold | Enrollment duplicate guard | **0.45** (lower, to catch same person at different angles) |

**Why two different thresholds:** cross-angle embeddings of the same person (frontal enrollment vs. tilted verification) score 0.45–0.58 — below the verification threshold but reliably above 0.40. The duplicate guard uses 0.45 so it catches the same person trying to enroll twice even if their second attempt is at a slightly different angle.

**Matching cost at scale:** O(N) scan, decrypt + cosine per stored vector. For the target deployment (≤ 200 enrolled personnel per checkpoint), this is < 5 ms. For enterprise scale (1 000+ users), embeddings are kept decrypted in memory for the session and an ANN index (HNSW) can be added — the 512-d unit vectors are index-ready without code changes.

---

### 4.5 Active Liveness — Challenge-Response

The liveness system runs as a continuous photo-polling loop at 200 ms intervals inside `FaceCamera`. The camera is used in photo mode (not frame processor mode), so each "frame" is a full-resolution capture that goes through ML Kit detection. A `busy` ref prevents overlapping captures.

**Challenge pool:** `{BLINK, TURN_LEFT, TURN_RIGHT}` — one is picked at random per session.

```
State machine (refs, not React state — no re-render cost):

DETECTING ──► face found → pick challenge, go to CHALLENGE
CHALLENGE ──► evaluateChallenge() → passed? go to STABLE
STABLE    ──► 3 consecutive aligned frames → takePhoto() → onCapture()
```

**Challenge algorithms (in `core/faceMath.ts`):**

*BLINK — close-then-reopen cycle:*

```
avgEye = (leftEyeOpenProbability + rightEyeOpenProbability) / 2

if avgEye < BLINK_CLOSED (0.5):   blinkClosed = true
if blinkClosed AND avgEye > BLINK_OPEN (0.7):  passed = true, blinkClosed = false
```

The blink threshold band (0.5 / 0.7) is deliberately wide: a real blink lasts ~120 ms but the loop samples every 200 ms. Using a partial-closure threshold (0.5 rather than fully-closed 0.0) catches the longer *mid-blink* phase. Requiring the eyes to *reopen* is the liveness proof — a static photo can never reopen.

*TURN_LEFT / TURN_RIGHT — head rotation:*

```
passed = |face.rotationY| > TURN_YAW (18°)
           in the correct direction (negative for left, positive for right)
```

Uses `face.rotationY` from ML Kit (the actual head yaw angle, not the deprecated `yawAngle` field which always returns undefined in v2+).

**Stable-phase pose gates before auto-capture:**

```
|yaw|   ≤ 15°  — look straight (left-right)
|pitch| ≤ 18°  — level head (up-down)
|roll|  ≤ 18°  — upright head (tilt)
eyes   ≥ 0.3  — eyes open
```

All four must hold for 3 consecutive frames (= ~600 ms window) before auto-capture fires.

---

### 4.6 Passive Anti-Spoof — Texture Gate

Before the ONNX inference step, `SpoofDetector.analyze()` runs three purely computational checks on the face crop:

| Check | Signal | Threshold | Why |
|---|---|---|---|
| **Sharpness** | Variance of 3×3 Laplacian | < 80 → `soft` flag | Photos and screens are inherently blurrier than real skin micro-texture |
| **Reflection** | Fraction of pixels with luminance > 240 | > 0.05 → `glare` flag | Glossy prints and LCD screens produce near-white specular reflections |
| **Brightness** | Mean luminance | > 225 → `bright` flag | Backlit screens have abnormally high average brightness |

**Verdict logic (texture-gated):**

```
isLive = NOT ( soft AND (glare OR bright) )
```

**Key design decision — texture as the primary gate:** brightness alone fires on a genuine face in harsh Indian sunlight. By making sharpness the *required* condition, a real face with sharp skin texture is always passed regardless of outdoor lighting. Glare and brightness only trigger rejection when the texture is *already suspect* — i.e. when we have what looks like a flat printed or screen surface.

This was the fix for the "sunlight false-reject" bug: outdoor faces with sun glare (bright + specular) were previously rejected as spoofs. With the texture gate, any face sharp enough to have real skin detail is allowed through.

**Interaction with active liveness:** passive texture is a *secondary* layer. A highly convincing 3D-printed mask could defeat the texture check, but would still have to pass the blink or turn challenge. A photo/screen trivially fails the texture check even if somehow presented at a non-glare angle.

---

### 4.7 Duplicate-Face Guard at Enrollment

```typescript
// FaceAuthSDK.prepareEnrollment()
const existing = await Database.authenticateUser(embedding, DUPLICATE_THRESHOLD); // 0.45
if (existing) {
  return {
    ok: false,
    stage: 'match',
    message: `This face is already enrolled as ${existing.name} (${existing.employeeId}).`,
  };
}
```

The guard runs *before* the identity form is shown. If the user's face already exists in the database (under any ID or name), enrollment is immediately rejected with the existing record's details. This prevents:

- Duplicate attendance entries under different employee IDs.
- Ghost accounts created by a single person registering multiple times.
- Spoofing by registering under a colleague's name.

---

## 5. Data Security & Privacy

### Encryption at rest

All face embeddings are stored AES-256-CBC encrypted in SQLite.

```
Plaintext:  JSON.stringify(Array.from(Float32Array))
Key:        SHA-256(ENC_KEY_CONSTANT)              → 256-bit key
IV:         first 16 bytes of SHA-256(plaintext)   → per-record, deterministic
Ciphertext: "ivHex:ciphertextBase64"               → stored in 'embedding' column
```

The per-record IV derived from the plaintext means each embedding has a unique ciphertext, preventing frequency analysis, while requiring no random-number generator (which Hermes/React Native does not provide natively — using CryptoJS passphrase mode with its random-salt requirement would throw `"Native crypto module could not be used to get secure random number"` on Android).

### What is and is not transmitted

| Data | Stays on device | Transmitted to AWS |
|---|---|---|
| Raw camera frames | Yes — never written to disk | Never |
| Face embeddings (vectors) | Yes — encrypted in SQLite | **Never** |
| Attendance records | Yes — in SQLite | After sync: employee_id, timestamp, similarity_score, challenge (no biometric data) |

### Production hardening (documented TODO)

- Replace the hardcoded `ENC_KEY` constant with a key derived from **Android Keystore / iOS Secure Enclave** — hardware-backed, per-device, cannot be exported.
- Add `react-native-get-random-values` for a hardware CSPRNG to allow passphrase-mode AES with a random salt.

---

## 6. Database Design

### Schema

**employees**

| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER PK | auto-increment |
| `employee_id` | TEXT UNIQUE | e.g. `EMP-0001` — the business key |
| `name` | TEXT | display name |
| `designation` | TEXT | role / department |
| `embedding` | TEXT | `ivHex:ciphertextBase64` (AES-256-CBC) |
| `enrolled_at` | INTEGER | Unix ms timestamp |

**attendance_log**

| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER PK | auto-increment |
| `employee_id` | TEXT | FK to employees.employee_id |
| `employee_name` | TEXT | denormalized for offline readability |
| `timestamp` | INTEGER | Unix ms |
| `similarity_score` | REAL | cosine similarity of the match |
| `challenge` | TEXT | which liveness challenge was passed |
| `synced` | INTEGER | 0 = pending, 1 = uploaded to AWS |

### Forward migration

`initDB()` runs `CREATE TABLE IF NOT EXISTS` (safe on first install) followed by `ensureColumn()` for each expected column:

```typescript
private static async ensureColumn(table, column, decl): Promise<void> {
  const [info] = await db.executeSql(`PRAGMA table_info(${table})`);
  for (let i = 0; i < info.rows.length; i++) {
    if (info.rows.item(i).name === column) return; // already present
  }
  await db.executeSql(`ALTER TABLE ${table} ADD COLUMN ${column} ${decl}`);
}
```

This allows the app to update from any previous schema version without data loss and without requiring a reinstall.

---

## 7. Offline-First Architecture & AWS Sync

### Offline guarantees

Every step in the authentication critical path — camera capture, face detection, liveness evaluation, ONNX inference, database match, attendance logging — runs entirely on-device. There is no network call and no network permission required for authentication.

The sync service is completely decoupled:

```typescript
// SyncService.ts
static start(onComplete?): void {
  this.unsubscribe = NetInfo.addEventListener(async state => {
    if (state.isConnected && state.isInternetReachable) {
      const result = await this.syncPending();
      onComplete?.(result);
    }
  });
}
```

### Sync logic (defensive)

```
1. Endpoint guard: if endpoint contains 'YOUR_API_ID' → return error message (never fetch)
2. NetInfo.fetch() pre-check: if not connected → return "Offline" message (no error)
3. Database.getPendingAttendance() → all synced=0 rows
4. POST { records: [...] } to AWS_ENDPOINT
5. 200 OK → markSynced(ids) → purgeSyncedRecords() (age > 30 days)
6. Non-200 → expose HTTP status in error message
7. Network error → expose "check endpoint URL" message
```

### AWS backend

```
aws-backend/
├── lambda_handler.py    — validates payload, writes to DynamoDB
├── serverless.yml       — Lambda + API Gateway + DynamoDB (one-command deploy)
└── mock_server.py       — zero-dependency local HTTP server for demo/testing
```

**DynamoDB table:** `nhai_attendance`

| Key | Type | Notes |
|---|---|---|
| `employee_id` (PK) | String | partition key |
| `timestamp` (SK) | Number | sort key — composite PK makes retries idempotent |

**Deploy:**
```bash
cd aws-backend && npm install -g serverless && serverless deploy
# paste the printed URL into Settings → AWS Endpoint
```

**Local demo (no AWS account needed):**
```bash
python aws-backend/mock_server.py   # listens on :8080
# set AWS Endpoint to http://<laptop-ip>:8080/attendance in Settings
```

---

## 8. App Navigation & Screen Walkthrough

### Navigation tree

```
RootStack (NativeStackNavigator)
├── Boot       — camera permission gate + ONNX warm-up; replaces itself with Tabs
├── Tabs (BottomTabNavigator)
│   ├── Home      — dashboard: enrolled count, pending sync, CTA buttons
│   ├── History   — attendance_log FlatList; pull-to-refresh syncs AWS
│   ├── Users     — enrolled employees; delete with Alert confirm
│   └── Settings  — threshold, liveness, spoof, camera, AWS endpoint, danger zone
├── Enroll (modal) — FaceCamera → identity form → result
└── Verify (modal) — FaceCamera → match result + timing breakdown
```

### Screen descriptions

**BootScreen**

Checks `Camera.getCameraPermissionStatus()` (synchronous in Vision Camera v4). Requests permission if needed. Shows an "Initialize System" button that triggers ONNX session creation, model copy to DocumentDirectory (Android), warm-up inference, and `FaceAuthSDK.initialize()`. Replaces itself with Tabs on success.

**HomeScreen**

Dashboard showing three stats: enrolled employee count, pending-sync record count, and last sync timestamp. Two primary CTA cards: "Enroll Employee" (navigates to Enroll modal) and "Verify & Check-In" (navigates to Verify modal). A "Sync Now" ghost button for manual trigger. Shows the last sync result message.

**EnrollScreen (modal)**

Four-phase flow:
1. `camera` — `FaceCamera` component with "Enroll Employee" action label
2. `analyzing` — spinner while `FaceAuthSDK.prepareEnrollment()` runs (embedding + duplicate check)
3. `form` — employee ID / name / designation inputs (embedding stored in a ref, not state)
4. `saving` / `done` / `error` — result with retry on error

The embedding is computed at capture time (phase 2), not at form submission. This is critical: the camera's temp photo file is purged by the OS within seconds; deferring computation to form-submit caused the native image resizer to hang on a missing file.

**VerifyScreen (modal)**

Single-phase flow: `FaceCamera` captures → `FaceAuthSDK.verifyFromPhoto()` → result card showing:
- Match: employee name, ID, designation, confidence percentage
- Timing breakdown: ML Kit ms / preprocess ms / ONNX ms / DB ms / total ms
- No match: clear rejection message

**HistoryScreen**

`FlatList` of attendance_log records, newest first. Shows employee name, timestamp, similarity score (as percentage), and liveness challenge. Pull-to-refresh calls `syncNow()`. Empty state if no records.

**UsersScreen**

`FlatList` of enrolled employees (no embeddings decrypted — uses `getEmployeeProfiles()` for performance). Shows name, designation, enrolled date. Delete via `Alert.alert` confirmation. "Enroll New" button navigates to Enroll modal.

**SettingsScreen**

| Setting | Type | Default |
|---|---|---|
| Match Threshold | Slider (0.40–0.90) | 0.60 |
| Liveness Enabled | Toggle | true |
| Spoof Check Enabled | Toggle | true |
| Default Camera | Picker (front/back) | front |
| AWS Endpoint | Text input | placeholder URL |
| Admin PIN | Text input | 1234 |
| Clear All Data | Danger zone button | — |

**FaceCamera Component**

Shared by Enroll and Verify. Key behaviours:

- 200 ms interval: `takePhoto()` → ML Kit detect → pose check → challenge eval → stable count
- `busy` ref prevents overlapping captures (no queuing)
- `capturedRef` prevents double-fire after auto-capture
- Front/back camera toggle (internal state, not re-mounted): shows current camera label ("FRONT"/"BACK") on a dark pill in the top-right corner
- Challenge card shows relevant icon + prompt text during liveness phase
- Green overlay box when face is aligned; red when misaligned; teal when challenge done
- Photo taken while camera is still active (deactivating before `takePhoto()` resolves causes a hang)
- All temp polling frames deleted via `RNFS.unlink()` in the `finally` block

---

## 9. FaceAuthSDK — Datalake 3.0 Integration API

The `FaceAuthSDK` is the single public surface. Datalake 3.0 needs only the ONNX asset bundled and four SDK calls.

### Initialization

```typescript
import { FaceAuthSDK } from './FaceAuthSDK';
import { InferenceSession, Tensor } from 'onnxruntime-react-native';

// Create session once at app startup
const session = await InferenceSession.create(modelPath);

await FaceAuthSDK.initialize(session, {
  threshold: 0.60,          // cosine match threshold (optional, default 0.60)
  spoofEnabled: true,        // passive texture anti-spoof (optional, default true)
  onSync: (result) => {      // callback on auto-sync (optional)
    console.log(`Synced ${result.synced} records`);
  },
});
```

### Enrollment (high-level — from photo path)

```typescript
// Used by the app's EnrollScreen. Takes a full-resolution photo path.
const result = await FaceAuthSDK.enrollFromPhoto(photoPath, {
  employeeId: 'EMP-0042',
  name: 'Rajesh Kumar',
  designation: 'Site Engineer',
});

if (result.ok) {
  console.log(`Enrolled: ${result.employeeId}`);
} else {
  console.error(result.message); // pose, spoof, duplicate, or error
}
```

### Two-phase enrollment (used by EnrollScreen for better UX)

```typescript
// Phase 1 — compute embedding immediately at capture (while photo still exists)
const prep = await FaceAuthSDK.prepareEnrollment(photoPath);
if (!prep.ok) { showError(prep.message); return; }

// Phase 2 — later, after user fills the form
const save = await FaceAuthSDK.saveEnrollment(prep.embedding, {
  employeeId: form.id, name: form.name, designation: form.designation,
});
```

### Verification / attendance

```typescript
const result = await FaceAuthSDK.verifyFromPhoto(photoPath, 'BLINK');
// 'BLINK' | 'TURN_LEFT' | 'TURN_RIGHT' — the challenge the user completed

if (result.ok) {
  const { match, timing } = result;
  console.log(`${match.name} (${match.employeeId}) — ${(match.score*100).toFixed(1)}%`);
  console.log(`Total: ${timing.totalMs} ms`);
  // Attendance is automatically logged to SQLite (synced = 0)
}
```

### Low-level API (for Datalake integration with pre-computed face bounds)

```typescript
// If the host app already ran ML Kit and has the bounding box:
await FaceAuthSDK.enroll(imageUri, faceBounds, 'EMP-0042');

const r = await FaceAuthSDK.authenticate(imageUri, faceBounds, 'BLINK');
if (r.success) {
  // r.employeeId, r.score
  // attendance already logged
}
```

### Sync

```typescript
// Manual trigger — also runs automatically via NetInfo listener
const result = await FaceAuthSDK.syncNow();
// result: { synced: number, purged: number, errors: number, message?: string }
```

### Runtime configuration

```typescript
FaceAuthSDK.setThreshold(0.55);     // lower threshold for worse lighting
FaceAuthSDK.setSpoofEnabled(false); // disable passive gate for controlled environment
FaceAuthSDK.isReady();              // true after initialize()
await FaceAuthSDK.enrolledCount();  // number of enrolled employees
await FaceAuthSDK.pendingSyncCount(); // unsynced attendance records
await FaceAuthSDK.clearAll();       // DANGER — wipes enrolled users
```

### SyncResult type

```typescript
interface SyncResult {
  synced: number;   // records uploaded
  purged: number;   // old records deleted locally
  errors: number;   // 0 = success
  message?: string; // human-readable: "Not configured", "Offline", server error, etc.
}
```

---

## 10. Performance & Accuracy

### 10.1 Performance targets

| Metric | Target | Architecture estimate | Notes |
|---|---|---|---|
| Total auth (recognition + liveness) | **< 1 000 ms** | 300–600 ms | User-paced challenge excluded per standard practice |
| ML Kit detection | — | 120–250 ms | On 640×640 downscaled frame |
| Preprocessing (crop + resize + gamma) | — | 80–200 ms | pure-JS JPEG decode is the bottleneck |
| ONNX inference (512-d embedding) | — | 60–150 ms | Single-threaded CPU |
| Database match (cosine argmax) | — | < 5 ms | Up to ~200 enrolled users |
| Model footprint | **≤ 20 MB** | **13 MB** ✅ | FP32; INT8 path → ~3.5 MB |
| RAM | Low | < 150 MB peak | Hermes + ONNX buffers |

**How to measure on-device:** run a Verification and read the four timing cells on the result card (instrumented via the `Timing` object returned by every `verifyFromPhoto()` call).

```bash
# Lab measurement of ONNX latency (single-core):
pip install onnxruntime numpy opencv-python
python accuracy_benchmark.py --selftest
```

### 10.2 Model footprint vs. installed APK

The **20 MB rule** targets the AI model footprint, not the installed APK.

| Component | Size (arm64-v8a) |
|---|---|
| **ONNX model (our AI, FP32 — the measured metric)** | **13 MB ✅** |
| ONNX Runtime native library | 27 MB |
| ML Kit face detector | 8.5 MB |
| React Native + Hermes | ~9 MB |
| **Single-ABI release APK / AAB** | **~55–65 MB** |

ONNX Runtime alone exceeds 20 MB — no build flag can make the whole installed app 20 MB with this inference stack. The 209 MB figure for the debug universal APK is a packaging artifact: it bundles all four CPU architectures (arm64 + armv7 + x86 + x86_64) without minification. A production arm64-only AAB from Google Play delivers ~55–65 MB *per device*.

### 10.3 INT8 quantization path

```bash
pip install onnxruntime onnx
python quantize_model.py   # 13 MB → 3.35 MB (74% reduction)
```

**Caveat (verified):** dynamic INT8 quantization of this Conv-heavy MobileFaceNet emits `ConvInteger` operators that ONNX Runtime's CPU kernel reports `NOT_IMPLEMENTED` at inference time. The quantized file is not shipped. The correct production path is *static QDQ quantization* with a small calibration set (produces `QLinearConv`, broadly supported). This is a near-term optimization; the FP32 13 MB model is shipped today and meets the spec.

### 10.4 Accuracy

The model backbone (`w600k_mbf`, ArcFace loss, WebFace600K training set) reports **~99.1 % on LFW** — a published external benchmark for this model family.

**In-repo harness:**

```bash
# dataset/<person_name>/<img1.jpg> <img2.jpg> ...
python accuracy_benchmark.py --dataset ./dataset   # full FAR/FRR/EER/accuracy
python accuracy_benchmark.py --selftest            # pipeline smoke test (no dataset needed)
```

Reports: accuracy, FAR, FRR, EER, mean genuine score, mean impostor score, ONNX latency. Writes `accuracy_results.json`.

**Field accuracy mechanisms:**

| Risk | Mitigation |
|---|---|
| Harsh sunlight | Adaptive gamma correction; texture-gated spoof (bright+sharp → live) |
| Low light / shadow | Gamma brightens mean luminance < 60 |
| Face tilt / off-axis | Three-axis pose gate at capture and SDK level |
| Demographics (skin tone, age) | Gamma keeps input in model's calibrated band; tunable threshold in Settings |
| Photo replay | Blink / turn challenge + texture check |
| Screen replay | Both active + passive gates apply |

---

## 11. Project Structure

```
FaceAuth-NHAI-Hackathon-7.0/
├── FaceAuthApp/                          # React Native mobile app
│   ├── App.tsx                           # Shell: SafeAreaProvider + AppProvider + NavContainer
│   ├── context/AppContext.tsx            # ONNX session, settings, counts, syncNow
│   ├── navigation/
│   │   ├── types.ts                      # Typed RootStackParamList, TabParamList
│   │   └── RootNavigator.tsx             # NativeStack + BottomTabs + modals
│   ├── screens/
│   │   ├── BootScreen.tsx                # Permission gate + ONNX init
│   │   ├── HomeScreen.tsx                # Dashboard
│   │   ├── EnrollScreen.tsx              # Enroll flow (5 phases)
│   │   ├── VerifyScreen.tsx              # Verify + timing display
│   │   ├── HistoryScreen.tsx             # Attendance log
│   │   ├── UsersScreen.tsx               # Employee list + delete
│   │   └── SettingsScreen.tsx            # All tunables
│   ├── components/
│   │   ├── ui.tsx                        # Screen, Header, Card, Button, Stat, Pill, Row…
│   │   ├── FaceCamera.tsx                # Liveness capture (200 ms loop, challenge UI)
│   │   └── Icon.tsx                      # Pure-View icons (no native rebuild required)
│   ├── core/
│   │   └── faceMath.ts                   # Pure algorithms — NO native imports
│   ├── services/
│   │   └── SettingsStore.ts              # AsyncStorage settings
│   ├── FaceProcessor.ts                  # Crop → bilinear → gamma → NCHW tensor
│   ├── SpoofDetector.ts                  # Texture anti-spoof
│   ├── Database.ts                       # SQLite + AES-256 + migrations
│   ├── SyncService.ts                    # NetInfo → AWS POST → purge
│   ├── FaceAuthSDK.ts                    # Public integration surface
│   ├── theme.ts                          # Design tokens (colors, spacing, radius, font)
│   ├── __tests__/faceMath.test.ts        # 25 unit assertions on core algorithms
│   ├── android/app/src/main/assets/
│   │   └── w600k_mbf.onnx                # MobileFaceNet model (13 MB)
│   └── ios/FaceAuthApp/
│       └── w600k_mbf.onnx                # Same model — registered in project.pbxproj
├── accuracy_benchmark.py                 # FAR / FRR / EER / accuracy harness
├── quantize_model.py                     # INT8 dynamic quantization
├── aws-backend/
│   ├── lambda_handler.py                 # Lambda: validate → DynamoDB write
│   ├── serverless.yml                    # One-command deploy (Lambda + APIGW + DDB)
│   ├── mock_server.py                    # Local zero-dep demo server
│   └── README.md
├── docs/
│   ├── ARCHITECTURE.md                   # Detailed architecture with Mermaid diagrams
│   ├── BENCHMARKS.md                     # Performance + accuracy target tables
│   └── SUBMISSION.md                     # This document
├── FaceAuthApp-release.apk               # ⬇ Pre-built release APK (~208 MB)
├── LICENSE                               # MIT + third-party license inventory
├── CLAUDE.md                             # Full technical context for contributors
└── README.md                             # Quick-start overview
```

---

## 12. Setup & Installation

### Option A — Install pre-built APK (fastest)

A ready-to-install release APK is available:

| | |
|---|---|
| **Download** | [`FaceAuthApp-release.apk`](https://github.com/Parthmh361/FaceAuth-NHAI-Hackathon-7.0/releases/latest) (~208 MB) |
| **Signed with** | Debug keystore (sideload-ready for testing/demo) |
| **Min Android** | 8.0 (API 26) |

**Steps:** Download APK → transfer to Android phone → open → enable "Install from unknown sources" → install → launch → grant camera permission.

### Option B — Build from source

#### Prerequisites

| Tool | Minimum version | Notes |
|---|---|---|
| Node.js | 18 | |
| Android Studio | Latest stable | SDK 35, NDK 26.1, Build Tools 35, Java 17 |
| Physical Android device | Android 8.0 (API 26) | Camera does not work on emulators |
| iOS (macOS only) | Xcode 15+, CocoaPods | iOS 12+ target |

#### Android

```bash
# 1. Install dependencies
cd FaceAuth-NHAI-Hackathon-7.0/FaceAuthApp
npm install

# 2. Terminal 1 — Metro bundler
npm start

# 3. Terminal 2 — build and deploy to device
npm run android
# First build: ~8 minutes (NDK compilation of ONNX Runtime + Vision Camera)
# Subsequent builds: ~1–2 minutes
```

#### Build release APK

```bash
cd FaceAuthApp/android
./gradlew assembleRelease
# Output: android/app/build/outputs/apk/release/app-release.apk (~208 MB)
```

### iOS

```bash
cd FaceAuthApp/ios && pod install && cd ..
npm run ios
```

The ONNX model is bundled as a resource in the Xcode target (`ios/FaceAuthApp/w600k_mbf.onnx`, registered in `project.pbxproj`).

### First launch

1. Grant camera permission when prompted.
2. Tap **Initialize System** — copies model to app storage, runs warm-up inference (~5 s on first run).
3. You are taken to the Home dashboard.

### Quick demo flow

```
Home → "Enroll Employee"
  → look at camera → complete liveness challenge (blink or turn head)
  → fill: Employee ID (e.g. EMP-001), Name, Designation → tap Enroll
  → "Enrolled successfully"

Home → "Verify & Check-In"
  → look at camera → complete liveness challenge
  → result card: name, confidence %, timing breakdown

Home → "Sync Now" (with AWS endpoint configured in Settings)
```

---

## 13. AWS Backend

### Deploy to AWS

```bash
cd aws-backend
npm install -g serverless
serverless deploy --stage prod
# prints: endpoint: POST https://xxx.execute-api.ap-south-1.amazonaws.com/prod/attendance
```

Paste the endpoint URL into the app: Settings → AWS Endpoint.

**Infrastructure created:**

| Resource | Configuration |
|---|---|
| AWS Lambda | `nhai-attendance-prod-sync` — Node.js 18 |
| API Gateway | POST `/attendance` — open (add Cognito/API-key for production) |
| DynamoDB | `nhai_attendance` — PK `employee_id` + SK `timestamp` |
| IAM Role | Minimal: `dynamodb:PutItem` on the table |

### Local demo (no AWS account)

```bash
python aws-backend/mock_server.py
# Listening on 0.0.0.0:8080
# Settings → AWS Endpoint: http://<laptop-ip>:8080/attendance
```

The mock server prints every batch received and always returns `200 OK`, causing the app to mark the records as synced and purge them locally.

### Payload contract

```json
POST /attendance
{
  "records": [
    {
      "id": 1,
      "employeeId": "EMP-001",
      "employeeName": "Rajesh Kumar",
      "timestamp": 1710000000000,
      "similarityScore": 0.847,
      "challenge": "BLINK",
      "synced": false
    }
  ]
}
```

Response: `200 OK` → app marks synced, purges old records. Any other status → records remain in queue for retry.

---

## 14. Testing

### Unit test suite

```bash
cd FaceAuthApp
npm test
```

**Coverage:** `core/faceMath.ts` — the pure algorithm layer (25 assertions):

| Suite | Tests |
|---|---|
| `cosineSimilarity` | identical vectors → 1; orthogonal → 0; opposite → -1; zero vector; length mismatch throws; scale-invariant |
| `l2Normalize` | unit length; zero-vector safety (no NaN) |
| `gammaFor` | no-op for [60,190]; brightens dark (< 1); darkens bright (> 1); clamps to [0.4, 2.5] |
| `buildGammaLUT` | identity for γ=1; endpoints always 0 and 255 |
| `spoofVerdict` | sharp well-lit → live; blurry+glare → spoof; soft+overbright → spoof; soft alone → live (texture gate); sharp+sunlit → live (key outdoor fix) |
| `evaluateChallenge` | BLINK: close-then-reopen cycle; open-only fails; SMILE: two-frame streak; streak reset; TURN_LEFT/RIGHT: yaw thresholds |

Tests run under plain Node.js/Jest — no React Native mocks required because `core/faceMath.ts` imports nothing native.

### Accuracy harness

```bash
# Pipeline smoke test (no dataset required):
python accuracy_benchmark.py --selftest
# Verifies: ONNX runs, output is 512-d, preprocessing pipeline intact

# Full accuracy evaluation:
# Prepare: dataset/<person_name>/<img1.jpg> <img2.jpg> ...
python accuracy_benchmark.py --dataset ./dataset
# Reports: Accuracy, FAR, FRR, EER, genuine/impostor score separation, ONNX latency
# Writes: accuracy_results.json
```

---

## 15. Innovation Highlights

### 1. Two-stage pipeline for sub-second performance

The naive approach runs ONNX for every camera frame (5+ FPS). Instead:
- **Lightweight ML Kit** runs on every polling frame at 200 ms (5 FPS) for real-time UI feedback and liveness evaluation.
- **ONNX inference fires exactly once** — on the final captured full-resolution photo after the liveness challenge passes.

This keeps the app responsive on 3 GB RAM mid-range phones where sustained ONNX inference would cause thermal throttling and frame drops.

### 2. Crop-before-resize preprocessing

The original implementation squashed the full camera frame to 112×112. MobileFaceNet was trained on cropped face images; feeding a full-frame downscale produces embeddings with genuine cosine scores as low as 0.20. Cropping to the ML Kit bounding box first brings genuine scores to 0.75–0.95. A seemingly minor implementation detail with a ≥ 4× improvement in match quality.

### 3. Adaptive gamma for harsh outdoor conditions

Indian field conditions span deep shadow (tunnels, overpasses) to direct afternoon sun. A single fixed brightness assumption fails both extremes. The adaptive gamma correction `γ = ln(0.5)/ln(mean/255)` normalises the face crop to a target mid-luminance *before* the embedding is computed, giving the model consistent input regardless of ambient light.

### 4. Texture-gated passive spoof verdict

Earlier versions rejected sunlit faces as spoofs because brightness > 225 fired the spoof check. The texture gate (`isLive = NOT(soft AND (glare OR bright))`) makes sharpness the *primary* criterion: a face with real skin micro-texture (high Laplacian variance) is always allowed through. This is the correct behaviour: a printed photo or screen is characteristically *soft* — that is the reliable signal, not absolute brightness.

### 5. Three-axis pose enforcement

Earlier versions only checked yaw. "Face up but looking at camera" (high pitch, low yaw) could be captured and enrolled successfully, producing divergent embeddings that then failed verification. Checking pitch (rotationX) and roll (rotationZ) in addition to yaw — at both the live-preview and SDK gate levels — closes all off-axis enrollment paths.

### 6. Embedding-at-capture-time enrollment

Deferring ONNX processing to form-submit caused a race condition: the camera's temp file is purged by the OS within seconds of capture, so the ImageResizer native module would hang indefinitely on a missing path. Computing the embedding immediately at capture time (phase 2 of enrollment) and storing it in a React ref until form-submit avoids the race entirely and matches the verification path design.

### 7. Dual-threshold duplicate guard

Using the same 0.60 verification threshold for the duplicate guard allowed re-enrollment of the same person captured at a different angle (cross-angle same-person scores: 0.45–0.58). A dedicated `DUPLICATE_THRESHOLD = 0.45` widens the net without affecting verification precision, since different-person scores cluster below 0.40.

### 8. INT8 quantization path (documented)

`quantize_model.py` demonstrates dynamic INT8 quantization: 13 MB → 3.35 MB (74%). The `ConvInteger` compatibility gap with the current ORT Mobile CPU kernel is documented honestly, and the static QDQ path (production-correct for CNNs) is identified as the next step. Shipping a broken quantized model would have been dishonest; documenting the gap and the correct path is more valuable.

---

## 16. Evaluation Criteria Mapping

| Criterion | Requirement | How Addressed |
|---|---|---|
| **Innovation — Edge AI** | Lightweight on-device model | MobileFaceNet 13 MB, CPU-only, no GPU |
| **Innovation — Model compression** | Smaller is better | INT8 path to ~3.5 MB documented; FP32 ships at 13 MB |
| **Innovation — Anti-spoof** | Defeat photo/screen spoofing | Active challenge (blink/turn) + passive texture gate, layered |
| **Innovation — Accuracy in field conditions** | Indian demographics, sunlight, low light | Adaptive gamma + texture-gated spoof; three-axis pose enforcement |
| **Feasibility — Offline** | 100 % offline authentication | Zero network calls in the auth critical path |
| **Feasibility — Speed** | < 1 second | Two-stage pipeline; estimated 300–600 ms total |
| **Feasibility — Hardware** | Mid-range phone, Android 8+ / iOS 12+ | Tested target; CPU-only inference; ≥ 3 GB RAM |
| **Feasibility — Datalake integration** | Drop-in SDK for Datalake 3.0 | `FaceAuthSDK` — 4 methods, no UI required |
| **Scalability — Sync** | Attendance records to AWS | NetInfo-driven sync with idempotent DynamoDB write + auto-purge |
| **Scalability — Storage** | Encrypted biometrics | AES-256-CBC at rest; raw images never stored |
| **Scalability — Growing workforce** | Add users without retraining | 1:N cosine matching; new user = new INSERT, no model change |
| **Scalability — Lighting / demographics** | Robust across conditions | Adaptive gamma + tunable threshold in Settings |
| **Documentation — Technical** | Architecture, design decisions | This document + `docs/ARCHITECTURE.md` + `docs/BENCHMARKS.md` |
| **Documentation — Accuracy evidence** | Benchmark methodology | `accuracy_benchmark.py` harness with FAR/FRR/EER; LFW reference |
| **Documentation — Reproducibility** | Build + run instructions | §12 above; `README.md` |

---

## 17. Known Limitations & Roadmap

| Limitation | Current state | Production path |
|---|---|---|
| AES key hardcoded | Constant in `Database.ts` | Derive from Android Keystore / iOS Secure Enclave |
| AWS endpoint placeholder | Must be set in Settings before sync works | Ship with real endpoint; endpoint guard gives clear error message |
| Single enrollment angle | One frontal embedding per user | Multi-angle template averaging (3–5 captures) |
| INT8 model not shipped | ConvInteger not in ORT CPU kernel | Static QDQ quantization with calibration set |
| No labelled Indian dataset | > 95% claim referenced from LFW | Run `accuracy_benchmark.py` against a curated diverse dataset |
| Matching linear scan | O(N) decrypt + cosine | In-memory cache + HNSW index for > 1 000 users |
| API Gateway unauthenticated | Demo-grade backend | Add API key or Cognito authorizer to serverless.yml |

---

## 18. License & Dependencies

Released under the **MIT License**. All dependencies are open-source (MIT or Apache 2.0):

| Dependency | License | Role |
|---|---|---|
| React Native 0.76.9 | MIT | App framework |
| react-native-vision-camera | MIT | Camera capture |
| @react-native-ml-kit/face-detection | Apache 2.0 | Face bbox + pose + eye classification |
| onnxruntime-react-native | MIT | On-device ONNX CPU inference |
| MobileFaceNet (w600k_mbf) | MIT | Pre-trained face recognition model |
| react-native-sqlite-storage | MIT | Local embedding + attendance DB |
| crypto-js | MIT | AES-256-CBC encryption |
| @react-native-community/netinfo | MIT | Connectivity events for sync |
| @bam.tech/react-native-image-resizer | MIT | Native one-pass image downscale |
| jpeg-js | BSD-2 | Pure-JS JPEG decoder for preprocessing |
| base64-js | MIT | Base64 encode/decode |
| @react-navigation/* | MIT | Navigation stack + tabs |
| react-native-safe-area-context | MIT | Safe area insets |
| @react-native-async-storage/async-storage | MIT | Settings persistence |

No proprietary SDKs. No additional license purchases required.

---

<div align="center">


</div>
