# Attendify Lite: Master System Specification & Design System
**Project Codename**: Attendify Lite  
**Document Version**: 2.1.0  
**Target Architecture**: React 19 (Vite) + FastAPI (Python 3.10+) + Supabase PostgreSQL  

---

## 1. Executive Overview & Design Philosophy

**Attendify Lite** is a high-performance, mobile-first classroom management and attendance tracking platform. It replaces heavy machine learning / facial recognition dependencies with cryptographically signed, rotating QR codes paired with role-based user accounts and optional geofencing.

### Key Architectural Tenets:
1. **Zero-Friction Access**: Students scan and claim attendance in < 3 seconds using any smartphone browser.
2. **Cryptographic Anti-Spoofing**: Rotating HMAC-SHA256 QR tokens with 15–30 second lifetimes eliminate remote picture/screenshot sharing.
3. **Multi-Factor Verification**: Optional browser Geofencing (GPS radius check within 50m) and Late-Join grace window calculations.
4. **Aesthetic Excellence**: Built with a state-of-the-art dark mode UI, glassmorphism, dynamic animations, and intuitive micro-interactions.
5. **Real-time Synchronization**: WebSockets / Server-Sent Events (SSE) feed live attendee counts directly to classroom projectors without polling.
6. **100% Free Hosting Ready**: Zero heavy C++ binary requirements—runs seamlessly on Vercel, Netlify, Render, Koyeb, and Supabase.

---

## 2. Design System & UI Specifications

### 2.1 Color Palette & Tokens

Attendify Lite uses a modern, deep dark-mode visual aesthetic with high-contrast status colors.

```css
:root {
  /* Brand Primary (Deep Electric Indigo) */
  --primary: #6366f1;
  --primary-hover: #4f46e5;
  --primary-glow: rgba(99, 102, 241, 0.25);

  /* Backgrounds & Surfaces */
  --bg-app: #090d16;
  --bg-card: rgba(18, 24, 38, 0.75);
  --bg-card-hover: rgba(26, 34, 53, 0.85);
  --bg-input: #111726;

  /* Borders & Dividers */
  --border-subtle: rgba(255, 255, 255, 0.08);
  --border-active: rgba(99, 102, 241, 0.5);

  /* Functional Status Colors */
  --status-present: #10b981;     /* Emerald Green (Marked Present) */
  --status-late: #f59e0b;        /* Amber Gold (Late Join) */
  --status-absent: #ef4444;      /* Rose Red (Absent) */
  --status-info: #3b82f6;        /* Sky Blue (Active Session) */

  /* Text Colors */
  --text-main: #f8fafc;
  --text-muted: #94a3b8;
  --text-subtle: #64748b;
}
```

### 2.2 Typography Hierarchy

* **Primary Font**: `Inter` or `Geist Variable` from Google Fonts.
* **Monospace Font** (for Join Codes & Tokens): `JetBrains Mono` or `Fira Code`.

| Level | Size | Weight | Usage |
| :--- | :--- | :--- | :--- |
| **Display 1** | `2.5rem (40px)` | Bold (700) | Live QR Session Counter |
| **Heading 1** | `1.875rem (30px)` | SemiBold (600) | Page Titles, Dashboard Headers |
| **Heading 2** | `1.5rem (24px)` | Medium (500) | Course Card Titles, Modal Headers |
| **Body** | `1.0rem (16px)` | Regular (400) | Form Inputs, Roster Tables |
| **Small / Badge** | `0.875rem (14px)` | Medium (500) | Status Pills, Time Timestamps |
| **Code / Token** | `1.25rem (20px)` | Monospace (700) | 8-Character Course Join Codes |

---

### 2.3 Component Specifications

#### A. Rotating QR Projector Container (Instructor View)
* **Visual Style**: Large centered card (`380px x 380px`) with a neon indigo radial glow background.
* **Countdown Ring**: Circular SVG progress bar showing remaining seconds (30s ➔ 0s) before auto-rotating.
* **Realtime Feed Integration**: Live WebSocket connection rendering check-in avatars as they occur.

