# Attendify Lite: Master System Specification & Design System
**Project Codename**: Attendify Lite  
**Document Version**: 2.3.0  
**Target Architecture**: React 19 (Vite) + FastAPI (Python 3.10+) + Supabase PostgreSQL  

---

## 1. Executive Overview & Design Philosophy

**Attendify Lite** is a high-performance, mobile-first classroom management and attendance tracking platform. It replaces heavy machine learning / facial recognition dependencies with cryptographically signed, rotating QR codes paired with verified student onboarding and dynamic instructor-anchored geofencing.

### Key Architectural Tenets:
1. **One-Time Identity Onboarding**: Verified registration collecting Egyptian National ID (validated via 14-digit self-encoding checksum) and Phone OTP.
2. **Sub-Second Fast-Path Scanning**: After onboarding, daily attendance claims require zero personal data re-entry—just a single tap (Camera + GPS grab).
3. **PII Protection by Design**: Egyptian National IDs are stored as salted SHA-256 hashes (`national_id_hash`), preventing identity leaks.
4. **Cryptographic Anti-Spoofing**: Rotating HMAC-SHA256 QR tokens with 15–30 second lifetimes eliminate remote picture/screenshot sharing.
5. **Dynamic Instructor Geofence Anchor**: When starting a session, the instructor's device location becomes the live anchor point ($1\,\text{km}$ default radius).
6. **Real-time Synchronization**: WebSockets / Server-Sent Events (SSE) feed live attendee counts directly to classroom projectors without polling.
7. **100% Free Hosting Ready**: Zero heavy C++ binary requirements—runs seamlessly on Vercel, Netlify, Render, Koyeb, and Supabase.

---

## 2. Onboarding & Identity Verification Specification

### 2.1 One-Time Registration Payload & Validation

During registration, students provide their official identity details once:

```json
POST /api/auth/register
{
  "full_name_ar": "أحمد محمد علي",
  "email": "ahmed.ali@compit.aun.edu.eg",
  "password": "SecurePassword123!",
  "national_id": "30105151201234",
  "phone_number": "+201012345678",
  "role": "STUDENT"
}
```

---

### 2.2 Egyptian National ID Self-Encoding Validation Algorithm

The Egyptian 14-digit National ID self-encodes birth date, century, governorate of birth, and gender. The backend validates this string format prior to hashing:

```python
import datetime

def validate_egyptian_national_id(nid: str) -> tuple[bool, str]:
    if len(nid) != 14 or not nid.isdigit():
        return False, "National ID must be exactly 14 numeric digits"
    
    # 1. Century Parsing
    century_digit = nid[0]
    if century_digit not in ("2", "3"):
        return False, "Invalid century indicator"
    
    century = 1900 if century_digit == "2" else 2000
    year = century + int(nid[1:3])
    month = int(nid[3:5])
    day = int(nid[5:7])
    
    # 2. Date Plausibility Check
    try:
        birth_date = datetime.date(year, month, day)
    except ValueError:
        return False, "Invalid birth date encoded in National ID"
    
    # 3. Student Age Range Verification (17 to 35 years old)
    today = datetime.date.today()
    age = today.year - birth_date.year - ((today.month, today.day) < (birth_date.month, birth_date.day))
    if not (17 <= age <= 35):
        return False, f"Age derived from National ID ({age}) is out of university student range"
    
    # 4. Governorate Code Verification (01-88 range)
    gov_code = int(nid[7:9])
    valid_gov_codes = {1, 2, 3, 4, 11, 12, 13, 14, 15, 16, 17, 18, 19, 21, 22, 23, 24, 25, 26, 27, 28, 29, 31, 32, 33, 34, 35, 88}
    if gov_code not in valid_gov_codes:
        return False, "Invalid governorate code in National ID"
        
    return True, "Valid"
```

---

### 2.3 PII Protection & Hash Storage Strategy

> [!CAUTION]
> **Data Privacy Mandate**: Plaintext National IDs are sensitive Personally Identifiable Information (PII) in Egypt. **Never store plaintext National IDs** in database columns or log files.

1. **Salted Hash Storage**: Store `national_id_hash = SHA256(national_id + PEPPER_SECRET)` with a `UNIQUE` index in PostgreSQL.
2. **Uniqueness Check**: Attempts to register a duplicated National ID will be rejected at the database level without exposing student PII.
3. **Optional AES-256 Encryption**: If official university administration requires plaintext auditing, store in `encrypted_national_id` encrypted at rest using AES-256-GCM.

