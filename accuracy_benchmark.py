"""
Accuracy Benchmark Harness for w600k_mbf.onnx (MobileFaceNet)
=============================================================
Measures real recognition accuracy, FAR, FRR, and EER against a labelled
face dataset — using the EXACT same preprocessing as the mobile app
(112x112, RGB, (x-127.5)/127.5, NCHW). This produces the >95% accuracy
evidence required by the hackathon brief instead of an unsupported claim.

Requirements
------------
  pip install onnxruntime numpy opencv-python

Dataset layout
--------------
  dataset/
    PersonA/  img1.jpg  img2.jpg  img3.jpg ...
    PersonB/  img1.jpg  img2.jpg ...
    ...
  (2+ images per person; faces are auto-detected & cropped via Haar cascade.)

Usage
-----
  python accuracy_benchmark.py --dataset ./dataset
  python accuracy_benchmark.py --dataset ./dataset --threshold 0.60 --out results.json

For a quick smoke-test of the pipeline without a dataset:
  python accuracy_benchmark.py --selftest
"""

import os
import sys
import json
import time
import argparse
import itertools

import numpy as np

try:
    import onnxruntime as ort
except ImportError:
    sys.exit("ERROR: onnxruntime not installed. Run: pip install onnxruntime")

try:
    import cv2
except ImportError:
    sys.exit("ERROR: opencv not installed. Run: pip install opencv-python")

MODEL_PATH = os.path.join(
    'FaceAuthApp', 'android', 'app', 'src', 'main', 'assets', 'w600k_mbf.onnx'
)
INPUT_NAME = 'input.1'
IMG_SIZE = 112

_haar = cv2.CascadeClassifier(
    cv2.data.haarcascades + 'haarcascade_frontalface_default.xml'
)


# ── Preprocessing (mirrors FaceProcessor.ts exactly) ────────────────
def detect_and_crop(bgr):
    """Detect the largest face, crop with 10% margin. Falls back to full image."""
    gray = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)
    faces = _haar.detectMultiScale(gray, scaleFactor=1.1, minNeighbors=5, minSize=(60, 60))
    if len(faces) == 0:
        return bgr
    x, y, w, h = max(faces, key=lambda f: f[2] * f[3])
    mx, my = int(w * 0.1), int(h * 0.1)
    x0, y0 = max(0, x - mx), max(0, y - my)
    x1, y1 = min(bgr.shape[1], x + w + mx), min(bgr.shape[0], y + h + my)
    return bgr[y0:y1, x0:x1]


def preprocess(bgr):
    """BGR image -> (1,3,112,112) float32 in [-1,1], RGB order, NCHW."""
    face = detect_and_crop(bgr)
    face = cv2.resize(face, (IMG_SIZE, IMG_SIZE), interpolation=cv2.INTER_LINEAR)
    rgb = cv2.cvtColor(face, cv2.COLOR_BGR2RGB).astype(np.float32)
    rgb = (rgb - 127.5) / 127.5                 # normalize to [-1,1]
    chw = np.transpose(rgb, (2, 0, 1))          # HWC -> CHW
    return chw[np.newaxis, :, :, :].astype(np.float32)


def l2_normalize(v):
    n = np.linalg.norm(v)
    return v / n if n > 0 else v


# ── Embedding extraction ────────────────────────────────────────────
def build_session():
    if not os.path.exists(MODEL_PATH):
        sys.exit(f"ERROR: model not found at {MODEL_PATH}. Run from repo root.")
    so = ort.SessionOptions()
    so.intra_op_num_threads = 1  # mimic single-core mid-range phone
    return ort.InferenceSession(MODEL_PATH, sess_options=so,
                                providers=['CPUExecutionProvider'])


def embed(session, bgr):
    t = time.time()
    out = session.run(None, {INPUT_NAME: preprocess(bgr)})[0]
    latency = (time.time() - t) * 1000
    return l2_normalize(out.flatten()), latency


# ── Dataset loading ─────────────────────────────────────────────────
def load_dataset(root):
    """Returns {person: [embedding, ...]} and a list of inference latencies."""
    session = build_session()
    people, latencies = {}, []
    exts = ('.jpg', '.jpeg', '.png', '.bmp')

    for person in sorted(os.listdir(root)):
        pdir = os.path.join(root, person)
        if not os.path.isdir(pdir):
            continue
        embs = []
        for fn in sorted(os.listdir(pdir)):
            if not fn.lower().endswith(exts):
                continue
            img = cv2.imread(os.path.join(pdir, fn))
            if img is None:
                continue
            e, lat = embed(session, img)
            embs.append(e)
            latencies.append(lat)
        if embs:
            people[person] = embs
            print(f"  {person:20s} {len(embs)} images")
    return people, latencies


# ── Metrics ─────────────────────────────────────────────────────────
def cosine(a, b):
    return float(np.dot(a, b))  # already L2-normalized


