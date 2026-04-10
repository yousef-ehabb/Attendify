import { useState, useRef, useEffect, useCallback } from "react";
import { 
  Camera, 
  CheckCircle2, 
  AlertCircle, 
  Loader2, 
  ScanFace,
  Play,
  UserCheck,
  Zap
} from "lucide-react";
import { useNativeCamera } from "../../hooks/useNativeCamera";
import { useFaceDetection } from "../../hooks/useFaceDetection";
import { 
  getFacePosition, 
  createStabilityState, 
  updateStability,
  STABILITY_MS,
  type FacePositionLabel,
  type StabilityState,
} from "../../lib/facePosition";

interface GuidedFaceEnrollmentProps {
  studentId: string;
  onComplete: () => void;
  onError: (message: string) => void;
}

const STEPS = [
  { target: "center" as const, instruction: "Look straight at the camera", assistant: "Hold steady..." },
  { target: "right" as const, instruction: "Turn your face to the right", assistant: "Almost there, a bit more..." },
  { target: "left" as const, instruction: "Turn your face to the left", assistant: "Perfect, hold it!" },
];

export function GuidedFaceEnrollment({ studentId, onComplete, onError }: GuidedFaceEnrollmentProps) {
  // --- STATE ---
  const [stepIndex, setStepIndex] = useState(0);
  const [capturedFrames, setCapturedFrames] = useState<string[]>([]);
  const [stabilityState, setStabilityState] = useState<StabilityState>(createStabilityState());
  const [enrollmentPhase, setEnrollmentPhase] = useState<"detecting" | "capturing" | "enrolling" | "done" | "error">("detecting");
  const [feedback, setFeedback] = useState<string | null>(null);
  const [showFlash, setShowFlash] = useState(false);
  const [lastPosition, setLastPosition] = useState<FacePositionLabel>("not_detected");
  const [debugText, setDebugText] = useState<string>("");
  
  // States
  const [manualMode, setManualMode] = useState(false);
  const [isBlackScreen, setIsBlackScreen] = useState(false);

  // --- REFS ---
  const videoRef = useRef<HTMLVideoElement>(null);
  const captureLockRef = useRef(false);

  // --- CAMERA & DETECTION ---
  const { 
    error: cameraError, 
    isReady, 
    isActive,
    captureFrame,
    resume: resumeCamera
  } = useNativeCamera(videoRef, { facingMode: "user", muted: true });

  const { 
    faceBox, 
    landmarks, 
    isModelLoading,
    isModelReady,
    timedOut,
  } = useFaceDetection(videoRef, isReady && enrollmentPhase === "detecting" && !manualMode);

  // Handle detection timeout
  useEffect(() => {
    if (timedOut && !manualMode) setManualMode(true);
  }, [timedOut, manualMode]);

  // Handle Black Screen
  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (isReady && !isActive) {
      timer = setTimeout(() => setIsBlackScreen(true), 3000);
    } else if (isActive) {
      setIsBlackScreen(false);
    }
    return () => clearTimeout(timer);
  }, [isReady, isActive]);

  // --- CAPTURE LOGIC ---
  const handleCapture = useCallback(async () => {
    if (captureLockRef.current) return;
    captureLockRef.current = true;

    const frame = captureFrame();
    if (!frame) {
      captureLockRef.current = false;
      return;
    }

    const updatedFrames = [...capturedFrames, frame];
    setCapturedFrames(updatedFrames);
    setShowFlash(true);
    setTimeout(() => setShowFlash(false), 200);
    
    if (updatedFrames.length < 3) {
      setFeedback("✓ Step Complete");
      setTimeout(() => {
        setStepIndex(prev => prev + 1);
        setStabilityState(createStabilityState());
        setFeedback(null);
        setEnrollmentPhase("detecting");
        captureLockRef.current = false;
      }, 600);
    } else {
      setEnrollmentPhase("enrolling");
      try {
        const res = await fetch(`/api/students/${studentId}/enroll-face`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ images: updatedFrames }),
        });
        
        const data = await res.json().catch(() => ({}));

        if (!res.ok) {
          throw new Error(data.detail || "Enrollment failed");
        }

        setEnrollmentPhase("done");
        setTimeout(onComplete, 1500);
      } catch (err: any) {
        setEnrollmentPhase("error");
        onError(err.message);
      } finally {
        captureLockRef.current = false;
      }
    }
  }, [captureFrame, capturedFrames, studentId, onComplete, onError]);

  // Detection Loop
  useEffect(() => {
    if (manualMode || enrollmentPhase !== "detecting" || !isReady || !isModelReady || captureLockRef.current) return;

    if (faceBox) {
      const currentStep = STEPS[stepIndex];
      const result = getFacePosition(faceBox, landmarks, currentStep.target, stabilityState);
      const newState = updateStability(stabilityState, result.position, currentStep.target);
      
      setStabilityState(newState);
      setLastPosition(result.position);
      setDebugText(result.debug || "");

      const isStableNow = newState.matchingSince !== null && (Date.now() - newState.matchingSince) >= STABILITY_MS;
      if (isStableNow && result.position === currentStep.target) {
        setEnrollmentPhase("capturing");
        handleCapture();
      }
    } else {
      setLastPosition("not_detected");
      setDebugText("No face detected");
    }
  }, [enrollmentPhase, faceBox, landmarks, isReady, isModelReady, stepIndex, stabilityState, handleCapture, manualMode]);

  // --- RENDER ---
  const isInitializing = (!isReady || isModelLoading) && !manualMode && !cameraError;

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

      {/* Header Info */}
      <div className="absolute top-0 w-full p-6 flex justify-between items-start z-50">
        <div className="bg-black/60 backdrop-blur-md p-3 rounded-2xl border border-white/10 flex items-center gap-3">
          <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center font-black">
            {stepIndex + 1}
          </div>
          <div>
            <p className="text-[10px] font-bold text-blue-400 uppercase tracking-widest">Enrolling</p>
            <p className="text-sm font-bold">Face Entry</p>
          </div>
        </div>
        
        {/* Step Progress Dots */}
        <div className="flex gap-2 p-4">
          {[0,1,2].map(i => <div key={i} className={`w-3 h-3 rounded-full ${i <= stepIndex ? 'bg-blue-500 shadow-[0_0_10px_#3b82f6]' : 'bg-white/20'}`} />)}
        </div>
      </div>

      {/* FOOTER: Instructions & Action */}
      {!isInitializing && (
        <div className="absolute bottom-0 w-full p-8 pb-10 bg-gradient-to-t from-black via-black/90 to-transparent z-50 flex flex-col items-center">
          
          <div className="text-center mb-8">
            <h2 className="text-2xl font-black mb-1">{feedback || STEPS[stepIndex].instruction}</h2>
            <p className="text-slate-400 text-sm">{lastPosition === STEPS[stepIndex].target ? "Hold still..." : "Position your face in the center"}</p>
            {/* Debug info (Hidden logic) */}
            <p className="text-[8px] text-white/20 mt-2 font-mono">{debugText}</p>
          </div>

          <div className="flex items-center gap-10">
             {/* Fallback Switch */}
             <button 
                onClick={(e) => { e.stopPropagation(); setManualMode(!manualMode); }}
                className="w-12 h-12 bg-white/10 rounded-full flex items-center justify-center border border-white/20"
                title="Toggle Mode"
             >
                <Zap className={`w-5 h-5 ${manualMode ? 'text-amber-400' : 'text-slate-400'}`} />
             </button>

             {/* MAIN CAPTURE TRIGGER */}
             <button
                onClick={(e) => { e.stopPropagation(); handleCapture(); }}
                className="group relative w-24 h-24 bg-white rounded-full flex items-center justify-center shadow-[0_0_40px_rgba(255,255,255,0.3)] active:scale-95 transition-all"
             >
                <div className="absolute inset-[-4px] border-2 border-blue-500 rounded-full animate-ping opacity-20" />
                <div className="w-20 h-20 border-4 border-slate-950 rounded-full flex items-center justify-center">
                  <Camera className="text-black w-10 h-10" />
                </div>
             </button>

             <div className="w-12" /> {/* Spacer */}
          </div>
          
          <p className="mt-6 text-[10px] font-bold text-slate-500 uppercase tracking-widest">
            {manualMode ? "Manual Capture Active" : "Auto-Detection Active"}
          </p>
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
             <><Loader2 className="w-16 h-16 text-blue-500 animate-spin mb-6" /><p className="text-2xl font-black italic">PROCESSING...</p></>
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