---

## 3. Database Schema (Production PostgreSQL Specification)

```sql
-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Users Table (Includes Arabic Name, Salted NID Hash, & Phone Verification)
CREATE TABLE public.users (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    full_name_ar VARCHAR(150),                          -- Official Arabic Name
    email VARCHAR(255) NOT NULL UNIQUE,
    hashed_password VARCHAR(255) NOT NULL,
    national_id_hash VARCHAR(64) UNIQUE,                -- Salted SHA-256 Hash of NID
    phone_number VARCHAR(20) NOT NULL,                  -- Phone Number (+20...)
    phone_verified BOOLEAN NOT NULL DEFAULT FALSE,       -- OTP Status
    role VARCHAR(20) NOT NULL CHECK (role IN ('INSTRUCTOR', 'STUDENT')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Revoked Tokens Table (JWT Logout & Revocation)
CREATE TABLE public.revoked_tokens (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    jti VARCHAR(255) NOT NULL UNIQUE,
    revoked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL
);

-- 3. Courses Table
CREATE TABLE public.courses (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name VARCHAR(150) NOT NULL,
    code VARCHAR(50) NOT NULL UNIQUE,
    join_code VARCHAR(8) NOT NULL UNIQUE,
    instructor_id BIGINT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
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

-- 5. Attendance Sessions Table (Dynamic Instructor Geofence Anchor)
CREATE TABLE public.sessions (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    course_id BIGINT NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
    session_secret VARCHAR(64) NOT NULL,
    late_threshold_minutes INT NOT NULL DEFAULT 10,
    instructor_lat DOUBLE PRECISION,                     -- Live Anchor Latitude
    instructor_lng DOUBLE PRECISION,                     -- Live Anchor Longitude
    geofence_radius_m INT NOT NULL DEFAULT 1000,         -- 1000m (1km) Campus Radius
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
    student_lat DOUBLE PRECISION,                        -- Scanned Geolocation
    student_lng DOUBLE PRECISION,
    distance_from_instructor_m DOUBLE PRECISION,         -- Computed Distance
    verified_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_session_student_attendance UNIQUE (session_id, student_id)
);

-- Indexes for Fast Querying
CREATE INDEX idx_users_email ON public.users(email);
CREATE INDEX idx_users_national_id ON public.users(national_id_hash);
CREATE INDEX idx_courses_join_code ON public.courses(join_code);
CREATE INDEX idx_sessions_course ON public.sessions(course_id);
CREATE INDEX idx_sessions_active ON public.sessions(is_active);
CREATE INDEX idx_attendance_session ON public.attendance(session_id);
CREATE INDEX idx_attendance_student ON public.attendance(student_id);
```

---

## 4. Sub-Second Fast-Path Scanning & Security Architecture

### 4.1 Daily Fast-Path Attendance Claim Workflow

Once onboarded, students execute the attendance claim in **under 500 milliseconds**:

1. **Student opens mobile app**: Authenticated JWT session is already active.
2. **Tap "Scan QR Code"**: Camera viewfinder opens and captures current GPS coordinates (`student_lat`, `student_lng`).
3. **Single POST Payload**:
   ```json
   POST /api/attendance/scan
   Headers: Authorization: Bearer <JWT_TOKEN>
   {
     "session_id": 101,
     "token": "abc123hmac",
     "lat": 30.0444,
     "lng": 31.2357
   }
   ```
4. **Backend Instant Checks (< 50ms)**:
   * Decodes student identity from JWT (`student_id`).
   * Validates HMAC token signature & time slice.
   * Calculates Haversine distance against `session.instructor_lat/lng` ($\le 1000\,\text{m}$).
   * Inserts attendance record (`status = 'PRESENT'` or `'LATE'`).
5. **Instant UI Feedback**: Screen flashes green, phone vibrates, attendance recorded!

---

### 4.2 Realistic Threat Model Matrix

