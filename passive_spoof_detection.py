import cv2
import numpy as np
import mediapipe as mp

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

print("Starting Passive Spoof Detection...")
print("Press Q to quit.")

# ==========================================
# Utility Functions
# ==========================================

def variance_of_laplacian(image):
    return cv2.Laplacian(
        image,
        cv2.CV_64F
    ).var()

def detect_reflection(gray):

    bright_pixels = np.sum(gray > 240)

    total_pixels = gray.shape[0] * gray.shape[1]

    reflection_ratio = bright_pixels / total_pixels

    return reflection_ratio

# ==========================================
# Main Loop
# ==========================================

while cap.isOpened():

    success, frame = cap.read()

    if not success:
        print("Failed to access webcam.")
        break

    frame = cv2.flip(frame, 1)

    img_h, img_w = frame.shape[:2]

    rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)

    results = face_detector.process(rgb)

    status = "NO FACE"

    if results.detections:

        detection = results.detections[0]

        bbox = detection.location_data.relative_bounding_box

        x = int(bbox.xmin * img_w)
        y = int(bbox.ymin * img_h)
        w = int(bbox.width * img_w)
        h = int(bbox.height * img_h)

        # Ensure valid bounds
        x = max(0, x)
        y = max(0, y)

        face_crop = frame[y:y+h, x:x+w]

        if face_crop.size > 0:

            # ==================================
            # Convert to Grayscale
            # ==================================

            gray = cv2.cvtColor(
                face_crop,
                cv2.COLOR_BGR2GRAY
            )

            # ==================================
            # Texture Sharpness
            # ==================================

            sharpness = variance_of_laplacian(gray)

            # ==================================
            # Reflection Analysis
            # ==================================

            reflection_ratio = detect_reflection(gray)

            # ==================================
            # Brightness Analysis
            # ==================================

            brightness = np.mean(gray)

            # ==================================
            # Passive Spoof Heuristics
            # ==================================

            spoof_score = 0

            # Too smooth / blurry
            if sharpness < 80:
                spoof_score += 1

            # Too reflective
            if reflection_ratio > 0.03:
                spoof_score += 1

            # Very bright screens
            if brightness > 180:
                spoof_score += 1

            # ==================================
            # Final Decision
            # ==================================

            if spoof_score >= 2:

                status = "SPOOF DETECTED"
                color = (0,0,255)

            else:

                status = "REAL FACE"
                color = (0,255,0)

            # ==================================
            # Draw Bounding Box
            # ==================================

            cv2.rectangle(
                frame,
                (x,y),
                (x+w,y+h),
                color,
                2
            )

            # ==================================
            # Show Metrics
            # ==================================

            cv2.putText(
                frame,
                f"Sharpness: {sharpness:.1f}",
                (20,40),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.7,
                (255,255,255),
                2
            )

            cv2.putText(
                frame,
                f"Reflection: {reflection_ratio:.3f}",
                (20,75),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.7,
                (255,255,255),
                2
            )

            cv2.putText(
                frame,
                f"Brightness: {brightness:.1f}",
                (20,110),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.7,
                (255,255,255),
                2
            )

            cv2.putText(
                frame,
                f"Spoof Score: {spoof_score}",
                (20,145),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.7,
                (255,255,255),
                2
            )

            # ==================================
            # Show Final Status
            # ==================================

            cv2.putText(
                frame,
                status,
                (20,190),
                cv2.FONT_HERSHEY_SIMPLEX,
                1,
                color,
                3
            )

    cv2.imshow(
        "Passive Spoof Detection",
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