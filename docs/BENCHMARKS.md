# NHAI FaceAuth — Performance & Accuracy Benchmarks

This document specifies **how performance and accuracy are measured**, the **targets** from the
problem statement, and **result tables to fill from a real mid-range device / labelled dataset**.

> **Reading guide.** Numbers marked **`[MEASURE]`** are placeholders to be filled from a real
> device run — the app already instruments every stage (see §1.2), so collecting them takes a few
> minutes. Numbers marked **`(estimate)`** are architectural projections, not yet device-verified.
> This separation is deliberate: claim only what you have measured to the committee.

---

# Part A — Performance

## A.0 Targets (from the problem statement)

| Metric | Target | Notes |
|---|---|---|
| Recognition + liveness verification | **< 1 second** | per the spec, on standard mid-range devices |
| Model footprint | **~20 MB or less** | smaller is better |
| Hardware | **No GPU**, CPU-only | Android 8.0+ / iOS 12+, ≥ 3 GB RAM |
| Battery / memory | Low | mid-range friendly |

## A.1 What "< 1 second" covers

The < 1 s budget applies to the **recognition + liveness-verification step** — i.e. from the
captured frame to the authentication decision. It is measured end-to-end as `totalMs` and broken
into stages. (The *interactive* part where the user performs the blink/smile/turn is user-paced
and excluded from the 1 s budget, as is standard for challenge–response liveness.)

## A.2 In-app instrumentation (already built)

Every verification returns a `Timing` object and the Verify result screen renders it live:

```
Timing { mlKitMs, prepMs, onnxMs, dbMs, totalMs }
```

| Stage | Field | What it covers |
|---|---|---|
| Face detection | `mlKitMs` | ML Kit bounding box + classification on the downscaled frame |
| Preprocess | `prepMs` | JPEG decode → crop → adaptive gamma → bilinear 112×112 → tensor |
| Embedding | `onnxMs` | MobileFaceNet ONNX forward pass (512-d) |
| DB match | `dbMs` | decrypt enrolled vectors + cosine argmax |
| **Total** | `totalMs` | sum of the above for one verification |

> To collect: run **Verify** on a real device and read the four cells on the result card.

## A.3 Latency breakdown — results table

Device: **`[MEASURE: e.g. Redmi Note 12, SD685, 4 GB]`**, build: **release**, N = **`[MEASURE: 20]`** runs.

| Stage | Target share | Measured (median) | Measured (p90) |
|---|---|---|---|
| `mlKitMs` (detect) | — | `[MEASURE]` | `[MEASURE]` |
| `prepMs` (preprocess) | — | `[MEASURE]` | `[MEASURE]` |
| `onnxMs` (embedding) | — | `[MEASURE]` | `[MEASURE]` |
| `dbMs` (match) | — | `[MEASURE]` | `[MEASURE]` |
| **`totalMs`** | **< 1000 ms** | `[MEASURE]` | `[MEASURE]` |

**Architectural estimate (mid-range, to be replaced by measured values):**
detect ~120–250 ms · preprocess ~80–200 ms · ONNX ~60–150 ms · match <5 ms (for ≤ a few hundred
enrolled) → **~300–600 ms total (estimate)**, inside the 1 s budget. The dominant cost is the
pure-JS JPEG decode in preprocessing; the model forward pass is cheap.

> **Note on the matching cost at scale.** `dbMs` grows linearly with the number of enrolled users
> (each verify decrypts + cosine-compares every stored vector). For ≤ ~1–2k users this is still
> sub-10 ms; see §C for the scaling plan beyond that.

## A.4 Footprint & memory — results table

> **The 20 MB rule targets the AI model footprint, not the installed APK** (problem statement
> §2: *"The **AI model** must be extremely lightweight… target size ~20 MB"*). The model footprint
> is **comfortably within budget**; see §A.6 for the model-vs-APK distinction.

| Item | Target | Value |
|---|---|---|
| **ONNX model (FP32, shipped)** | ≤ 20 MB | **13.0 MB** ✅ |
| ONNX model (INT8, dynamic) | smaller is better | **3.35 MB** (74% smaller) — *measured*, see §A.6 caveat |
| **Total AI footprint shipped** | ~20 MB | **13.0 MB** ✅ |
| Peak RAM during verify | low | `[MEASURE]` (Android Studio Profiler / Xcode Instruments) |
| Installed APK, single ABI (arm64-v8a) | — | `[MEASURE]` (~55–65 MB estimate) |
| Universal APK (all 4 ABIs, no minify) | — | 209 MB (debug-style packaging; **not** the deliverable footprint) |

