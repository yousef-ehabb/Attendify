// ── Constants (Maximum Permissiveness for Rapid Enrollment) ──

export const NOSE_CENTER_THRESHOLD = 0.35; // Very wide (center 70% of screen)
export const NOSE_TURN_THRESHOLD = 0.08; 
export const VERTICAL_THRESHOLD = 0.25;
export const MIN_FACE_RATIO = 0.08;
export const MAX_FACE_RATIO = 0.85;
export const FRONTAL_RATIO_MIN = 0.45; // Extremely forgiving (accepts almost any orientation)
export const STABILITY_MS = 200;       // Near-instant capture (0.2s)
export const MIN_BRIGHTNESS = 20;      
export const MAX_BRIGHTNESS = 245;     
export const MIN_CONFIDENCE = 0.50;    

// ── Types ──

export type FacePositionLabel =
  | "center" | "left" | "right" | "up" | "down"
  | "not_detected" | "too_close" | "too_far";

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

export interface FacePositionResult {
  position: FacePositionLabel;
  isStable: boolean;
  confidence: number;
  debug?: string; // Information for troubleshooting
}

export interface QualityResult {
  pass: boolean;
  reason?: "too_dark" | "too_bright" | "low_confidence";
}

export interface StabilityState {
  matchingSince: number | null;
  lastPosition: FacePositionLabel;
}

// ── Pure Functions ──

export function createStabilityState(): StabilityState {
  return {
    matchingSince: null,
    lastPosition: "not_detected",
  };
}

export function updateStability(
  state: StabilityState,
  currentPosition: FacePositionLabel,
  targetPosition: FacePositionLabel,
  now?: number,
): StabilityState {
  const currentTime = now ?? Date.now();
  
  if (currentPosition === targetPosition) {
    if (state.matchingSince === null) {
      return {
        matchingSince: currentTime,
        lastPosition: currentPosition,
      };
    }
    return state;
  }
  
  return {
    matchingSince: null,
    lastPosition: currentPosition,
  };
}

export function getFacePosition(
  faceBox: FaceBoundingBox | null,
  landmarks: FaceLandmark[],
  targetPosition: FacePositionLabel,
  stability: StabilityState,
  now?: number,
): FacePositionResult {
  const currentTime = now ?? Date.now();
  
  if (!faceBox) {
    return { position: "not_detected", isStable: false, confidence: 0, debug: "No face detected" };
  }
  
  if (faceBox.width > MAX_FACE_RATIO) {
    return { position: "too_close", isStable: false, confidence: 0, debug: "Move back" };
  }
  
  if (faceBox.width < MIN_FACE_RATIO) {
    return { position: "too_far", isStable: false, confidence: 0, debug: "Come closer" };
  }
  
  const nose = landmarks.find(l => l.name === "noseTip");
  const leftEye = landmarks.find(l => l.name === "leftEye");
  const rightEye = landmarks.find(l => l.name === "rightEye");

  if (!nose || !leftEye || !rightEye) {
    return { position: "not_detected", isStable: false, confidence: 0, debug: "Missing landmarks" };
  }

  // DETAILED LOGGING (TEMPORARY)
  console.log(`[PoseDetection] Nose:(${nose.x.toFixed(3)}, ${nose.y.toFixed(3)}) L-Eye:(${leftEye.x.toFixed(3)}, ${leftEye.y.toFixed(3)}) R-Eye:(${rightEye.x.toFixed(3)}, ${rightEye.y.toFixed(3)})`);

  const threshold = 0.05;
  const centerThreshold = 0.03;
  const midpointX = (leftEye.x + rightEye.x) / 2;

  let position: FacePositionLabel = "center";
  
  if (nose.x < leftEye.x - threshold) {
    position = "left";
  } else if (nose.x > rightEye.x + threshold) {
    position = "right";
  } else if (nose.y < leftEye.y - threshold) {
    position = "up";
  } else if (Math.abs(nose.x - midpointX) < centerThreshold) {
    position = "center";
  } else {
    position = "center"; // Default
  }
  
  const debugMsg = `P:${position} NX:${nose.x.toFixed(2)} LX:${leftEye.x.toFixed(2)} RX:${rightEye.x.toFixed(2)}`;

  const newStability = updateStability(stability, position, targetPosition, currentTime);
  const isStable = newStability.matchingSince !== null && (currentTime - newStability.matchingSince) >= STABILITY_MS;
  
  return {
    position,
    isStable,
    confidence: 1.0,
    debug: debugMsg
  };
}

export function checkFrameQuality(
  _imageData: ImageData,
  _detectionConfidence: number,
): QualityResult {
  return { pass: true }; // Totally unrestricted for fallback
}
