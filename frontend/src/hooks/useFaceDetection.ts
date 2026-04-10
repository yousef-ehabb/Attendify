/**
 * useFaceDetection — MediaPipe real-time face detection hook.
 */

import { useEffect, useRef, useState } from "react";
import { FilesetResolver, FaceDetector } from "@mediapipe/tasks-vision";

export interface FaceBoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface FaceLandmark {
  name: string;
  x: number;
  y: number;
}

export interface UseFaceDetectionReturn {
  faceBox: FaceBoundingBox | null;
  landmarks: FaceLandmark[];
  isSupported: boolean;
  isModelLoading: boolean;
  isModelReady: boolean;
  timedOut: boolean;
  error: string | null;
}

const WASM_BASE_URL = "/wasm";
const MODEL_ASSET_PATH = "/models/blaze_face_short_range.tflite";
const DETECT_INTERVAL_MS = 100;
const LOAD_TIMEOUT_MS = 10000;

export function useFaceDetection(
  videoRef: React.RefObject<HTMLVideoElement | null>,
  active: boolean,
): UseFaceDetectionReturn {
  const detectorRef = useRef<FaceDetector | null>(null);
  const rafRef = useRef<number | null>(null);
  const isDetectingRef = useRef(false);
  const lastDetectTimeRef = useRef(0);
  const activeRef = useRef(false);

  const [faceBox, setFaceBox] = useState<FaceBoundingBox | null>(null);
  const [landmarks, setLandmarks] = useState<FaceLandmark[]>([]);
  const [isSupported, setIsSupported] = useState(false);
  const [isModelLoading, setIsModelLoading] = useState(false);
  const [isModelReady, setIsModelReady] = useState(false);
  const [timedOut, setTimedOut] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const detectFrame = async () => {
    const detector = detectorRef.current;
    const video = videoRef.current;

    if (!activeRef.current || !detector || !video) return;
    if (video.readyState < 2) {
      rafRef.current = requestAnimationFrame(detectFrame);
      return;
    }

    const now = performance.now();
    if (now - lastDetectTimeRef.current < DETECT_INTERVAL_MS) {
      rafRef.current = requestAnimationFrame(detectFrame);
      return;
    }

    if (isDetectingRef.current) {
      rafRef.current = requestAnimationFrame(detectFrame);
      return;
    }

    isDetectingRef.current = true;
    lastDetectTimeRef.current = now;

    try {
      const result = await detector.detectForVideo(video, now);
      if (!activeRef.current) return;

      if (result.detections && result.detections.length > 0) {
        const best = result.detections.reduce((top, det) =>
          det.categories[0].score > top.categories[0].score ? det : top,
        );
        const bb = best.boundingBox;
        if (!bb) {
          setFaceBox(null);
          setLandmarks([]);
        } else {
          const vW = video.videoWidth || 1;
          const vH = video.videoHeight || 1;
          setFaceBox({
            x: bb.originX / vW,
            y: bb.originY / vH,
            width: bb.width / vW,
            height: bb.height / vH,
          });
          setLandmarks((best.keypoints ?? []).map(kp => ({
            name: kp.label ?? "unknown",
            x: kp.x,
            y: kp.y,
          })));
        }
      } else {
        setFaceBox(null);
        setLandmarks([]);
      }
    } catch (err) {
      console.warn("FaceDetection: frame error", err);
    } finally {
      isDetectingRef.current = false;
      if (activeRef.current) {
        rafRef.current = requestAnimationFrame(detectFrame);
      }
    }
  };

  useEffect(() => {
    if (!active) {
      activeRef.current = false;
      setIsModelReady(false);
      setIsModelLoading(false); // Ensure loading state is cleared when inactive
      return;
    }

    activeRef.current = true;
    setIsModelLoading(true);
    setTimedOut(false);
    setError(null);

    const init = async () => {
      console.log("FaceDetection: starting model load...");
      
      let timeoutId: any;
      const timeoutPromise = new Promise((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error("Model load timeout")), LOAD_TIMEOUT_MS);
      });

      try {
        const loadPromise = (async () => {
          const vision = await FilesetResolver.forVisionTasks(WASM_BASE_URL);
          const detector = await FaceDetector.createFromOptions(vision, {
            baseOptions: { modelAssetPath: MODEL_ASSET_PATH },
            runningMode: "VIDEO",
            minDetectionConfidence: 0.7,
          });
          return detector;
        })();

        const detector = await Promise.race([loadPromise, timeoutPromise]) as FaceDetector;
        clearTimeout(timeoutId);
        
        if (!activeRef.current) {
          detector.close();
          return;
        }

        detectorRef.current = detector;
        setIsSupported(true);
        setIsModelLoading(false);
        setIsModelReady(true);
        console.log("FaceDetection: model ready");
        rafRef.current = requestAnimationFrame(detectFrame);

      } catch (err: any) {
        if (timeoutId) clearTimeout(timeoutId);
        if (!activeRef.current) return;

        console.error("FaceDetection: timed out or failed, switching to fallback", err);
        setIsModelLoading(false);
        setIsModelReady(false);
        setTimedOut(true);
        setError(err.message || "Face detection failed to load");
      }
    };

    init();

    return () => {
      activeRef.current = false;
      setIsModelLoading(false); // Reset on unmount
      setIsModelReady(false);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (detectorRef.current) {
        detectorRef.current.close();
        detectorRef.current = null;
      }
    };
  }, [active]);

  return { faceBox, landmarks, isSupported, isModelLoading, isModelReady, timedOut, error };
}
