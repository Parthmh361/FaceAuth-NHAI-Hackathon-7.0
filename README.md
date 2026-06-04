# FaceAuth NHAI Hackathon 7.0

This repository contains the solution for the NHAI Hackathon 7.0, featuring an **offline-first face authentication system** with **real-time liveness detection**. 

## Project Structure

The project is divided into two main parts:
1. **`FaceAuthApp/`**: A React Native mobile application that implements the real-time face authentication frontend. It uses Google ML Kit and VisionCamera Frame Processors to provide real-time UI feedback (bounding boxes, eye/pose status) and isolates heavy ONNX embedding inference to the final capture stage to ensure system stability and hackathon-grade performance.
2. **Python Liveness & Face Recognition Pipelines**: Several Python scripts located in the root directory that act as a testing/benchmarking ground for various liveness and face recognition algorithms.

## Key Features

- **Real-Time Liveness Detection**: Implements various anti-spoofing techniques such as blink detection, head pose detection, smile detection, depth liveness, and passive spoof detection.
- **Offline-First Authentication**: Works entirely offline, ensuring privacy and robust performance without relying on network connectivity.
- **Hybrid Architecture**: Uses lightweight ML Kit models for real-time tracking and bounding boxes, while reserving heavier model inferences (like ONNX) for the precise authentication moment.
- **Cross-Platform Mobile App**: Built with React Native to target mobile devices seamlessly.

## Python Scripts Overview

- `blink_detection.py`: Detects eye blinks to ensure liveness.
- `depth_liveness.py`: Uses depth analysis to prevent 2D photo spoofing.
- `head_pose_detection.py`: Tracks head movements for liveness challenges.
- `smile_detection.py`: Detects smiles as an interactive liveness check.
- `passive_spoof_detection.py`: Additional passive checks to prevent spoofing attacks.
- `compare_faces.py` & `register_user.py`: Core functionality for face matching and registration.
- `combined_pipeline.py` & `benchmark_pipeline.py`: Combines multiple checks and benchmarks their performance.

## Getting Started

### React Native App
Navigate to the `FaceAuthApp` directory to run the mobile app:
```bash
cd FaceAuthApp
npm install
npm run android # or npm run ios
```

### Python Environment
To run the Python scripts, you will need to set up a virtual environment and install the required dependencies (typically OpenCV, mediapipe, deepface, etc.):
```bash
python -m venv venv
source venv/bin/activate # On Windows use: venv\Scripts\activate
# Install your dependencies
```

## License
MIT License
