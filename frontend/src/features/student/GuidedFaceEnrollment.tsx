import { useState, useRef, useEffect, useCallback } from "react";
import { Camera, CheckCircle2, Loader2, Play } from "lucide-react"
import { useNativeCamera } from "../../hooks/useNativeCamera";
import { CameraErrorView } from "../../components/ui/CameraErrorView";
import { useFaceDetection } from "../../hooks/useFaceDetection";
import { 
  getFacePosition, 
  createStabilityState, 
  updateStability,
  type FacePositionLabel,
  type StabilityState,
} from "../../lib/facePosition";

interface CombinedRegister {
  sessionId: number
  name: string
  email: string
}

interface GuidedFaceEnrollmentProps {
  /** Used with `/enroll-face` when the student already exists. */
  studentId?: string
  /** When set, POST `/register` with session_id + images instead of enroll-face. */
  combined?: CombinedRegister
  onComplete: (summary?: { course_name?: string; session_number?: number; student_name?: string; student_id?: number }) => void
  onError: (message: string) => void
}

const STEPS = [
  { target: "center" as const, instruction: "Look straight", assistant: "Hold steady..." },
  { target: "left" as const, instruction: "Look left", assistant: "Hold it..." },
  { target: "right" as const, instruction: "Look right", assistant: "Almost there..." },
  { target: "up" as const, instruction: "Look up", assistant: "Excellent..." },
  { target: "center" as const, instruction: "Look straight one more time", assistant: "Final shot!" },
];

const HOLD_DURATION_MS = 1500;
const STEP_DELAY_MS = 2000;
const ENROLLMENT_TIMEOUT_MS = 120000;

