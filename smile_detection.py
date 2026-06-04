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
# Mouth Landmark IDs
# ==========================================

LEFT_MOUTH = 61
RIGHT_MOUTH = 291
UPPER_LIP = 13
LOWER_LIP = 14

# ==========================================
# Webcam Initialization
# ==========================================

cap = cv2.VideoCapture(0)

print("Starting Improved Smile Detection...")
print("Smile naturally to test.")
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

    smile_status = "NO FACE"

    if results.multi_face_landmarks:

        for face_landmarks in results.multi_face_landmarks:

            landmarks = face_landmarks.landmark

            # ==================================
            # Get Mouth Coordinates
            # ==================================

            left_x = int(landmarks[LEFT_MOUTH].x * img_w)
            left_y = int(landmarks[LEFT_MOUTH].y * img_h)

            right_x = int(landmarks[RIGHT_MOUTH].x * img_w)
            right_y = int(landmarks[RIGHT_MOUTH].y * img_h)

            upper_x = int(landmarks[UPPER_LIP].x * img_w)
            upper_y = int(landmarks[UPPER_LIP].y * img_h)

            lower_x = int(landmarks[LOWER_LIP].x * img_w)
            lower_y = int(landmarks[LOWER_LIP].y * img_h)

            # ==================================
            # Calculate Mouth Measurements
            # ==================================

            mouth_width = np.linalg.norm(
                np.array([left_x, left_y]) -
                np.array([right_x, right_y])
            )

            mouth_height = np.linalg.norm(
                np.array([upper_x, upper_y]) -
                np.array([lower_x, lower_y])
            )

            smile_ratio = mouth_width / (mouth_height + 1)

            # ==================================
            # Improved Smile Detection Logic
            # ==========================================

            # These values may vary slightly depending on webcam
            WIDTH_THRESHOLD = 70
            HEIGHT_THRESHOLD = 10
            RATIO_THRESHOLD = 4.8

            if (
                mouth_width > WIDTH_THRESHOLD and
                mouth_height > HEIGHT_THRESHOLD and
                smile_ratio > RATIO_THRESHOLD
            ):

                smile_status = "SMILING"
                color = (0, 255, 0)

            else:

                smile_status = "NOT SMILING"
                color = (0, 0, 255)

            # ==================================
            # Draw Mouth Points
            # ==========================================

            cv2.circle(frame, (left_x, left_y), 4, (255,0,0), -1)
            cv2.circle(frame, (right_x, right_y), 4, (255,0,0), -1)

            cv2.circle(frame, (upper_x, upper_y), 4, (0,255,0), -1)
            cv2.circle(frame, (lower_x, lower_y), 4, (0,255,0), -1)

            # ==================================
            # Display Metrics
            # ==========================================

            cv2.putText(
                frame,
                f"Width: {mouth_width:.1f}",
                (20, 40),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.7,
                (255,255,255),
                2
            )

            cv2.putText(
                frame,
                f"Height: {mouth_height:.1f}",
                (20, 75),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.7,
                (255,255,255),
                2
            )

            cv2.putText(
                frame,
                f"Ratio: {smile_ratio:.2f}",
                (20, 110),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.7,
                (255,255,255),
                2
            )

            # ==================================
            # Display Smile Status
            # ==========================================

            cv2.putText(
                frame,
                smile_status,
                (20, 160),
                cv2.FONT_HERSHEY_SIMPLEX,
                1,
                color,
                3
            )

    # ==========================================
    # Show Window
    # ==========================================

    cv2.imshow("Improved Smile Detection", frame)

    # Quit on Q
    if cv2.waitKey(1) & 0xFF == ord('q'):
        break

# ==========================================
# Cleanup
# ==========================================

cap.release()
cv2.destroyAllWindows()