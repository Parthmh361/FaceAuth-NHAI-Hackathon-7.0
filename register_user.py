import cv2
import numpy as np
import os

from insightface.app import FaceAnalysis

# ==========================================
# Create Folder
# ==========================================

os.makedirs("registered_users", exist_ok=True)

# ==========================================
# Initialize InsightFace
# ==========================================

app = FaceAnalysis(
    name='buffalo_sc',
    providers=['CPUExecutionProvider']
)

app.prepare(ctx_id=0, det_size=(320,320))

# ==========================================
# User Input
# ==========================================

name = input("Enter user name: ")

# ==========================================
# Webcam
# ==========================================

cap = cv2.VideoCapture(0)

print("Press SPACE to capture face")
print("Press Q to quit")

while True:

    ret, frame = cap.read()

    if not ret:
        break

    frame = cv2.flip(frame, 1)

    cv2.putText(
        frame,
        "Press SPACE to register",
        (20,40),
        cv2.FONT_HERSHEY_SIMPLEX,
        0.8,
        (0,255,0),
        2
    )

    cv2.imshow("Register User", frame)

    key = cv2.waitKey(1)

    # SPACE key
    if key == 32:

        faces = app.get(frame)

        if len(faces) == 0:
            print("No face detected.")
            continue

        embedding = faces[0].embedding

        np.save(
            f"registered_users/{name}.npy",
            embedding
        )

        print(f"User '{name}' registered successfully!")

        break

    # Q key
    elif key == ord('q'):
        break

cap.release()
cv2.destroyAllWindows()