export function GuidedFaceEnrollment({ studentId, combined, onComplete, onError }: GuidedFaceEnrollmentProps) {
  // --- STATE ---
  const [stepIndex, setStepIndex] = useState(0);
  const [capturedFrames, setCapturedFrames] = useState<string[]>([]);
  const [stabilityState, setStabilityState] = useState<StabilityState>(createStabilityState());
  const [enrollmentPhase, setEnrollmentPhase] = useState<"detecting" | "capturing" | "enrolling" | "done" | "error">("detecting");
  const [feedback, setFeedback] = useState<string | null>(null);
  const [captureError, setCaptureError] = useState<string | null>(null);
  const [showFlash, setShowFlash] = useState(false);
  const [lastPosition, setLastPosition] = useState<FacePositionLabel>("not_detected");
  const [debugText, setDebugText] = useState<string>("");
  const [isTransitioning, setIsTransitioning] = useState(false);
  const completeTimerRef = useRef<number | null>(null);
  
  // States
  const [manualMode, setManualMode] = useState(false);
  const [isBlackScreen, setIsBlackScreen] = useState(false);

  // --- REFS ---
  const videoRef = useRef<HTMLVideoElement>(null);
  const captureLockRef = useRef(false);
  const stabilityRef = useRef<StabilityState>(stabilityState);

  // --- CAMERA & DETECTION ---
  const { 
    error: cameraError,
    errorName: cameraErrorName,
    isReady, 
    isActive,
    captureFrame,
    resume: resumeCamera,
    switchFacing
  } = useNativeCamera(videoRef, { facingMode: "user", muted: true });

  const { 
    faceBox, 
    landmarks, 
    isModelLoading,
    isModelReady,
    timedOut,
    error: detectionError,
  } = useFaceDetection(videoRef, isReady && enrollmentPhase === "detecting" && !manualMode);

  const resetStability = useCallback(() => {
    const next = createStabilityState();
    stabilityRef.current = next;
    setStabilityState(next);
  }, []);

  // Handle detection timeout
  useEffect(() => {
    if (timedOut && !manualMode) setManualMode(true);
  }, [timedOut, manualMode]);

  useEffect(() => {
    return () => {
      if (completeTimerRef.current) {
        window.clearTimeout(completeTimerRef.current)
      }
    }
  }, [])

  // Handle Black Screen
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>
    if (isReady && !isActive) {
      timer = setTimeout(() => setIsBlackScreen(true), 3000);
    } else if (isActive) {
      setIsBlackScreen(false);
    }
    return () => clearTimeout(timer);
  }, [isReady, isActive]);

  // --- CAPTURE LOGIC ---
  const scheduleCompletion = useCallback(
    (summary?: { course_name?: string; session_number?: number; student_name?: string; student_id?: number }) => {
      if (completeTimerRef.current) {
        window.clearTimeout(completeTimerRef.current)
      }
      setEnrollmentPhase("done")
      completeTimerRef.current = window.setTimeout(() => {
        onComplete(summary)
      }, 800)
    },
    [onComplete],
  )

  const handleCapture = useCallback(async () => {
    if (captureLockRef.current) return;
    captureLockRef.current = true;
    setCaptureError(null);

    const frame = captureFrame();
    if (!frame) {
      const message = "Unable to capture a valid image. Make sure your camera is active and try again.";
      setCaptureError(message);
      onError(message);
      setEnrollmentPhase("detecting");
      captureLockRef.current = false;
      return;
    }

    const updatedFrames = [...capturedFrames, frame];
    setCapturedFrames(updatedFrames);
    setShowFlash(true);
    setTimeout(() => setShowFlash(false), 200);
    
    if (updatedFrames.length < STEPS.length) {
      setFeedback("✓ Step Complete");
      setIsTransitioning(true);
      setTimeout(() => {
        setStepIndex(prev => prev + 1);
        resetStability();
        setFeedback(null);
        setEnrollmentPhase("detecting");
        captureLockRef.current = false;
        setIsTransitioning(false);
      }, STEP_DELAY_MS);
    } else {
      setEnrollmentPhase("enrolling");
      const controller = new AbortController();
      const timeoutId = window.setTimeout(() => controller.abort(), ENROLLMENT_TIMEOUT_MS);
      try {
        let res: Response
        let data: any
        if (combined) {
          res = await fetch(`/api/students/register`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              name: combined.name.trim(),
              email: combined.email.trim(),
              session_id: combined.sessionId,
              images: updatedFrames,
            }),
            signal: controller.signal,
          })
          data = await res.json().catch(() => ({}))
          if (!res.ok) {
            const detail = typeof data.detail === "string" ? data.detail : "Registration failed"
            throw new Error(detail)
          }
          scheduleCompletion({
            course_name: data.course_name ?? undefined,
            session_number: data.session_number ?? undefined,
            student_name: data.name ?? undefined,
            student_id: data.id ?? undefined,
          })
        } else {
          if (!studentId) {
            throw new Error("Missing student account for enrollment")
          }
          res = await fetch(`/api/students/${studentId}/enroll-face`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ images: updatedFrames }),
            signal: controller.signal,
          })
          data = await res.json().catch(() => ({}))
          if (!res.ok) {
            throw new Error(data.detail || "Enrollment failed")
          }
          scheduleCompletion({ 
            student_id: data.student_id ?? (studentId ? Number(studentId) : undefined),
          })
        }
      } catch (err: unknown) {
        if (err instanceof DOMException && err.name === "AbortError") {
          onError("Enrollment timed out. Please try again.")
        } else {
          onError(err instanceof Error ? err.message : "Enrollment failed")
        }
        setEnrollmentPhase("error")
      } finally {
        window.clearTimeout(timeoutId)
        captureLockRef.current = false
      }
    }
  }, [captureFrame, capturedFrames, studentId, combined, onComplete, onError, scheduleCompletion])

  // Detection Loop
  useEffect(() => {
    if (manualMode || enrollmentPhase !== "detecting" || !isReady || !isModelReady || captureLockRef.current || isTransitioning) return;

    if (faceBox) {
      const currentStep = STEPS[stepIndex];
      const currentStability = stabilityRef.current;
      const result = getFacePosition(faceBox, landmarks, currentStep.target, currentStability);
      const newState = updateStability(currentStability, result.position, currentStep.target);
      stabilityRef.current = newState;
      
      // Keep the detector loop in refs; mirror only meaningful UI changes into React state.
      setStabilityState((prev) =>
        prev.lastPosition === newState.lastPosition && prev.matchingSince === newState.matchingSince
          ? prev
          : newState,
      );
      setLastPosition((prev) => (prev === result.position ? prev : result.position));
      setDebugText((prev) => (prev === (result.debug || "") ? prev : result.debug || ""));

      const isStableNow = newState.matchingSince !== null && (Date.now() - newState.matchingSince) >= HOLD_DURATION_MS;
      if (isStableNow && result.position === currentStep.target) {
        setEnrollmentPhase("capturing");
        handleCapture();
      }
    } else {
      setLastPosition((prev) => (prev === "not_detected" ? prev : "not_detected"));
      setDebugText((prev) => (prev === "No face detected" ? prev : "No face detected"));
    }
    // We remove stabilityState from deps to avoid the infinite loop, 
    // it will still run because faceBox/landmarks/stepIndex update on every frame/step.
  }, [enrollmentPhase, faceBox, landmarks, isReady, isModelReady, stepIndex, handleCapture, manualMode]);

  // --- RENDER ---
  const isInitializing = (!isReady || isModelLoading) && !manualMode && !cameraError;

  if (cameraErrorName) {
    return <CameraErrorView errorName={cameraErrorName} sessionId={combined?.sessionId} onRetry={() => switchFacing("user")} />
  }

  return (
    <div 
      className="fixed inset-0 h-[100dvh] w-full bg-black overflow-hidden flex flex-col text-white select-none"
      onClick={() => resumeCamera()}
    >
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className="absolute inset-0 w-full h-full object-cover scale-x-[-1]"
      />

      {/* Dynamic Face HUD */}
      {!isInitializing && isModelReady && faceBox && enrollmentPhase === "detecting" && !manualMode && (
        <div 
          className="absolute border-2 border-blue-400/50 rounded-3xl transition-all duration-150 pointer-events-none"
          style={{
            top: `${faceBox.y * 100}%`,
            left: `${(1 - (faceBox.x + faceBox.width)) * 100}%`, 
            width: `${faceBox.width * 100}%`,
            height: `${faceBox.height * 100}%`,
            boxShadow: '0 0 20px rgba(59,130,246,0.2)'
          }}
        >
          <div className="absolute -top-10 left-1/2 -translate-x-1/2 bg-blue-500/90 px-3 py-1 rounded-full text-[10px] font-bold text-white whitespace-nowrap">
            {lastPosition === STEPS[stepIndex].target ? "STABLE - CAPTURING..." : "LOCATING FACE"}
          </div>
          {/* HUD Brackets */}
          <div className="absolute top-0 left-0 w-6 h-6 border-t-4 border-l-4 border-white/80 rounded-tl-2xl" />
          <div className="absolute top-0 right-0 w-6 h-6 border-t-4 border-r-4 border-white/80 rounded-tr-2xl" />
          <div className="absolute bottom-0 left-0 w-6 h-6 border-b-4 border-l-4 border-white/80 rounded-bl-2xl" />
          <div className="absolute bottom-0 right-0 w-6 h-6 border-b-4 border-r-4 border-white/80 rounded-br-2xl" />
        </div>
      )}

      {!isInitializing && !manualMode && enrollmentPhase === "detecting" && !faceBox && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-40">
          <div className="w-64 h-64 rounded-[34px] border-2 border-dashed border-white/60 bg-white/5 backdrop-blur-sm flex flex-col items-center justify-center text-center px-4">
            <p className="text-sm uppercase tracking-[0.3em] text-white/80">Align your face</p>
            <p className="mt-2 text-[11px] leading-snug text-white/60">A detection box will appear once your face is in view.</p>
          </div>
        </div>
      )}

      {/* Header Info */}
      <div className="absolute top-0 w-full p-6 flex justify-between items-start z-50">
        <div className="bg-black/60 backdrop-blur-md p-3 rounded-2xl border border-white/10 flex items-center gap-3">
          <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center font-black">
            {stepIndex + 1}
          </div>
          <div>
            <p className="text-[10px] font-bold text-blue-400 uppercase tracking-widest">Enrolling</p>
            <p className="text-sm font-bold">Face Entry</p>
            <p className="text-[10px] uppercase text-white/60">Step {stepIndex + 1} of {STEPS.length}</p>
          </div>
        </div>
      </div>

      {/* FOOTER: Instructions & Action */}
      {!isInitializing && (
        <div className="absolute bottom-0 w-full p-8 pb-10 bg-gradient-to-t from-black via-black/90 to-transparent z-50 flex flex-col items-center">
          
          <div className="text-center mb-8">
            <h2 className="text-2xl font-black mb-1">{feedback || STEPS[stepIndex].instruction}</h2>
            <p className="text-slate-400 text-sm">{lastPosition === STEPS[stepIndex].target ? "Hold still..." : "Position your face in the center"}</p>
            {captureError ? (
              <p className="mt-2 text-sm font-semibold text-amber-200">{captureError}</p>
            ) : null}
            {detectionError ? (
              <p className="mt-2 text-sm font-semibold text-amber-200">{detectionError}</p>
            ) : null}
            {/* Debug info (Hidden logic) */}
            <p className="text-[8px] text-white/20 mt-2 font-mono">{debugText}</p>
          </div>          <div className="flex flex-col items-center gap-6">
             {/* MAIN CAPTURE TRIGGER */}
             <div className="relative">
                {/* SVG Progress Ring */}
                {stabilityState.matchingSince && !isTransitioning && !manualMode && (
                  <svg className="absolute -inset-4 size-32 -rotate-90">
                    <circle
                      cx="64"
                      cy="64"
                      r="60"
                      fill="transparent"
                      stroke="currentColor"
                      strokeWidth="4"
                      className="text-white/10"
                    />
                    <circle
                      cx="64"
                      cy="64"
                      r="60"
                      fill="transparent"
                      stroke="currentColor"
                      strokeWidth="4"
                      strokeDasharray={377}
                      strokeDashoffset={377 - (377 * Math.min(100, (Date.now() - (stabilityState.matchingSince || 0)) / HOLD_DURATION_MS * 100)) / 100}
                      className="text-blue-500 transition-all duration-100"
                    />
                  </svg>
                )}
                
                <button
                  onClick={(e) => { e.stopPropagation(); handleCapture(); }}
                  className={`group relative w-24 h-24 bg-white rounded-full flex items-center justify-center shadow-[0_0_40px_rgba(255,255,255,0.3)] active:scale-95 transition-all ${(!isReady || !isActive || isTransitioning) ? 'opacity-50 cursor-not-allowed' : ''}`}
                  disabled={!isReady || !isActive || isTransitioning}
                >
                  <div className="w-16 h-16 border-4 border-slate-950 rounded-full flex items-center justify-center">
                    <Camera className="text-black w-8 h-8" />
                  </div>
                </button>
             </div>

             <button 
                onClick={(e) => { e.stopPropagation(); setManualMode(!manualMode); }}
                className="text-[11px] font-bold text-slate-500 underline underline-offset-4 hover:text-white transition-colors"
                title="Toggle Mode"
             >
                Having trouble? Tap to capture manually
             </button>
          </div>
        </div>
      )}

      {/* Loading & Emergency */}
      {isInitializing && (
        <div className="absolute inset-0 bg-slate-950 flex flex-col items-center justify-center z-[100] p-6">
          <Loader2 className="w-16 h-16 text-blue-500 animate-spin mb-6" />
          <h2 className="text-2xl font-black">Syncing...</h2>
        </div>
      )}

      {isBlackScreen && !manualMode && !isInitializing && (
        <div className="absolute inset-0 bg-black/80 backdrop-blur-xl flex flex-col items-center justify-center z-[110] p-8 text-center" onClick={() => resumeCamera()}>
          <Play className="w-24 h-24 text-blue-500 mb-8 animate-bounce" />
          <h2 className="text-3xl font-black mb-4 uppercase">Unlock Camera</h2>
          <p className="text-slate-400">Tap anywhere to activate the video feed.</p>
        </div>
      )}

      {/* Done State */}
      {(enrollmentPhase === "enrolling" || enrollmentPhase === "done") && (
        <div className={`absolute inset-0 flex flex-col items-center justify-center z-[150] ${enrollmentPhase === 'done' ? 'bg-emerald-600' : 'bg-slate-950/98'}`}>
          {enrollmentPhase === "enrolling" ? (
            <>
              <Loader2 className="w-16 h-16 text-blue-500 animate-spin mb-6" />
              <p className="text-2xl font-black italic">PROCESSING...</p>
              <p className="mt-3 text-sm uppercase text-white/70">Finalizing enrollment: {capturedFrames.length} / {STEPS.length} images</p>
            </>
          ) : (
             <><CheckCircle2 className="w-24 h-24 text-white mb-6 animate-bounce" /><h2 className="text-5xl font-black italic">SUCCESS</h2></>
          )}
        </div>
      )}

      {showFlash && <div className="absolute inset-0 bg-white z-[200] animate-flash" />}

      <style>{`
        @keyframes flash { 0% { opacity: 0; } 50% { opacity: 1; } 100% { opacity: 0; } }
        .animate-flash { animation: flash 0.3s ease-out; }
      `}</style>
    </div>
  );
}
