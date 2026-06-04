import cv2
import mediapipe as mp
import numpy as np
import os
from insightface.app import FaceAnalysis

# ==========================================
# InsightFace Initialization
# ==========================================

face_app = FaceAnalysis(
    name='buffalo_sc',
    providers=['CPUExecutionProvider']
)

face_app.prepare(ctx_id=0, det_size=(320,320))

# ==========================================
# MediaPipe Initialization
# ==========================================

mp_face_mesh = mp.solutions.face_mesh
mp_face_detection = mp.solutions.face_detection

face_mesh = mp_face_mesh.FaceMesh(
    max_num_faces=1,
    refine_landmarks=True,
    min_detection_confidence=0.5,
    min_tracking_confidence=0.5
)

face_detector = mp_face_detection.FaceDetection(
    model_selection=0,
    min_detection_confidence=0.5
)

# ==========================================
# Landmark Definitions
# ==========================================

LEFT_EYE = [362, 385, 387, 263, 373, 380]
RIGHT_EYE = [33, 160, 158, 133, 153, 144]

NOSE_TIP = 1
LEFT_FACE = 234
RIGHT_FACE = 454

# ==========================================
# Load Registered Users
# ==========================================

registered_users = {}

os.makedirs("registered_users", exist_ok=True)

for file in os.listdir("registered_users"):

    if file.endswith(".npy"):

        name = file[:-4]

        embedding = np.load(
            f"registered_users/{file}"
        )

        registered_users[name] = embedding

print("Registered Users:", list(registered_users.keys()))

# ==========================================
# EAR Function
# ==========================================

def eye_aspect_ratio(landmarks, eye_indices, w, h):

    points = []

    for idx in eye_indices:

        x = int(landmarks[idx].x * w)
        y = int(landmarks[idx].y * h)

        points.append((x, y))

    A = np.linalg.norm(
        np.array(points[1]) - np.array(points[5])
    )

    B = np.linalg.norm(
        np.array(points[2]) - np.array(points[4])
    )

    C = np.linalg.norm(
        np.array(points[0]) - np.array(points[3])
    )

    return (A + B) / (2.0 * C)

# ==========================================
# Passive Spoof Functions
# ==========================================

def variance_of_laplacian(image):

    return cv2.Laplacian(
        image,
        cv2.CV_64F
    ).var()

def reflection_ratio(gray):

    bright_pixels = np.sum(gray > 240)

    total_pixels = gray.shape[0] * gray.shape[1]

    return bright_pixels / total_pixels

# ==========================================
# Variables
# ==========================================

EAR_THRESHOLD = 0.20

blink_count = 0
blink_state = False

looked_left = False
looked_right = False

spoof_history = []

MAX_HISTORY = 30

# ==========================================
# Webcam
# ==========================================

cap = cv2.VideoCapture(0)

print("Starting Final Authentication System...")

# ==========================================
# Main Loop
# ==========================================

