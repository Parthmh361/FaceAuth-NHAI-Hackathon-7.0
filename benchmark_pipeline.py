import cv2
import time
import numpy as np

from insightface.app import FaceAnalysis

# ==========================================
# Initialize Model
# ==========================================

app = FaceAnalysis(
    name='buffalo_sc',
    providers=['CPUExecutionProvider']
)

app.prepare(
    ctx_id=0,
    det_size=(320,320)
)

# ==========================================
# Load Test Image
# ==========================================

img = cv2.imread("image1.png")

if img is None:
    print("Image not found.")
    exit()

# ==========================================
# Benchmark
# ==========================================
# Warm-up runs
for _ in range(5):
    app.get(img)
times = []

print("Running benchmark...")

for i in range(50):

    start = time.time()

    faces = app.get(img)

    end = time.time()

    inference_time = (end - start) * 1000

    times.append(inference_time)

    print(f"Run {i+1}: {inference_time:.2f} ms")

# ==========================================
# Results
# ==========================================

print("\n========== RESULTS ==========")

print(f"Average: {np.mean(times):.2f} ms")
print(f"Minimum: {np.min(times):.2f} ms")
print(f"Maximum: {np.max(times):.2f} ms")