#### B. Mobile QR Camera Scanner (Student View)
* **Overlay**: Fullscreen modal overlay with dark backdrop blur (`backdrop-filter: blur(12px)`).
* **Viewfinder**: Square scanning reticle (`260px x 260px`) with animated green corner brackets.
* **GPS Check (Optional)**: Requests `navigator.geolocation.getCurrentPosition()` prior to token payload submission.
* **Scan Feedback**: Trigger haptic vibration (`navigator.vibrate(200)`) and display status modal (`PRESENT` = Green Checkmark, `LATE` = Amber Clock).

#### C. Status Badges
* `PRESENT`: Emerald background (`#10b98120`), green text, checkmark icon.
* `LATE`: Amber background (`#f59e0b20`), gold text, clock icon.
* `ABSENT`: Rose background (`#ef444420`), red text, cross icon.

---

## 3. Database Schema (Production PostgreSQL Specification)

```sql
-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Users Table
CREATE TABLE public.users (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(255) NOT NULL UNIQUE,
    hashed_password VARCHAR(255) NOT NULL,
    role VARCHAR(20) NOT NULL CHECK (role IN ('INSTRUCTOR', 'STUDENT')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Revoked / Blacklisted Tokens (JWT Revocation Path)
CREATE TABLE public.revoked_tokens (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    jti VARCHAR(255) NOT NULL UNIQUE,
    revoked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL
);

-- 3. Courses Table (Supports Optional Geofence Lat/Long)
CREATE TABLE public.courses (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name VARCHAR(150) NOT NULL,
    code VARCHAR(50) NOT NULL UNIQUE,
    join_code VARCHAR(8) NOT NULL UNIQUE,
    instructor_id BIGINT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    latitude DOUBLE PRECISION,             -- Optional Classroom Geofence Latitude
    longitude DOUBLE PRECISION,            -- Optional Classroom Geofence Longitude
    geofence_radius_meters INT DEFAULT 50, -- Allowed distance tolerance (default 50 meters)
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. Course Enrollments Junction Table
CREATE TABLE public.course_enrollments (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    course_id BIGINT NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
    student_id BIGINT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    enrolled_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_course_student UNIQUE (course_id, student_id)
);

-- 5. Attendance Sessions Table
CREATE TABLE public.sessions (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    course_id BIGINT NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
    session_secret VARCHAR(64) NOT NULL,
    late_threshold_minutes INT NOT NULL DEFAULT 10, -- Scans after N minutes marked as LATE
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ended_at TIMESTAMPTZ,
    is_active BOOLEAN NOT NULL DEFAULT TRUE
);

-- 6. Attendance Records Table
CREATE TABLE public.attendance (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    session_id BIGINT NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
    student_id BIGINT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    status VARCHAR(20) NOT NULL DEFAULT 'PRESENT' CHECK (status IN ('PRESENT', 'LATE', 'EXCUSED')),
    student_latitude DOUBLE PRECISION,
    student_longitude DOUBLE PRECISION,
    verified_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_session_student_attendance UNIQUE (session_id, student_id)
);

-- Indexes for Fast Querying
CREATE INDEX idx_users_email ON public.users(email);
CREATE INDEX idx_courses_join_code ON public.courses(join_code);
CREATE INDEX idx_sessions_course ON public.sessions(course_id);
CREATE INDEX idx_sessions_active ON public.sessions(is_active);
CREATE INDEX idx_attendance_session ON public.attendance(session_id);
CREATE INDEX idx_attendance_student ON public.attendance(student_id);
```

---

## 4. Cryptographic Engine & Security Architecture

### 4.1 HMAC-SHA256 Token Rotation Algorithm
1. **Secret Key**: Every session creates a cryptographically random `session_secret` (32 bytes).
2. **Time Slice**: Time is divided into 15-second windows (`time_slice = unix_timestamp // 15`).
3. **Token Sign**: `token = HMAC_SHA256(session_secret, session_id + time_slice)`.
4. **Validation Window**: The backend accepts tokens from `time_slice` and `time_slice - 1` (30s grace period).

