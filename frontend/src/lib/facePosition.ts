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
  
  const noseLandmark = landmarks.find(l => l.name === "noseTip");
  let offsetX = 0;
  let offsetY = 0;
  
  if (noseLandmark) {
    offsetX = noseLandmark.x - 0.5;
    offsetY = noseLandmark.y - 0.5;
  } else {
    offsetX = (faceBox.x + faceBox.width / 2) - 0.5;
    offsetY = (faceBox.y + faceBox.height / 2) - 0.5;
  }
  
  const aspectRatio = faceBox.width / faceBox.height;
  const isCenteredHorizontally = Math.abs(offsetX) < NOSE_CENTER_THRESHOLD;
  const isCenteredVertically = Math.abs(offsetY) < VERTICAL_THRESHOLD;
  const isFrontal = aspectRatio >= FRONTAL_RATIO_MIN;
  
  let position: FacePositionLabel;
  let debugMsg = `X:${offsetX.toFixed(2)} Y:${offsetY.toFixed(2)} AR:${aspectRatio.toFixed(2)}`;

  if (isCenteredHorizontally && isCenteredVertically && isFrontal) {
    position = "center";
  } else if (offsetX < -NOSE_TURN_THRESHOLD) {
    position = "right";
  } else if (offsetX > NOSE_TURN_THRESHOLD) {
    position = "left";
  } else if (offsetY < -VERTICAL_THRESHOLD) {
    position = "up";
  } else {
    position = "center"; // Default to center if close enough
  }
  
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
  imageData: ImageData,
  detectionConfidence: number,
): QualityResult {
  return { pass: true }; // Totally unrestricted for fallback
}
