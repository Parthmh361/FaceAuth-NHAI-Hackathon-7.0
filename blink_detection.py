import cv2
import mediapipe as mp
import numpy as np

# ==========================================
# MediaPipe FaceMesh Initialization
# ==========================================

mp_face_mesh = mp.solutions.face_mesh

face_mesh = mp_face_mesh.FaceMesh(
    max_num_faces=1,
    refine_landmarks=True,
    min_detection_confidence=0.5,
    min_tracking_confidence=0.5
)

# ==========================================
# Eye Landmark Indices
# ==========================================

LEFT_EYE = [362, 385, 387, 263, 373, 380]
RIGHT_EYE = [33, 160, 158, 133, 153, 144]

# ==========================================
# EAR Calculation Function
# ==========================================

def eye_aspect_ratio(landmarks, eye_indices, img_w, img_h):

    points = []

    for idx in eye_indices:
        x = int(landmarks[idx].x * img_w)
        y = int(landmarks[idx].y * img_h)
        points.append((x, y))

    # Vertical distances
    A = np.linalg.norm(np.array(points[1]) - np.array(points[5]))
    B = np.linalg.norm(np.array(points[2]) - np.array(points[4]))

    # Horizontal distance
    C = np.linalg.norm(np.array(points[0]) - np.array(points[3]))

    ear = (A + B) / (2.0 * C)

    return ear

# ==========================================
# Webcam Initialization
# ==========================================

cap = cv2.VideoCapture(0)

EAR_THRESHOLD = 0.20

blink_counter = 0
blink_state = False

print("Starting Blink Detection...")
print("Press Q to quit.")

# ==========================================
# Main Loop
# ==========================================

while cap.isOpened():

    success, frame = cap.read()

    if not success:
        print("Failed to access webcam.")
        break

    # Mirror effect
    frame = cv2.flip(frame, 1)

    img_h, img_w = frame.shape[:2]

    rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)

    results = face_mesh.process(rgb_frame)

    status = "NO FACE"

    if results.multi_face_landmarks:

        for face_landmarks in results.multi_face_landmarks:

            landmarks = face_landmarks.landmark

            # ==================================
            # Calculate EAR
            # ==================================

            left_ear = eye_aspect_ratio(
                landmarks,
                LEFT_EYE,
                img_w,
                img_h
            )

            right_ear = eye_aspect_ratio(
                landmarks,
                RIGHT_EYE,
                img_w,
                img_h
            )

            avg_ear = (left_ear + right_ear) / 2.0

            # ==================================
            # Blink Detection Logic
            # ==================================

            if avg_ear < EAR_THRESHOLD:

                status = "BLINK"

                if not blink_state:
                    blink_counter += 1
                    blink_state = True

            else:

                status = "EYES OPEN"
                blink_state = False

            # ==================================
            # Draw Eye Landmarks
            # ==================================

            for idx in LEFT_EYE + RIGHT_EYE:

                x = int(landmarks[idx].x * img_w)
                y = int(landmarks[idx].y * img_h)

                cv2.circle(frame, (x, y), 2, (0,255,0), -1)

            # ==================================
            # Show EAR
            # ==================================

            cv2.putText(
                frame,
                f"EAR: {avg_ear:.2f}",
                (20, 40),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.8,
                (255,255,0),
                2
            )

    # ==========================================
    # Show Status
    # ==========================================

    color = (0,255,0)

    if status == "BLINK":
        color = (0,0,255)

    cv2.putText(
        frame,
        status,
        (20, 90),
        cv2.FONT_HERSHEY_SIMPLEX,
        1,
        color,
        3
    )

    cv2.putText(
        frame,
        f"Blinks: {blink_counter}",
        (20, 140),
        cv2.FONT_HERSHEY_SIMPLEX,
        0.8,
        (255,255,255),
        2
    )

    cv2.imshow("Blink Detection", frame)

    # Quit on Q
    if cv2.waitKey(1) & 0xFF == ord('q'):
        break

# ==========================================
# Cleanup
# ==========================================

cap.release()
cv2.destroyAllWindows()