def collect_scores(people):
    genuine, impostor = [], []
    for embs in people.values():
        for a, b in itertools.combinations(embs, 2):
            genuine.append(cosine(a, b))
    names = list(people.keys())
    for i in range(len(names)):
        for j in range(i + 1, len(names)):
            for a in people[names[i]]:
                for b in people[names[j]]:
                    impostor.append(cosine(a, b))
    return np.array(genuine), np.array(impostor)


def metrics_at(threshold, genuine, impostor):
    # genuine accepted when score >= threshold; impostor rejected when score < threshold
    frr = float(np.mean(genuine < threshold)) if len(genuine) else 0.0   # false reject
    far = float(np.mean(impostor >= threshold)) if len(impostor) else 0.0  # false accept
    total = len(genuine) + len(impostor)
    correct = int(np.sum(genuine >= threshold)) + int(np.sum(impostor < threshold))
    acc = correct / total if total else 0.0
    return far, frr, acc


def find_eer(genuine, impostor):
    best_t, best_gap, eer = 0.5, 1e9, 1.0
    for t in np.linspace(0, 1, 1001):
        far, frr, _ = metrics_at(t, genuine, impostor)
        if abs(far - frr) < best_gap:
            best_gap, eer, best_t = abs(far - frr), (far + frr) / 2, t
    return eer, best_t


# ── Reporting ───────────────────────────────────────────────────────
def run(dataset, threshold, out_path):
    print(f"Loading model: {MODEL_PATH}")
    print(f"Scanning dataset: {dataset}\n")
    people, latencies = load_dataset(dataset)

    n_people = len(people)
    n_imgs = sum(len(v) for v in people.values())
    if n_people < 2 or n_imgs < 4:
        sys.exit("ERROR: need >=2 people and >=4 images total to compute metrics.")

    genuine, impostor = collect_scores(people)
    far, frr, acc = metrics_at(threshold, genuine, impostor)
    eer, eer_t = find_eer(genuine, impostor)
    lat = np.array(latencies)

    print("\n" + "=" * 52)
    print("  ACCURACY BENCHMARK RESULTS")
    print("=" * 52)
    print(f"  People / Images      : {n_people} / {n_imgs}")
    print(f"  Genuine pairs        : {len(genuine)}")
    print(f"  Impostor pairs       : {len(impostor)}")
    print(f"  Operating threshold  : {threshold:.2f}")
    print("-" * 52)
    print(f"  Accuracy             : {acc * 100:.2f}%   {'PASS >95%' if acc > 0.95 else 'BELOW 95%'}")
    print(f"  FAR (false accept)   : {far * 100:.2f}%")
    print(f"  FRR (false reject)   : {frr * 100:.2f}%")
    print(f"  EER                  : {eer * 100:.2f}%  @ threshold {eer_t:.3f}")
    print("-" * 52)
    print(f"  Genuine  mean sim    : {genuine.mean():.3f} (+/- {genuine.std():.3f})")
    print(f"  Impostor mean sim    : {impostor.mean():.3f} (+/- {impostor.std():.3f})")
    print(f"  ONNX latency (1 core): {lat.mean():.1f}ms avg / {np.percentile(lat,95):.1f}ms p95")
    print("=" * 52)

    results = {
        'people': n_people, 'images': n_imgs,
        'threshold': threshold,
        'accuracy': acc, 'far': far, 'frr': frr,
        'eer': eer, 'eer_threshold': float(eer_t),
        'genuine_mean': float(genuine.mean()), 'impostor_mean': float(impostor.mean()),
        'onnx_latency_ms_avg': float(lat.mean()),
        'onnx_latency_ms_p95': float(np.percentile(lat, 95)),
    }
    if out_path:
        with open(out_path, 'w') as f:
            json.dump(results, f, indent=2)
        print(f"\nResults written to {out_path}")
    return results


def selftest():
    """Pipeline smoke-test with no dataset: random images through the real model."""
    print("Self-test: running 5 random frames through the model…")
    session = build_session()
    lats = []
    for _ in range(5):
        img = (np.random.rand(240, 240, 3) * 255).astype(np.uint8)
        e, lat = embed(session, img)
        lats.append(lat)
        assert e.shape == (512,), f"unexpected embedding shape {e.shape}"
    print(f"OK — embedding dim 512, avg latency {np.mean(lats):.1f}ms on 1 CPU core.")
    print("Pipeline is functional. Provide --dataset for real accuracy metrics.")


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('--dataset', help='path to labelled face dataset')
    ap.add_argument('--threshold', type=float, default=0.60)
    ap.add_argument('--out', default='accuracy_results.json')
    ap.add_argument('--selftest', action='store_true')
    args = ap.parse_args()

    if args.selftest or not args.dataset:
        selftest()
    else:
        run(args.dataset, args.threshold, args.out)
