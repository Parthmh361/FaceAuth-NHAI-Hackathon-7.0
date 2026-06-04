import cv2
import numpy as np
from insightface.app import FaceAnalysis

# =====================================
# INITIALIZE MODEL
# =====================================

print("Loading InsightFace model...")

app = FaceAnalysis(
    name='buffalo_sc',
    providers=['CPUExecutionProvider']
)

app.prepare(
    ctx_id=0,
    det_size=(640, 640)
)

print("Model loaded successfully!")

# =====================================
# IMAGE PATHS
# =====================================

IMAGE1 = "image1.png"
IMAGE2 = "image.png"

# =====================================
# LOAD IMAGES
# =====================================

img1 = cv2.imread(IMAGE1)
img2 = cv2.imread(IMAGE2)

if img1 is None:
    print(f"Could not load {IMAGE1}")
    exit()

if img2 is None:
    print(f"Could not load {IMAGE2}")
    exit()

print("Images loaded successfully!")

# =====================================
# DETECT FACES
# =====================================

faces1 = app.get(img1)
faces2 = app.get(img2)

if len(faces1) == 0:
    print(f"No face detected in {IMAGE1}")
    exit()

if len(faces2) == 0:
    print(f"No face detected in {IMAGE2}")
    exit()

print(f"Faces in image1: {len(faces1)}")
print(f"Faces in image2: {len(faces2)}")

# =====================================
# GET EMBEDDINGS
# =====================================

embedding1 = faces1[0].embedding
embedding2 = faces2[0].embedding

print("\nEmbedding shape:", embedding1.shape)

# =====================================
# COSINE SIMILARITY
# =====================================

similarity = np.dot(embedding1, embedding2) / (
    np.linalg.norm(embedding1) *
    np.linalg.norm(embedding2)
)

print("\n==============================")
print("FACE COMPARISON RESULT")
print("==============================")

print(f"Similarity Score: {similarity:.4f}")

# =====================================
# INTERPRET RESULT
# =====================================

if similarity > 0.6:
    print("VERY LIKELY SAME PERSON")

elif similarity > 0.4:
    print("LIKELY SAME PERSON")

elif similarity > 0.3:
    print("UNCERTAIN MATCH")

else:
    print("DIFFERENT PEOPLE")

# =====================================
# DRAW FACE BOXES
# =====================================

for face in faces1:
    box = face.bbox.astype(int)
    cv2.rectangle(img1,
                  (box[0], box[1]),
                  (box[2], box[3]),
                  (0,255,0), 2)

for face in faces2:
    box = face.bbox.astype(int)
    cv2.rectangle(img2,
                  (box[0], box[1]),
                  (box[2], box[3]),
                  (0,255,0), 2)

# =====================================
# SHOW IMAGES
# =====================================

cv2.imshow("Image 1", img1)
cv2.imshow("Image 2", img2)

print("\nPress any key to close windows...")

cv2.waitKey(0)
cv2.destroyAllWindows()