## A.5 How to reproduce performance numbers

1. **Device latency (primary):** build release, run **Verify** 20× on a real phone, record the
   four timing fields per run, compute median + p90, fill §A.3.
2. **Single-core model latency (lab):**
   ```bash
   pip install onnxruntime numpy opencv-python
   python accuracy_benchmark.py --selftest      # prints 512-d output + ONNX latency
   ```
3. **Memory:** attach Android Studio Profiler (or Xcode Instruments) during a verify and read
   peak heap / native memory.

## A.6 Model footprint vs. APK size (read before quoting any size)

These are two different numbers and the rule concerns only the first:

- **AI model footprint = 13.0 MB** (FP32), the metric the spec caps at ~20 MB → **compliant**.
- **Installed APK** cannot reach 20 MB with this stack, and that is expected: the open-source
  inference **engines** dominate, not our model. Per single architecture (arm64-v8a):

  | Native component | Size (arm64-v8a) |
  |---|---|
  | ONNX Runtime (`libonnxruntime.so`) | 27.4 MB |
  | ML Kit face detector | 8.5 MB |
  | React Native + Hermes | ~9 MB |
  | Our model | 13.0 MB |

  ONNX Runtime **alone** exceeds 20 MB, so no build flag makes the whole app 20 MB. A lean
  **single-ABI release/AAB lands ~55–65 MB per device**. The **209 MB** figure is a *universal*
  APK bundling **all four** CPU architectures (armeabi-v7a + arm64-v8a + x86 + x86_64) with
  minification off — a packaging artifact, not the module footprint. x86/x86_64 are
  emulator-only and contribute ~80 MB of that.

- **Integration reality:** the deliverable plugs into Datalake 3.0, which already ships RN/Hermes.
  The *incremental* footprint the module adds is **model (13 MB) + ML Kit (~8.5 MB) + ONNX
  Runtime (~27 MB)** for one ABI — and the model is the smallest, most-compressible piece.

### Quantization result & caveat

`quantize_model.py` (dynamic INT8, weight-only) compresses the model **13.0 MB → 3.35 MB (74%
smaller)** — a strong compression result for the Innovation criterion. **Caveat (verified):**
dynamic quantization of this Conv-heavy MobileFaceNet emits `ConvInteger` operators that ONNX
Runtime's CPU kernel currently reports `NOT_IMPLEMENTED`, so the dynamically-quantized file is
**not shipped** (it would risk on-device inference). The production-correct path for a CNN is
**static QDQ quantization with a small calibration set** (produces `QLinearConv`, broadly
supported by ORT Mobile); this is a verified, near-term optimization, not a same-day swap. The
13.0 MB FP32 model is shipped today and already meets the cap.

## A.7 How to reproduce footprint numbers

```bash
# AI footprint (FP32, shipped)
ls -lh FaceAuthApp/android/app/src/main/assets/w600k_mbf.onnx   # 13.0 MB

# INT8 compression demo (3.35 MB) — file is generated, not bundled (see caveat above)
pip install onnx onnxruntime
python quantize_model.py

# Per-ABI native breakdown inside an APK
unzip -l app-release.apk | grep '\.so$' | sort -k1 -nr | head
```

## A.5 How to reproduce performance numbers

1. **Device latency (primary):** build release, run **Verify** 20× on a real phone, record the
   four timing fields per run, compute median + p90, fill §A.3.
2. **Single-core model latency (lab):**
   ```bash
   pip install onnxruntime numpy opencv-python
   python accuracy_benchmark.py --selftest      # prints 512-d output + ONNX latency
   ```
3. **Memory:** attach Android Studio Profiler (or Xcode Instruments) during a verify and read
   peak heap / native memory.
4. **Quantization footprint:**
   ```bash
   pip install onnx onnxruntime
   python quantize_model.py                      # 13.6 MB → ~3.5 MB INT8
   ```
   then set `MODEL_NAME = 'w600k_mbf_int8.onnx'` in `context/AppContext.tsx` and re-measure A.3/A.4.

---

# Part B — Accuracy

## B.0 Targets (from the problem statement)

| Metric | Target |
|---|---|
| Facial recognition accuracy | **> 95%** |
| Demographics | Reliable across **diverse Indian** skin tones / ages |
| Lighting | Robust in **harsh sunlight, shadow, low light, partial illumination** |

## B.1 Metric definitions

- **Genuine pair** — two images of the *same* person. **Impostor pair** — two images of
  *different* people.
