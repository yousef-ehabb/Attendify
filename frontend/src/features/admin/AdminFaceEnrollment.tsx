/**
 * AdminFaceEnrollment — register a student then capture 3-5 face
 * photos using the useNativeCamera hook.
 *
 * Two-step flow:
 *   Step 1 — Registration form (name + email)
 *   Step 2 — Live camera preview, capture thumbnails, submit to
 *            POST /api/students/{id}/enroll-face
 */

import { useCallback, useRef, useState } from "react";
import { useNativeCamera } from "../../hooks/useNativeCamera";

/* ── constants ──────────────────────────────────────────────── */

const MIN_PHOTOS = 3;
const MAX_PHOTOS = 5;

/* ── component ──────────────────────────────────────────────── */

export function AdminFaceEnrollment() {
  // Registration state
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [studentId, setStudentId] = useState<number | null>(null);
  const [registerError, setRegisterError] = useState<string | null>(null);
  const [enrollError, setEnrollError] = useState<string | null>(null);
  const [isRegistering, setIsRegistering] = useState(false);
  const [isEnrolling, setIsEnrolling] = useState(false);
  const [enrolled, setEnrolled] = useState(false);

  // Captured images
  const [images, setImages] = useState<string[]>([]);

  // Video ref — passed directly to the camera hook
  const videoRef = useRef<HTMLVideoElement>(null);

  // Camera hook — all stream management lives here, outside React renders
  const {
    error: cameraError,
    isReady,
    stop: stopCamera,
    captureFrame,
  } = useNativeCamera(videoRef, { facingMode: "user", muted: true });

  /* ── Step 1: Register student ───────────────────────────── */

  const handleRegister = useCallback(async () => {
    if (!name.trim() || !email.trim()) {
      setRegisterError("Please fill in both name and email.");
      return;
    }
    setRegisterError(null);
    setIsRegistering(true);

    try {
      const res = await fetch("/api/students/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), email: email.trim() }),
      });
      const data = await res.json();

      if (!res.ok) {
        setRegisterError(data.detail ?? "Registration failed.");
        return;
      }

      setStudentId(data.id);
      // Transition to step 2 — the camera hook auto-starts via its effect
      // once the video ref is attached in the step-2 view.
    } catch {
      setRegisterError("Network error. Please try again.");
    } finally {
      setIsRegistering(false);
    }
  }, [name, email]);

  /* ── Step 2: Capture a photo ────────────────────────────── */

  const handleCapture = useCallback(() => {
    if (images.length >= MAX_PHOTOS) return;
    const frame = captureFrame();
    if (!frame) return;
    setImages((prev) => [...prev, frame]);
  }, [captureFrame, images.length]);

  const handleRetake = useCallback(() => {
    setImages((prev) => prev.slice(0, -1));
  }, []);

  /* ── Step 2: Submit enrollment ──────────────────────────── */

  const handleSubmit = useCallback(async () => {
    if (images.length < MIN_PHOTOS || studentId === null) return;
    setEnrollError(null);
    setIsEnrolling(true);

    try {
      const res = await fetch(`/api/students/${studentId}/enroll-face`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ images }),
      });
      const data = await res.json();

      if (!res.ok) {
        setEnrollError(data.detail ?? "Enrollment failed. Please try again.");
        return;
      }

      setEnrolled(true);
      stopCamera();
    } catch {
      setEnrollError("Network error. Please try again.");
    } finally {
      setIsEnrolling(false);
    }
  }, [images, studentId, stopCamera]);

  /* ── Reset to start over ────────────────────────────────── */

  const handleReset = useCallback(() => {
    setStudentId(null);
    setName("");
    setEmail("");
    setImages([]);
    setRegisterError(null);
    setEnrollError(null);
    setEnrolled(false);
    stopCamera();
  }, [stopCamera]);

  /* ── Derived UI values ──────────────────────────────────── */

  const photoCount = images.length;
  const progressPct = (photoCount / MAX_PHOTOS) * 100;
  const canEnroll = photoCount >= MIN_PHOTOS && studentId !== null;

  const captureHint =
    photoCount < MIN_PHOTOS
      ? `Need ${MIN_PHOTOS - photoCount} more photo${MIN_PHOTOS - photoCount > 1 ? "s" : ""} to enroll`
      : photoCount < MAX_PHOTOS
        ? `${MAX_PHOTOS - photoCount} more photo${MAX_PHOTOS - photoCount > 1 ? "s" : ""} optional`
        : "All photos captured — ready to enroll";

  /* ── Success overlay ────────────────────────────────────── */

  if (enrolled) {
    return (
      <div style={{ textAlign: "center", padding: "3rem 1rem" }}>
        <div style={{ fontSize: "4rem", marginBottom: "1rem" }} aria-hidden="true">
          &#10003;
        </div>
        <h2 style={{ fontSize: "1.8rem", marginBottom: "0.5rem" }}>
          Enrollment Complete!
        </h2>
        <p style={{ color: "var(--text-secondary, #64748b)", marginBottom: "2rem" }}>
          {name} has been registered and face enrolled successfully.
        </p>
        <button
          onClick={handleReset}
          style={{
            padding: "0.75rem 1.5rem",
            borderRadius: "0.5rem",
            border: "none",
            cursor: "pointer",
            fontWeight: 600,
            fontSize: "1rem",
            minHeight: "44px",
          }}
        >
          Enroll Another Student
        </button>
      </div>
    );
  }

  /* ── Step 1: Registration form ──────────────────────────── */

  if (studentId === null) {
    return (
      <div style={{ maxWidth: "480px", margin: "0 auto", padding: "1rem" }}>
        <span
          style={{
            fontSize: "0.75rem",
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: "0.05em",
          }}
        >
          Step 1
        </span>
        <h2 style={{ margin: "0.25rem 0 1.5rem" }}>Register Student</h2>

        <div style={{ display: "grid", gap: "1rem", marginBottom: "1rem" }}>
          <label style={{ display: "grid", gap: "0.5rem" }}>
            Full Name
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Ahmed Hassan"
              autoComplete="off"
              style={{
                padding: "0.75rem",
                borderRadius: "0.5rem",
                border: "1px solid var(--border-color, #cbd5e1)",
                fontSize: "1rem",
                minHeight: "44px",
              }}
            />
          </label>

          <label style={{ display: "grid", gap: "0.5rem" }}>
            Email Address
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="e.g. ahmed@university.edu"
              autoComplete="off"
              style={{
                padding: "0.75rem",
                borderRadius: "0.5rem",
                border: "1px solid var(--border-color, #cbd5e1)",
                fontSize: "1rem",
                minHeight: "44px",
              }}
            />
          </label>
        </div>

        {registerError && (
          <p role="alert" style={{ color: "var(--color-error, #dc2626)", fontSize: "0.875rem" }}>
            {registerError}
          </p>
        )}

        <button
          onClick={handleRegister}
          disabled={isRegistering}
          style={{
            padding: "0.75rem 1.5rem",
            borderRadius: "0.5rem",
            border: "none",
            cursor: isRegistering ? "wait" : "pointer",
            fontWeight: 600,
            fontSize: "1rem",
            minHeight: "44px",
            opacity: isRegistering ? 0.55 : 1,
          }}
        >
          {isRegistering ? "Registering…" : "Register Student"}
        </button>
      </div>
    );
  }

  /* ── Step 2: Face capture ───────────────────────────────── */

  return (
    <div style={{ maxWidth: "480px", margin: "0 auto", padding: "1rem" }}>
      <span
        style={{
          fontSize: "0.75rem",
          fontWeight: 700,
          textTransform: "uppercase",
          letterSpacing: "0.05em",
        }}
      >
        Step 2
      </span>
      <h2 style={{ margin: "0.25rem 0 0.5rem" }}>Capture Face Photos</h2>
      <p style={{ fontSize: "0.875rem", color: "var(--text-secondary, #64748b)", marginBottom: "1rem" }}>
        Student: <strong>{name}</strong> ({email})
      </p>

      {/* Camera viewport */}
      <div
        style={{
          position: "relative",
          maxWidth: "360px",
          margin: "0 auto 1rem",
          borderRadius: "0.75rem",
          overflow: "hidden",
          background: "#0f172a",
          aspectRatio: "4/3",
        }}
      >
        <video
          ref={videoRef}
          playsInline
          autoPlay
          muted
          style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
        />
        {/* Face guide circle overlay */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "grid",
            placeItems: "center",
            pointerEvents: "none",
          }}
          aria-hidden="true"
        >
          <div
            style={{
              width: "140px",
              height: "140px",
              borderRadius: "50%",
              border: "3px solid rgba(255,255,255,0.8)",
            }}
          />
        </div>

        {/* Camera denied overlay */}
        {cameraError && (
          <div
            role="alert"
            style={{
              position: "absolute",
              inset: 0,
              background: "rgba(0,0,0,0.8)",
              display: "grid",
              placeItems: "center",
              padding: "1.5rem",
              textAlign: "center",
              color: "#fff",
            }}
          >
            <div>
              <h3 style={{ margin: "0 0 0.5rem", fontSize: "1.25rem" }}>
                Camera Access Required
              </h3>
              <p style={{ fontSize: "0.875rem", opacity: 0.85, marginBottom: "0.5rem" }}>
                {cameraError}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Progress */}
      <div style={{ marginBottom: "0.75rem" }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            fontSize: "0.75rem",
            color: "var(--text-secondary, #64748b)",
            marginBottom: "0.25rem",
          }}
        >
          <span aria-live="polite" aria-atomic="true">
            Captured: {photoCount} / {MAX_PHOTOS} photos
          </span>
          <span>{captureHint}</span>
        </div>
        <div
          style={{
            height: "6px",
            borderRadius: "3px",
            background: "var(--border-color, #e2e8f0)",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              height: "100%",
              width: `${progressPct}%`,
              background: "var(--color-primary, #2563eb)",
              transition: "width 0.2s ease",
            }}
          />
        </div>
      </div>

      {/* Thumbnails */}
      {images.length > 0 && (
        <div
          style={{
            display: "flex",
            gap: "0.5rem",
            marginBottom: "1rem",
            overflowX: "auto",
          }}
          aria-label="Captured face photos"
        >
          {images.map((src, i) => (
            <img
              key={i}
              src={src}
              alt={`Capture ${i + 1}`}
              style={{
                width: "64px",
                height: "64px",
                objectFit: "cover",
                borderRadius: "0.5rem",
                border:
                  i === images.length - 1
                    ? "2px solid var(--color-primary, #2563eb)"
                    : "2px solid transparent",
              }}
            />
          ))}
        </div>
      )}

      {/* Capture / Retake buttons */}
      <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", marginBottom: "1rem" }}>
        <button
          onClick={handleCapture}
          disabled={!isReady || photoCount >= MAX_PHOTOS}
          style={{
            padding: "0.75rem 1.5rem",
            borderRadius: "0.5rem",
            border: "none",
            cursor: !isReady || photoCount >= MAX_PHOTOS ? "wait" : "pointer",
            fontWeight: 600,
            fontSize: "1rem",
            minHeight: "44px",
            opacity: !isReady || photoCount >= MAX_PHOTOS ? 0.55 : 1,
          }}
        >
          Capture Photo
        </button>
        {images.length > 0 && (
          <button
            onClick={handleRetake}
            style={{
              padding: "0.75rem 1.5rem",
              borderRadius: "0.5rem",
              border: "1px solid var(--border-color, #cbd5e1)",
              background: "transparent",
              cursor: "pointer",
              fontWeight: 600,
              fontSize: "1rem",
              minHeight: "44px",
            }}
          >
            Retake Last
          </button>
        )}
      </div>

      {/* Enroll button */}
      <button
        onClick={handleSubmit}
        disabled={!canEnroll || isEnrolling}
        style={{
          padding: "0.75rem 1.5rem",
          borderRadius: "0.5rem",
          border: "none",
          cursor: !canEnroll || isEnrolling ? "wait" : "pointer",
          fontWeight: 600,
          fontSize: "1rem",
          minHeight: "44px",
          opacity: !canEnroll || isEnrolling ? 0.55 : 1,
        }}
      >
        {isEnrolling ? "Enrolling…" : "Enroll Face"}
      </button>

      {enrollError && (
        <p role="alert" style={{ color: "var(--color-error, #dc2626)", fontSize: "0.875rem", marginTop: "0.75rem" }}>
          {enrollError}
        </p>
      )}
    </div>
  );
}