while cap.isOpened():

    ret, frame = cap.read()

    if not ret:
        break

    frame = cv2.flip(frame, 1)

    h, w = frame.shape[:2]

    rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)

    mesh_results = face_mesh.process(rgb)

    detect_results = face_detector.process(rgb)

    status = "NO FACE"

    trust_score = 0

    spoof_score = 0

    # ======================================
    # Passive Spoof Detection
    # ======================================

    if detect_results.detections:

        detection = detect_results.detections[0]

        bbox = detection.location_data.relative_bounding_box

        x = int(bbox.xmin * w)
        y = int(bbox.ymin * h)
        bw = int(bbox.width * w)
        bh = int(bbox.height * h)

        x = max(0, x)
        y = max(0, y)

        face_crop = frame[y:y+bh, x:x+bw]

        if face_crop.size > 0:

            gray = cv2.cvtColor(
                face_crop,
                cv2.COLOR_BGR2GRAY
            )

            sharpness = variance_of_laplacian(gray)

            reflect = reflection_ratio(gray)

            brightness = np.mean(gray)

            # ----------------------------------

            if sharpness < 80:
                spoof_score += 1

            if reflect > 0.03:
                spoof_score += 1

            if brightness > 180:
                spoof_score += 1

            # ----------------------------------

            spoof_history.append(spoof_score)

            if len(spoof_history) > MAX_HISTORY:
                spoof_history.pop(0)

            avg_spoof = np.mean(spoof_history)

            # ----------------------------------

            if avg_spoof < 1.5:
                trust_score += 3

    # ======================================
    # Active Liveness
    # ======================================

    if mesh_results.multi_face_landmarks:

        landmarks = mesh_results.multi_face_landmarks[0].landmark

        # ==================================
        # Blink Detection
        # ==================================

        left_ear = eye_aspect_ratio(
            landmarks,
            LEFT_EYE,
            w,
            h
        )

        right_ear = eye_aspect_ratio(
            landmarks,
            RIGHT_EYE,
            w,
            h
        )

        avg_ear = (left_ear + right_ear) / 2

        if avg_ear < EAR_THRESHOLD:

            if not blink_state:

                blink_count += 1
                blink_state = True

        else:

            blink_state = False

        if blink_count >= 2:
            trust_score += 2

        # ==================================
        # Head Movement
        # ==================================

        nose_x = int(
            landmarks[NOSE_TIP].x * w
        )

        left_x = int(
            landmarks[LEFT_FACE].x * w
        )

        right_x = int(
            landmarks[RIGHT_FACE].x * w
        )

        center_x = (left_x + right_x) / 2

        offset = nose_x - center_x

        if offset < -25:
            looked_left = True

        if offset > 25:
            looked_right = True

        if looked_left:
            trust_score += 1

        if looked_right:
            trust_score += 1

    # ======================================
    # Final Authentication Logic
    # ======================================

    authenticated_user = None

    if trust_score >= 7:

        faces = face_app.get(frame)

        if len(faces) > 0:

            embedding = faces[0].embedding

            best_score = 0
            best_match = "Unknown"

            for name, reg_emb in registered_users.items():

                similarity = np.dot(
                    embedding,
                    reg_emb
                ) / (
                    np.linalg.norm(embedding) *
                    np.linalg.norm(reg_emb)
                )

                if similarity > best_score:

                    best_score = similarity
                    best_match = name

            if best_score > 0.5:

                authenticated_user = best_match

                status = f"AUTHENTICATED: {best_match}"

            else:

                status = "FACE NOT MATCHED"

    else:

        status = "LIVENESS CHECK IN PROGRESS"

    # ======================================
    # Draw UI
    # ======================================

    color = (0,255,0)

    if "NOT" in status:
        color = (0,0,255)

    if "PROGRESS" in status:
        color = (255,255,0)

    cv2.putText(
        frame,
        status,
        (20,40),
        cv2.FONT_HERSHEY_SIMPLEX,
        0.8,
        color,
        2
    )

    cv2.putText(
        frame,
        f"Trust Score: {trust_score}",
        (20,80),
        cv2.FONT_HERSHEY_SIMPLEX,
        0.7,
        (255,255,255),
        2
    )

    cv2.putText(
        frame,
        f"Blinks: {blink_count}",
        (20,115),
        cv2.FONT_HERSHEY_SIMPLEX,
        0.7,
        (255,255,255),
        2
    )

    cv2.putText(
        frame,
        f"Left: {looked_left}",
        (20,150),
        cv2.FONT_HERSHEY_SIMPLEX,
        0.7,
        (255,255,255),
        2
    )

    cv2.putText(
        frame,
        f"Right: {looked_right}",
        (20,185),
        cv2.FONT_HERSHEY_SIMPLEX,
        0.7,
        (255,255,255),
        2
    )

    if len(spoof_history) > 0:

        cv2.putText(
            frame,
            f"Avg Spoof: {avg_spoof:.2f}",
            (20,220),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.7,
            (255,255,255),
            2
        )

    cv2.imshow(
        "Final Offline Authentication System",
        frame
    )

    # ======================================
    # Quit
    # ======================================

    if cv2.waitKey(1) & 0xFF == ord('q'):
        break

# ==========================================
# Cleanup
# ==========================================

cap.release()
cv2.destroyAllWindows()