### 4.2 Rate Limiting & Anti-Bruteforce Defense
To prevent automated script attacks guessing tokens:
* **Endpoint Protection**: `/api/attendance/scan` enforces a strict rate limit of **5 requests per minute per IP / User ID** (using `slowapi` or Redis token bucket).

### 4.3 Geofencing Distance Calculation (Haversine Formula)
If a course has `latitude` and `longitude` defined, `/api/attendance/scan` calculates distance:
$$\text{distance} = 2r \arcsin \left( \sqrt{\sin^2\left(\frac{\Delta \phi}{2}\right) + \cos(\phi_1)\cos(\phi_2)\sin^2\left(\frac{\Delta \lambda}{2}\right)} \right)$$
If $\text{distance} > \text{geofence\_radius\_meters}$, the scan is rejected with HTTP 403 (`"Outside classroom boundary"`).

```mermaid
sequenceDiagram
    autonumber
    actor Instructor
    actor Student
    participant Frontend
    participant Backend
    participant WebSocket
    participant Database

    Instructor->>Frontend: Click "Start Session"
    Frontend->>Backend: POST /api/sessions/start {course_id, late_threshold_minutes}
    Backend->>Database: Create Session & Secret
    Backend-->>Frontend: Session Started (ID: 101)
    
    Frontend->>WebSocket: Connect WS /ws/sessions/101/live-feed
    
    Student->>Frontend: Scan QR Code (Gps Lat/Lng attached)
    Frontend->>Backend: POST /api/attendance/scan {token, session_id, lat, lng} (Rate Limited)
    
    alt Rate Limit Exceeded
        Backend-->>Frontend: HTTP 429 "Too Many Requests"
    else Token & GPS Valid
        Backend->>Database: Calculate Late vs Present & INSERT Record
        alt Idempotent Check (Already Claimed)
            Database-->>Backend: Duplicate Key Warning
            Backend-->>Frontend: HTTP 200 { status: "ALREADY_RECORDED", verified_at }
        else First Claim Success
            Database-->>Backend: Insert OK (status: 'PRESENT' or 'LATE')
            Backend-->>WebSocket: Broadcast Event { student_name, status, timestamp }
            WebSocket-->>Frontend: Animate Student Badge on Projector Screen!
            Backend-->>Frontend: HTTP 200 { status: "PRESENT", verified_at }
        end
    end
```

---

## 5. Complete API Endpoint Specifications

### 5.1 Authentication (`/api/auth`)
* `POST /api/auth/register` — Register User (`name`, `email`, `password`, `role`).
* `POST /api/auth/login` — Returns Short-Lived Access Token (15 mins) + Refresh Token (7 days).
* `POST /api/auth/refresh` — Issue new short-lived access token using valid refresh token.
* `POST /api/auth/logout` — Revoke active token (adds JWT ID `jti` to `revoked_tokens` table).
* `GET /api/auth/me` — Fetch active user profile.

### 5.2 Courses (`/api/courses`)
* `POST /api/courses` — Create Course (Instructor). Includes optional `latitude`, `longitude`, `geofence_radius_meters`.
* `GET /api/courses` — List user's courses.
* `POST /api/courses/join` — Join course via 8-character `join_code` (Student).
* `GET /api/courses/{id}/roster` — Fetch enrolled roster with overall student attendance rates (Instructor).
* `POST /api/courses/{id}/import-roster` — Bulk CSV import of student emails for auto-enrollment (Instructor).
* `GET /api/courses/{id}/export-matrix` — Download course-wide attendance matrix (CSV).

### 5.3 Sessions (`/api/sessions`)
* `POST /api/sessions/start` — Start new attendance session (`course_id`, `late_threshold_minutes`).
* `GET /api/sessions/{id}/qr` — Fetch rotating QR code token (Base64).
* `POST /api/sessions/{id}/end` — **Close Active Session** (Flips `is_active = false`, sets `ended_at = NOW()`).
* `GET /api/sessions/{id}/export` — **Export Session CSV** (`student_name`, `email`, `verified_at`, `status`).

### 5.4 Attendance & Student Stats (`/api/attendance`, `/api/students`)
* `POST /api/attendance/scan` — Submit QR payload (`session_id`, `token`, optional `lat`, `lng`).  
  * **Idempotent Handling**: Re-scanning returns HTTP 200 with `{ "status": "ALREADY_RECORDED", "message": "Attendance already recorded for this session" }`.
