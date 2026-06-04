import cv2
import mediapipe as mp
import numpy as np

# ==========================================
# MediaPipe FaceMesh
# ==========================================

mp_face_mesh = mp.solutions.face_mesh

face_mesh = mp_face_mesh.FaceMesh(
    max_num_faces=1,
    refine_landmarks=True,
    min_detection_confidence=0.5,
    min_tracking_confidence=0.5
)

# ==========================================
# Landmark IDs
# ==========================================

NOSE_TIP = 1
CHIN = 152
LEFT_FACE = 234
RIGHT_FACE = 454
FOREHEAD = 10

# ==========================================
# Webcam
# ==========================================

cap = cv2.VideoCapture(0)

print("Starting Head Pose Detection...")
print("Turn your head LEFT / RIGHT / UP / DOWN")
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

    direction = "NO FACE"

    if results.multi_face_landmarks:

        for face_landmarks in results.multi_face_landmarks:

            landmarks = face_landmarks.landmark

            # ==================================
            # Get Landmark Coordinates
            # ==================================

            nose_x = int(landmarks[NOSE_TIP].x * img_w)
            nose_y = int(landmarks[NOSE_TIP].y * img_h)

            chin_y = int(landmarks[CHIN].y * img_h)

            left_x = int(landmarks[LEFT_FACE].x * img_w)
            right_x = int(landmarks[RIGHT_FACE].x * img_w)

            forehead_y = int(landmarks[FOREHEAD].y * img_h)

            # ==================================
            # Horizontal Head Pose
            # ==================================

            face_center_x = (left_x + right_x) / 2

            horizontal_offset = nose_x - face_center_x

            # ==================================
            # Vertical Head Pose
            # ==================================

            face_center_y = (forehead_y + chin_y) / 2

            vertical_offset = nose_y - face_center_y

            # ==================================
            # Determine Direction
            # ==================================

            if horizontal_offset > 25:
                direction = "LOOKING RIGHT"

            elif horizontal_offset < -25:
                direction = "LOOKING LEFT"

            elif vertical_offset > 20:
                direction = "LOOKING DOWN"

            elif vertical_offset < -20:
                direction = "LOOKING UP"

            else:
                direction = "LOOKING CENTER"

            # ==================================
            # Draw Key Points
            # ==================================

            cv2.circle(frame, (nose_x, nose_y), 5, (0,0,255), -1)

            cv2.circle(
                frame,
                (left_x, nose_y),
                5,
                (0,255,0),
                -1
            )

            cv2.circle(
                frame,
                (right_x, nose_y),
                5,
                (255,0,0),
                -1
            )

            # ==================================
            # Draw Reference Lines
            # ==================================

            cv2.line(
                frame,
                (int(face_center_x), 0),
                (int(face_center_x), img_h),
                (255,255,0),
                2
            )

            cv2.line(
                frame,
                (0, int(face_center_y)),
                (img_w, int(face_center_y)),
                (255,255,0),
                2
            )

            # ==================================
            # Display Offsets
            # ==================================

            cv2.putText(
                frame,
                f"H Offset: {int(horizontal_offset)}",
                (20, 40),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.7,
                (255,255,255),
                2
            )

            cv2.putText(
                frame,
                f"V Offset: {int(vertical_offset)}",
                (20, 75),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.7,
                (255,255,255),
                2
            )

    # ==========================================
    # Display Direction
    # ==========================================

    color = (0,255,0)

    if "LEFT" in direction:
        color = (255,0,0)

    elif "RIGHT" in direction:
        color = (0,0,255)

    elif "UP" in direction:
        color = (0,255,255)

    elif "DOWN" in direction:
        color = (255,255,0)

    cv2.putText(
        frame,
        direction,
        (20, 130),
        cv2.FONT_HERSHEY_SIMPLEX,
        1,
        color,
        3
    )

    cv2.imshow("Head Pose Detection", frame)

    # Quit
    if cv2.waitKey(1) & 0xFF == ord('q'):
        break

# ==========================================
# Cleanup
# ==========================================

cap.release()
cv2.destroyAllWindows()