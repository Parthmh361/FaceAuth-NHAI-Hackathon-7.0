import cv2
import numpy as np
from insightface.app import FaceAnalysis

# -----------------------------
# Initialize InsightFace
# -----------------------------
print("Loading InsightFace model...")

app = FaceAnalysis(
    name='buffalo_sc',
    providers=['CPUExecutionProvider']
)

# prepare model
app.prepare(
    ctx_id=0,
    det_size=(640, 640)
)

print("Model loaded successfully!")

# -----------------------------
# Load image
# -----------------------------
IMAGE_PATH = "image.png"

img = cv2.imread(IMAGE_PATH)

if img is None:
    print(f"ERROR: Could not read image: {IMAGE_PATH}")
    exit()

print(f"Image loaded: {IMAGE_PATH}")

# -----------------------------
# Detect faces
# -----------------------------
faces = app.get(img)

print(f"Faces detected: {len(faces)}")

if len(faces) == 0:
    print("No faces found.")
    exit()

# -----------------------------
# Process each face
# -----------------------------
for idx, face in enumerate(faces):

    print("\n==========================")
    print(f"FACE #{idx + 1}")
    print("==========================")

    # embedding vector
    embedding = face.embedding

    print("Embedding shape:", embedding.shape)

    # confidence score
    print("Detection score:", round(face.det_score, 4))

    # bounding box
    bbox = face.bbox.astype(int)

    x1, y1, x2, y2 = bbox

    print("Bounding box:", bbox)

    # draw rectangle
    cv2.rectangle(
        img,
        (x1, y1),
        (x2, y2),
        (0, 255, 0),
        2
    )

    # label
    cv2.putText(
        img,
        f"Face {idx+1}",
        (x1, y1 - 10),
        cv2.FONT_HERSHEY_SIMPLEX,
        0.7,
        (0, 255, 0),
        2
    )

# -----------------------------
# Save output image
# -----------------------------
OUTPUT_PATH = "output_detected.jpg"

cv2.imwrite(OUTPUT_PATH, img)

print(f"\nOutput saved as: {OUTPUT_PATH}")

# -----------------------------
# Show image
# -----------------------------
cv2.imshow("Detected Faces", img)

print("\nPress any key to close window...")

cv2.waitKey(0)

cv2.destroyAllWindows()