* `GET /api/students/attendance-history` — Fetch student's global and per-course attendance stats (e.g. `94% Overall`).
* `WS /ws/sessions/{id}/live-feed` — WebSocket endpoint pushing real-time check-in events to instructor projector screen.

---

## 6. Directory Structure & File Organization

```
attendify-lite/
├── app/                          # FastAPI Backend
│   ├── api/                      # Route Handlers
│   │   ├── auth.py               # Auth, Refresh, Revocation
│   │   ├── courses.py            # Course CRUD, Roster, Bulk CSV
│   │   ├── sessions.py           # Start/End Session, QR Engine, CSV Export
│   │   ├── attendance.py         # Scan QR (Idempotent), Rates, Geofence
│   │   └── websockets.py         # Realtime Projector Feed WS
│   ├── core/                     # Configurations & Security
│   │   ├── config.py             # Env Variables (Settings)
│   │   ├── security.py           # JWT Hashing, Revocation Checks
│   │   ├── rate_limiter.py       # Slowapi Rate Limiting
│   │   └── qr_engine.py          # HMAC-SHA256 & Haversine Distance
│   ├── db/                       # Database Setup
│   │   └── database.py           # SQLAlchemy Engine & Session
│   ├── models/                   # SQLAlchemy Models
│   │   └── models.py             # User, Course, Session, Attendance, RevokedToken
│   ├── schemas/                  # Pydantic Request/Response DTOs
│   │   └── schemas.py
│   └── main.py                   # FastAPI Application Entrypoint
│
├── frontend/                     # React 19 + Vite Frontend
│   ├── src/
│   │   ├── components/           # Reusable UI Components
│   │   │   ├── ui/               # Buttons, Cards, Inputs, Badges
│   │   │   ├── QRProjector.tsx   # Rotating QR + WebSocket Live Roster
│   │   │   └── QRScanner.tsx     # Mobile Camera + Geolocation Scanner
│   │   ├── pages/                # Application Views
│   │   │   ├── AuthPage.tsx      # Login / Signup
│   │   │   ├── InstructorDash.tsx# Courses, Roster, Bulk Import
│   │   │   ├── LiveSession.tsx   # Projector View with WS Stream
│   │   │   └── StudentDash.tsx   # Attendance Stats & Scan FAB
│   │   ├── services/             # Axios / Fetch API Clients
│   │   │   └── api.ts
│   │   ├── types/                # TypeScript Interfaces
│   │   │   └── database.types.ts
│   │   ├── App.tsx               # Router Setup
│   │   └── main.tsx              # React Root
│   ├── index.html
│   ├── package.json
│   ├── tailwind.config.js
│   └── vite.config.ts
│
├── Dockerfile                    # Containerization Spec
├── requirements.txt              # Python Dependencies
└── README.md
```

---

## 7. Step-by-Step 100% Free Cloud Deployment Setup

| Component | Host | Free Tier Plan |
| :--- | :--- | :--- |
| **Frontend** | **Vercel** | Unlimited Bandwidth, Global CDN, SSL |
| **Backend** | **Koyeb / Render / Hugging Face** | Python FastAPI Container |
| **Database** | **Supabase** | 500MB PostgreSQL Database |

### Environment Variables Template (`.env.example`)

```env
# Backend Environment (.env.example)
SECRET_KEY=REPLACE_WITH_YOUR_32_CHARACTER_SECRET_KEY_HERE
DATABASE_URL=postgresql://postgres:<YOUR_PASSWORD>@db.<YOUR_PROJECT_REF>.supabase.co:5432/postgres
JWT_ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=15
REFRESH_TOKEN_EXPIRE_DAYS=7
ALLOWED_ORIGINS=https://your-frontend.vercel.app,http://localhost:5173

# Frontend Environment (frontend/.env.example)
VITE_API_BASE_URL=https://your-backend.koyeb.app
VITE_WS_BASE_URL=wss://your-backend.koyeb.app
```
