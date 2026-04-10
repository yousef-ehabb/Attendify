/**
 * useQRScanner — native BarcodeDetector QR scanning hook.
 *
 * Attaches a rear-camera MediaStream to a video ref and runs a
 * tight requestAnimationFrame loop that feeds frames into the
 * native BarcodeDetector API.  When a QR code is detected the
 * callback fires once and the loop stops.
 *
 * All camera / RAF state lives in refs — no React re-renders
 * during the scan loop.
 *
 * Usage:
 *   const videoRef = useRef HTMLVideoElement | null (null);
 *   const result = useQRScanner(videoRef, (token) => handleToken(token));
 */

import { useEffect, useRef, useState } from "react";

/* ── public types ───────────────────────────────────────────── */

export type OnQrDetected = (token: string) => void;

export interface UseQRScannerReturn {
  /** Non-null when the scanner could not start or encounters an error. */
  error: string | null;
  /** True while the rAF scan loop is actively running. */
  isScanning: boolean;
  /** The last detected QR token string (remains set until reset). */
  detectedToken: string | null;
  /** Manually start the scanner (rear camera). */
  start: () => void;
  /** Manually stop the scanner and release the camera. */
  stop: () => void;
  /** Clear the detected token so a new scan can fire. */
  reset: () => void;
  /** Whether the browser supports the native BarcodeDetector API. */
  isSupported: boolean;
}

/* ── internal BarcodeDetector wrapper ───────────────────────── */

/**
 * Lazily create a single BarcodeDetector instance scoped to
 * qr_code format.  Returns null when the API is unavailable.
 */
function createDetector(): BarcodeDetector | null {
  if (typeof window === "undefined") return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const Ctor = (window as any).BarcodeDetector;
  if (!Ctor) return null;
  try {
    return new Ctor({ formats: ["qr_code"] });
  } catch {
    return null;
  }
}

/* ── implementation ─────────────────────────────────────────── */

export function useQRScanner(
  videoRef: React.RefObject<HTMLVideoElement | null>,
  onDetected: OnQrDetected,
): UseQRScannerReturn {
  // Refs — mutable state that never triggers re-renders.
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const detectorRef = useRef<BarcodeDetector | null>(null);
  const activeRef = useRef(false); // guards race conditions on unmount
  const callbackRef = useRef(onDetected);

  // Minimal React state — only for error display, scanning flag, and token.
  const [error, setError] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [detectedToken, setDetectedToken] = useState<string | null>(null);
  const [isSupported, setIsSupported] = useState(false);

  // Keep callback ref current so we don't need it in effect deps.
  useEffect(() => {
    callbackRef.current = onDetected;
  }, [onDetected]);

  /* ── scan loop ────────────────────────────────────────── */

  const scanLoop = async () => {
    const detector = detectorRef.current;
    const video = videoRef.current;

    if (!detector || !video || !activeRef.current) return;

    try {
      // Only attempt detection when the video has usable data.
      if (video.readyState >= 2) {
        const codes = await detector.detect(video);
        if (codes.length > 0 && codes[0].rawValue) {
          const token = codes[0].rawValue.trim();
          if (token) {
            // Fire callback and stop the loop — one-shot detection.
            callbackRef.current(token);
            setDetectedToken(token);
            setIsScanning(false);
            return;
          }
        }
      }
    } catch {
      // Detection can fail on empty frames — just skip this frame.
      if (!activeRef.current) return;
      rafRef.current = requestAnimationFrame(scanLoop);
      return;
    }

    if (!activeRef.current) return;
    rafRef.current = requestAnimationFrame(scanLoop);
  };

  /* ── start / stop ─────────────────────────────────────── */

  const start = async () => {
    // Reset state.
    setError(null);
    setDetectedToken(null);

    // Ensure detector exists.
    if (!detectorRef.current) {
      detectorRef.current = createDetector();
    }

    if (!detectorRef.current) {
      setError(
        "Automatic QR scanning is not supported in this browser. Use the manual token input instead.",
      );
      setIsSupported(false);
      return;
    }

    setIsSupported(true);

    // Stop any existing stream first.
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }

    activeRef.current = true;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
        audio: false,
      });

      // Guard: component may have unmounted while awaiting.
      if (!activeRef.current) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }

      streamRef.current = stream;

      const video = videoRef.current;
      if (!video) {
        setError("Video element ref is not attached.");
        stream.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        return;
      }

      video.srcObject = stream;
      video.muted = true;
      await video.play();

      setIsScanning(true);
      rafRef.current = requestAnimationFrame(scanLoop);
    } catch (err: unknown) {
      if (!activeRef.current) return;

      if (err instanceof DOMException && err.name === "NotAllowedError") {
        setError(
          "Camera permission denied. Please allow camera access in your browser settings and try again.",
        );
      } else if (err instanceof DOMException && err.name === "NotFoundError") {
        setError("No rear camera device found on this system.");
      } else if (err instanceof DOMException && err.name === "NotReadableError") {
        setError(
          "Camera is already in use by another application. Close it and retry.",
        );
      } else {
        setError(
          `Camera error: ${err instanceof Error ? err.message : "unknown"}`,
        );
      }

      setIsScanning(false);
    }
  };

  const stop = () => {
    activeRef.current = false;

    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }

    const video = videoRef.current;
    if (video) {
      video.srcObject = null;
    }

    setIsScanning(false);
  };

  const reset = () => {
    setDetectedToken(null);
  };

  /* ── effect: init on mount, teardown on unmount ───────── */

  useEffect(() => {
    // Check support once.
    const det = createDetector();
    detectorRef.current = det;
    setIsSupported(det !== null);
    activeRef.current = true;

    return () => {
      activeRef.current = false;
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
      const video = videoRef.current;
      if (video) {
        video.srcObject = null;
      }
    };
    // Only run on mount/unmount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoRef]);

  return { error, isScanning, detectedToken, start, stop, reset, isSupported };
}
