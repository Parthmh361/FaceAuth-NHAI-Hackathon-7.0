import cv2
import mediapipe as mp
import numpy as np

# ==========================================
# MediaPipe Face Detection
# ==========================================

mp_face_detection = mp.solutions.face_detection

face_detector = mp_face_detection.FaceDetection(
    model_selection=0,
    min_detection_confidence=0.5
)

# ==========================================
# Webcam
# ==========================================

cap = cv2.VideoCapture(0)

print("Starting Depth Liveness Detection...")
print("Move your face closer to the camera.")
print("Press Q to quit.")

# ==========================================
# Variables
# ==========================================

initial_area = None
depth_verified = False

AREA_INCREASE_THRESHOLD = 1.35

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

    results = face_detector.process(rgb_frame)

    status = "NO FACE"

    if results.detections:

        detection = results.detections[0]

        bbox = detection.location_data.relative_bounding_box

        x = int(bbox.xmin * img_w)
        y = int(bbox.ymin * img_h)
        w = int(bbox.width * img_w)
        h = int(bbox.height * img_h)

        # ==================================
        # Face Area
        # ==================================

        face_area = w * h

        # ==================================
        # Store Initial Area
        # ==================================

        if initial_area is None:

            initial_area = face_area

            status = "INITIAL FACE CAPTURED"

        else:

            scale_ratio = face_area / initial_area

            # ==================================
            # Depth Verification
            # ==================================

            if scale_ratio > AREA_INCREASE_THRESHOLD:

                depth_verified = True

                status = "DEPTH VERIFIED"

            else:

                status = "MOVE CLOSER"

            # ==================================
            # Show Ratio
            # ==================================

            cv2.putText(
                frame,
                f"Scale Ratio: {scale_ratio:.2f}",
                (20, 40),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.8,
                (255,255,255),
                2
            )

        # ==================================
        # Draw Face Box
        # ==================================

        color = (0,255,0)

        if not depth_verified:
            color = (0,0,255)

        cv2.rectangle(
            frame,
            (x,y),
            (x+w,y+h),
            color,
            2
        )

    # ==========================================
    # Show Status
    # ==========================================

    cv2.putText(
        frame,
        status,
        (20, 90),
        cv2.FONT_HERSHEY_SIMPLEX,
        1,
        (255,255,0),
        3
    )

    cv2.imshow(
        "Depth Liveness Detection",
        frame
    )

    # Quit
    if cv2.waitKey(1) & 0xFF == ord('q'):
        break

# ==========================================
# Cleanup
# ==========================================

cap.release()
cv2.destroyAllWindows()