```
+-----------------------------------------------------------------------------------------+
|                                    THREAT MODEL MATRIX                                  |
+-----------------------------------------------------------------------------------------+
| Threat Vector                  | Mitigated By                | Protection Status        |
+--------------------------------+-----------------------------+--------------------------+
| Fake/Duplicate Registration    | 14-Digit Egyptian NID Check | FULLY PREVENTED          |
| (Student creates fake account) | & Salted Hash Uniqueness    |                          |
+--------------------------------+-----------------------------+--------------------------+
| Off-Campus Remote QR Sharing   | 1000m Geofence Check        | FULLY PREVENTED          |
| (Student in another city/dorm) |                             |                          |
+--------------------------------+-----------------------------+--------------------------+
| Screenshot Texting             | 15-second Rotating HMAC     | FULLY PREVENTED          |
| (Student sends photo)          | Token                       |                          |
+--------------------------------+-----------------------------+--------------------------+
| In-Class Friend Proxy          | Requires physical device or | Partially Mitigated      |
| (Friend scans inside room)     | account sharing             | (Needs Biometrics/ML)    |
+--------------------------------+-----------------------------+--------------------------+
```

---

## 5. Complete API Endpoint Specifications

### 5.1 Authentication (`/api/auth`)
* `POST /api/auth/register` — Register User (`full_name_ar`, `email`, `password`, `national_id`, `phone_number`, `role`). Validates NID checksum & hashes NID.
* `POST /api/auth/verify-phone` — Verify phone number via 6-digit OTP code (`phone_verified = true`).
* `POST /api/auth/login` — Returns Short-Lived Access Token (15 mins) + Refresh Token (7 days).
* `POST /api/auth/refresh` — Issue new short-lived access token using valid refresh token.
* `POST /api/auth/logout` — Revoke active token (`jti` added to `revoked_tokens`).
* `GET /api/auth/me` — Fetch active user profile.

### 5.2 Courses (`/api/courses`)
* `POST /api/courses` — Create Course (Instructor).
* `GET /api/courses` — List user's courses.
* `POST /api/courses/join` — Join course via 8-character `join_code` (Student).
* `GET /api/courses/{id}/roster` — Enrolled roster with Arabic names & attendance rates (Instructor).
* `POST /api/courses/{id}/import-roster` — Bulk CSV import of student emails/NIDs (Instructor).
* `GET /api/courses/{id}/export-matrix` — Download course-wide attendance matrix (CSV).

### 5.3 Sessions (`/api/sessions`)
* `POST /api/sessions/start` — Start attendance session (`course_id`, `instructor_lat`, `instructor_lng`, `geofence_radius_m`).
* `GET /api/sessions/{id}/qr` — Fetch active rotating QR code token.
* `POST /api/sessions/{id}/end` — Close session (`is_active = false`, `ended_at = NOW()`).
* `GET /api/sessions/{id}/export` — Export Session CSV (`student_name_ar`, `email`, `verified_at`, `status`, `distance_m`).

### 5.4 Attendance & Student Stats (`/api/attendance`, `/api/students`)
* `POST /api/attendance/scan` — Submit fast-path QR payload (`session_id`, `token`, `lat`, `lng`).
* `GET /api/students/attendance-history` — Fetch student's global and per-course attendance stats (e.g. `94% Overall`).
* `WS /ws/sessions/{id}/live-feed` — WebSocket streaming real-time check-ins to instructor screen.

---

## 6. Step-by-Step 100% Free Cloud Deployment Setup

| Component | Host | Free Tier Plan |
| :--- | :--- | :--- |
| **Frontend** | **Vercel** | Unlimited Bandwidth, Global CDN, SSL |
| **Backend** | **Koyeb / Render / Hugging Face** | Python FastAPI Container |
| **Database** | **Supabase** | 500MB PostgreSQL Database |

### Environment Variables Template (`.env.example`)

```env
# Backend Environment (.env.example)
SECRET_KEY=REPLACE_WITH_YOUR_32_CHARACTER_SECRET_KEY_HERE
PEPPER_SECRET=REPLACE_WITH_A_RANDOM_32_CHAR_PEPPER_FOR_NID_HASHING
DATABASE_URL=postgresql://postgres:<YOUR_PASSWORD>@db.<YOUR_PROJECT_REF>.supabase.co:5432/postgres
JWT_ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=15
REFRESH_TOKEN_EXPIRE_DAYS=7
ALLOWED_ORIGINS=https://your-frontend.vercel.app,http://localhost:5173

# Frontend Environment (frontend/.env.example)
VITE_API_BASE_URL=https://your-backend.koyeb.app
VITE_WS_BASE_URL=wss://your-backend.koyeb.app
```
