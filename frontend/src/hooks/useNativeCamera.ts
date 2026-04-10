import { useEffect, useRef, useState } from "react";

export type FacingMode = "user" | "environment";

export interface UseNativeCameraOptions {
  facingMode?: FacingMode;
  autoPlay?: boolean;
  muted?: boolean;
}

export interface UseNativeCameraReturn {
  error: string | null;
  isReady: boolean;
  isActive: boolean;
  stop: () => void;
  switchFacing: (mode: FacingMode) => void;
  captureFrame: () => string | null;
  resume: () => Promise<void>;
}

export function useNativeCamera(
  videoRef: React.RefObject<HTMLVideoElement | null>,
  options: UseNativeCameraOptions = {},
): UseNativeCameraReturn {
  const {
    facingMode = "user",
    autoPlay = true,
    muted = true,
  } = options;

  const streamRef = useRef<MediaStream | null>(null);
  const facingRef = useRef<FacingMode>(facingMode);
  const activeRef = useRef(false);

  const [error, setError] = useState<string | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [isActive, setIsActive] = useState(false);

  const start = async (mode: FacingMode) => {
    facingRef.current = mode;
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }

    setIsReady(false);
    setIsActive(false);
    setError(null);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { 
          facingMode: { ideal: mode },
          width: { ideal: 1280 },
          height: { ideal: 720 }
        },
        audio: false,
      });

      if (!activeRef.current) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }

      streamRef.current = stream;
      const video = videoRef.current;
      
      if (!video) {
        setError("Camera failed: Video container not found.");
        return;
      }

      video.srcObject = stream;
      video.muted = muted;
      video.setAttribute("autoplay", "");
      video.setAttribute("playsinline", "");

      // Robust readiness check: wait for metadata AND dimensions
      const checkReadiness = () => {
        if (!activeRef.current || !video) return;
        
        // readyState >= 2 (HAVE_CURRENT_DATA) and non-zero dimensions
        if (video.readyState >= 2 && video.videoWidth > 0) {
          setIsReady(true);
          setIsActive(true);
          video.play().catch(e => console.warn("Auto-play blocked, waiting for tap", e));
        } else {
          // Poll until ready (max 5s)
          setTimeout(checkReadiness, 100);
        }
      };

      video.onloadedmetadata = checkReadiness;
      video.oncanplay = checkReadiness;
      // Fallback polling
      setTimeout(checkReadiness, 500);

    } catch (err: any) {
      if (!activeRef.current) return;
      console.error("useNativeCamera error:", err);
      
      const msg = err.name === "NotAllowedError" ? "Camera permission denied." :
                  err.name === "NotFoundError" ? "No camera found." :
                  err.name === "NotReadableError" ? "Camera is already in use." :
                  `Camera error: ${err.message}`;
      setError(msg);
      setIsReady(false);
    }
  };

  const resume = async () => {
    const video = videoRef.current;
    if (video) {
      try {
        await video.play();
        setIsActive(true);
      } catch (e) {
        console.error("Resume failed:", e);
      }
    }
  };

  useEffect(() => {
    activeRef.current = true;
    const t = setTimeout(() => start(facingMode), 100);
    return () => {
      clearTimeout(t);
      activeRef.current = false;
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
      setIsReady(false);
      setIsActive(false);
    };
  }, [videoRef]);

  const stop = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
    }
    setIsReady(false);
    setIsActive(false);
  };

  const switchFacing = (mode: FacingMode) => {
    void start(mode);
  };

  const captureFrame = (): string | null => {
    const video = videoRef.current;
    if (!video || video.readyState < 2 || video.videoWidth === 0) return null;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(video, 0, 0);
    return canvas.toDataURL("image/jpeg", 0.9);
  };

  return { error, isReady, isActive, stop, switchFacing, captureFrame, resume };
}