- **FAR** (False Accept Rate) — impostor pairs wrongly accepted as the same person.
- **FRR** (False Reject Rate) — genuine pairs wrongly rejected.
- **EER** (Equal Error Rate) — the operating point where FAR = FRR (lower is better).
- **Accuracy** — correct decisions / total pairs at the chosen threshold (default **0.60**).
- **Genuine/impostor separation** — gap between mean genuine and mean impostor cosine scores
  (larger ⇒ more robust threshold).

## B.2 Harness (already built)

`accuracy_benchmark.py` reproduces the **exact mobile preprocessing** (112×112, RGB,
`(x−127.5)/127.5`, NCHW) and reports accuracy, FAR, FRR, EER, score separation, and single-core
ONNX latency; it writes `accuracy_results.json`.

```bash
pip install onnxruntime numpy opencv-python
# dataset/<person_name>/<image1.jpg>, <image2.jpg>, ...
python accuracy_benchmark.py --dataset ./dataset
python accuracy_benchmark.py --selftest        # pipeline smoke test, no dataset
```

**Dataset layout expected:**

```
dataset/
├── person_A/   img1.jpg img2.jpg img3.jpg ...
├── person_B/   img1.jpg img2.jpg ...
└── ...
```

For a credible > 95% claim, use ≥ 20 identities × ≥ 5 images each, sampled across skin tones,
ages, and the four lighting conditions.

## B.3 Accuracy — results table (threshold = 0.60)

Dataset: **`[MEASURE: N identities, M images, source]`**

| Metric | Target | Measured |
|---|---|---|
| Accuracy | > 95% | `[MEASURE]` |
| FAR | low | `[MEASURE]` |
| FRR | low | `[MEASURE]` |
| EER | low | `[MEASURE]` |
| Mean genuine cosine | high | `[MEASURE]` |
| Mean impostor cosine | low | `[MEASURE]` |
| ONNX latency (single core) | — | `[MEASURE]` ms |

## B.4 Accuracy by condition (recommended breakdown)

| Condition | Accuracy | FRR | Notes |
|---|---|---|---|
| Indoor, even light | `[MEASURE]` | `[MEASURE]` | baseline |
| Harsh sunlight | `[MEASURE]` | `[MEASURE]` | adaptive gamma + texture-gated spoof |
| Low light | `[MEASURE]` | `[MEASURE]` | adaptive gamma brightens |
| Shadow / partial | `[MEASURE]` | `[MEASURE]` | |
| Skin-tone span | `[MEASURE]` | `[MEASURE]` | report range across the set |

## B.5 Model reference point

The MobileFaceNet backbone (`w600k_mbf`) reports **~99.1% on LFW** as a published reference for
the architecture/weights family. **This is an external benchmark, not our measurement** — the
in-repo numbers above must come from B.3/B.4 on a labelled set to substantiate the > 95% claim
for this deployment and demographic.

## B.6 Robustness mechanisms (what defends accuracy in the field)

| Risk | Mitigation in code |
|---|---|
| Harsh sunlight / glare | Adaptive gamma (`gammaFor`) + **texture-gated** passive spoof (sharp faces pass regardless of brightness) |
| Low light / shadow | Adaptive gamma brightens frames with mean luminance < 60 |
| Wrong crop / scale | Crop to ML Kit bbox **before** resize (never squeeze full frame) |
| Demographic drift | Tunable threshold (Settings); roadmap: per-deployment calibration + multi-frame enrolment |
| Spoof vs. accuracy trade-off | Active challenge–response is the strong layer; passive gate tuned to avoid false rejects outdoors |

---

# Part C — Scalability notes (for the 20-mark criterion)

- **Matching** is currently linear scan (decrypt + cosine over all enrolled). Fine to ~1–2k
  users on-device. Beyond that: keep embeddings in memory decrypted once per session, or add an
  ANN index (e.g. HNSW) — the 512-d vectors are index-ready.
- **Sync** is idempotent (`employee_id + timestamp` composite key) so retries and multi-device
  deployments never double-count attendance.
- **Model upgrades** are drop-in: swap the ONNX asset; embeddings are re-generated on next
  enrol. No app logic change (input/output contract is fixed at `1×3×112×112` → 512-d).

---

## Reproduction checklist (fill before submission)

- [ ] §A.3 latency table from 20 release-build verifies on a real mid-range phone
- [ ] §A.4 peak RAM + APK delta
- [ ] §B.3 accuracy/FAR/FRR/EER from `accuracy_benchmark.py --dataset`
- [ ] §B.4 per-condition breakdown (the four lighting cases)
- [ ] (optional) bundle INT8 model and re-measure footprint + latency
