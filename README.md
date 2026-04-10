# Attendify

Attendify is a modern, privacy-focused facial recognition attendance system. It enables instructors to securely manage classroom attendance via dynamic QR codes and guided face enrollment, completely eliminating the need for manual roll calls or static, easily spoofed attendance sheets.

Built as a hybrid system with a robust Python/FastAPI backend and a responsive React/Vite frontend, Attendify provides a seamless, secure, and intuitive experience for both instructors and students.

## Features

*   **Dynamic QR Attendance**: Instructors generate rotating QR codes that students scan to prove physical presence.
*   **Guided Face Enrollment**: Students enroll their faces through a guided, multi-angle workflow using MediaPipe for real-time validation and feedback.
*   **Liveness & Spoofing Mitigation**: The combination of time-limited, instructor-generated QR sessions and multi-photo face embeddings ensures high confidence in presence verification.
*   **Privacy-First Design**: Raw face images are never stored in the database. Only generated 128-d numerical embeddings are kept.
*   **Robust Backend**: Built on FastAPI with SQLAlchemy, featuring token-based HMAC verification for session validation.
*   **Modern Frontend**: Responsive, mobile-first React UI powered by Vite, TailwindCSS, and shadcn/ui.

## Tech Stack

*   **Frontend**: React, TypeScript, Vite, TailwindCSS, Lucide Icons, MediaPipe (Face Detection)
*   **Backend**: Python, FastAPI, SQLAlchemy, SQLite (Development), face_recognition (dlib)
*   **Deployment**: Docker, Docker Compose

## Quick Start

### Prerequisites
*   Docker and Docker Compose
*   Node.js (for local frontend development)
*   Python 3.10+ (for local backend development)

### Running with Docker (Recommended)

1.  Clone the repository:
    ```bash
    git clone https://github.com/yourusername/attendify.git
    cd attendify
    ```

2.  Create your `.env` file from the example:
    ```bash
    cp .env.example .env
    # Edit .env and set a secure 32+ character SECRET_KEY
    ```

3.  Build and start the services:
    ```bash
    docker-compose up --build
    ```

4.  Access the application:
    *   Instructor Dashboard: `http://localhost:8000/ui` (Wait, it's `http://localhost:5173` locally, or served via FastAPI if built)
    *   Frontend UI: `http://localhost:5173` (if running dev server)

### Local Development Setup

#### Backend Network

1.  Create a virtual environment and install dependencies:
    ```bash
    python -m venv venv
    source venv/bin/activate  # On Windows: venv\Scripts\activate
    pip install -r requirements.txt
    ```

2.  Start the FastAPI server:
    ```bash
    uvicorn main:app --reload --port 8000
    ```

#### Frontend Setup

1.  Navigate to the frontend directory:
    ```bash
    cd frontend
    ```

2.  Install dependencies:
    ```bash
    npm install
    ```

3.  Start the development server:
    ```bash
    npm run dev
    ```

## Security & Architecture

Attendify addresses several critical security vectors common in physical tracking systems:

1.  **CORS Vulnerabilities**: Locked down to explicit allowed origins via `.env`.
2.  **Attendance Spoofing**: Students cannot record attendance remotely. They must scan a short-lived QR code projected by the instructor, which contains a cryptographically signed HMAC token.
3.  **Data Privacy**: Uses irreversible 128-dimensional encodings. Zero actual photos are retained in the database.
4.  **Database Guards**: Unique constraints and multi-column primary keys prevent overlapping or duplicate attendance records.

## License

This project is licensed under the MIT License.
