import { useCallback, useEffect, useRef, useState } from "react"
import { GuidedFaceEnrollment } from "./GuidedFaceEnrollment"
import { useNativeCamera } from "../../hooks/useNativeCamera"
import { useQRScanner } from "../../hooks/useQRScanner"
import {
  Camera,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  ScanFace,
  QrCode,
  User,
  ArrowRight,
  ArrowLeft,
} from "lucide-react"

type FlowStep = "welcome" | "register" | "capture" | "setup" | "scan" | "face" | "result"

interface QrSessionInfo {
  sessionId: number
  courseName: string
  instructor: string
  expiresAt: string
  token: string
}

interface FlowResult {
  tone: "success" | "error" | "info"
  title: string
  message: string
  meta: string
}

function parseError(payload: unknown): string {
  if (!payload) return ""
  if (typeof payload === "object" && "detail" in payload) {
    const d = (payload as Record<string, unknown>).detail
    if (typeof d === "string") return d
    if (d && typeof d === "object" && "message" in d) {
      return String((d as Record<string, unknown>).message)
    }
  }
  if (typeof payload === "object" && "message" in payload) {
    return String((payload as Record<string, unknown>).message)
  }
  return ""
}

const MAX_RETRIES = 3
const MAX_REG_PHOTOS = 5

function StudentQrScanView({
  studentId,
  onScanSuccess,
  onErrorMsg,
  setIsBusy,
  setBusyLabel
}: {
  studentId: string
  onScanSuccess: (info: QrSessionInfo) => void
  onErrorMsg: (m: string) => void
  setIsBusy: (b: boolean) => void
  setBusyLabel: (l: string) => void
}) {
  const scanVideoRef = useRef<HTMLVideoElement>(null)

  const verifyQr = async (token: string) => {
    setIsBusy(true)
    setBusyLabel("Verifying QR code...")
    onErrorMsg("")

    try {
      const res = await fetch("/api/attend/verify-qr", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      })
      const payload = await res.json().catch(() => ({}))

      if (res.status === 410) {
        throw new Error("This QR code has expired.")
      }
      if (res.status === 403) {
        throw new Error("This attendance session has been closed by the instructor.")
      }
      if (!res.ok) {
        throw new Error(parseError(payload) || "QR verification failed.")
      }

      const data = payload as {
        session_id: number
        course_name: string
        instructor: string
        expires_at: string
      }
      
      stopScanner()
      onScanSuccess({
        sessionId: data.session_id,
        courseName: data.course_name,
        instructor: data.instructor,
        expiresAt: data.expires_at,
        token: token,
      })
    } catch (err: unknown) {
      onErrorMsg(err instanceof Error ? err.message : "Invalid QR Code")
    } finally {
      setIsBusy(false)
    }
  }

  const handleQrDetected = useCallback(
    async (token: string) => {
      if (!studentId) return
      await verifyQr(token)
    },
    [studentId],
  )

  const {
    error: scannerError,
    start: startScanner,
    stop: stopScanner,
  } = useQRScanner(scanVideoRef, handleQrDetected)

  useEffect(() => {
    const timer = setTimeout(() => startScanner(), 300)
    return () => clearTimeout(timer)
  }, [startScanner])

  return (
    <>
      <video
        ref={scanVideoRef}
        playsInline
        autoPlay
        muted
        className="absolute inset-0 h-full w-full object-cover"
      />
      {/* Overlay Darkener */}
      <div className="absolute inset-0 bg-black/40" />

      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="w-64 h-64 border-4 border-white/80 rounded-3xl relative">
          <div className="absolute -top-1 -left-1 w-8 h-8 border-t-4 border-l-4 border-blue-500 rounded-tl-xl" />
          <div className="absolute -top-1 -right-1 w-8 h-8 border-t-4 border-r-4 border-blue-500 rounded-tr-xl" />
          <div className="absolute -bottom-1 -left-1 w-8 h-8 border-b-4 border-l-4 border-blue-500 rounded-bl-xl" />
          <div className="absolute -bottom-1 -right-1 w-8 h-8 border-b-4 border-r-4 border-blue-500 rounded-br-xl" />
        </div>
      </div>

      <div className="absolute bottom-0 left-0 right-0 p-6 pb-12 bg-gradient-to-t from-black/90 to-transparent pt-32">
        <div className="text-center text-white">
          <QrCode className="mx-auto mb-4 size-10 text-white/50" />
          <h2 className="text-2xl font-bold tracking-tight">Scan Class QR</h2>
          <p className="mt-2 text-white/70">
            Point your camera at the instructor's screen. Scanning is automatic.
          </p>
          {scannerError && <p className="mt-2 text-red-400 text-sm font-bold">{scannerError}</p>}
        </div>
      </div>
    </>
  )
}

function StudentFaceMatchView({
  studentId,
  sessionInfo,
  onResult,
  onErrorMsg,
  setIsBusy,
  setBusyLabel
}: {
  studentId: string
  sessionInfo: QrSessionInfo
  onResult: (result: FlowResult) => void
  onErrorMsg: (m: string) => void
  setIsBusy: (b: boolean) => void
  setBusyLabel: (l: string) => void
}) {
  const faceVideoRef = useRef<HTMLVideoElement>(null)
  const [retryCount, setRetryCount] = useState(0)

  const {
    error: faceCameraError,
    isReady: faceReady,
    stop: stopFaceCamera,
    captureFrame,
  } = useNativeCamera(faceVideoRef, { facingMode: "user", muted: true })

  const handleVerifyFace = async () => {
    if (!sessionInfo || !studentId) return
    if (retryCount >= MAX_RETRIES) {
      stopFaceCamera()
      onResult({
        tone: "error",
        title: "Max Retries Reached",
        message: "Please contact your instructor for help completing attendance.",
        meta: "",
      })
      return
    }

    setIsBusy(true)
    setBusyLabel("Analyzing face...")
    onErrorMsg("")

    const frame = captureFrame()
    if (!frame) {
      onErrorMsg("Could not capture frame. Ensure camera is active.")
      setIsBusy(false)
      return
    }

    try {
      const res = await fetch("/api/attend/verify-face", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: sessionInfo.token,
          student_id: Number(studentId),
          image: frame,
        }),
      })
      const payload = await res.json().catch(() => ({}))

      if (res.status === 409) {
        stopFaceCamera()
        onResult({
          tone: "info",
          title: "Already Marked",
          message: "Your attendance for this session has already been recorded.",
          meta: `Session ${sessionInfo.sessionId}`,
        })
        return
      }

      if (!res.ok) {
        const newRetry = retryCount + 1
        setRetryCount(newRetry)
        if (newRetry >= MAX_RETRIES) {
          stopFaceCamera()
          onResult({
            tone: "error",
            title: "Verification Failed",
            message: "We couldn't verify your identity after multiple attempts.",
            meta: "Please report to the instructor.",
          })
          return
        }
        throw new Error(`Face mismatch. Retries left: ${MAX_RETRIES - newRetry}`)
      }

      const data = payload as { verified_at: string }
      const timeStr = data.verified_at
        ? `Verified at ${new Date(data.verified_at).toLocaleTimeString()}`
        : ""

      stopFaceCamera()
      onResult({
        tone: "success",
        title: "Attendance Recorded",
        message: "You are checked in for this session.",
        meta: timeStr,
      })
    } catch (err: unknown) {
      onErrorMsg(err instanceof Error ? err.message : "Face verification failed")
    } finally {
      setIsBusy(false)
    }
  }

  return (
    <>
      <video
        ref={faceVideoRef}
        playsInline
        autoPlay
        muted
        className="absolute inset-0 h-full w-full object-cover"
      />
      <div className="absolute inset-0 bg-black/20" />

      <div className="absolute inset-0 flex items-center justify-center pointer-events-none pb-24">
        <div className="w-72 h-80 border-4 border-white/60 rounded-full border-dashed animate-[spin_30s_linear_infinite]" />
        <div className="absolute w-64 h-72 border-4 border-transparent shadow-[0_0_0_9999px_rgba(0,0,0,0.5)] rounded-full" />
      </div>

      <div className="absolute bottom-0 left-0 right-0 p-6 pb-8 bg-gradient-to-t from-black via-black/80 to-transparent pt-32">
        <div className="mb-6 text-center text-white">
          <ScanFace className="mx-auto mb-2 size-8 text-white/50" />
          <h2 className="text-2xl font-bold tracking-tight">Face Match</h2>
          <p className="mt-1 text-sm text-white/70">
            Position your face inside the oval and ensure good lighting.
          </p>
          {faceCameraError && <p className="mt-2 text-sm font-bold text-red-500">{faceCameraError}</p>}
        </div>
        <button
          onClick={handleVerifyFace}
          disabled={!faceReady}
          className="flex min-h-[72px] w-full items-center justify-center gap-2 rounded-2xl bg-blue-500 px-6 text-xl font-bold text-white shadow-xl shadow-blue-500/30 transition-transform active:scale-95 disabled:opacity-50"
        >
          Verify Face
        </button>
      </div>
    </>
  )
}

export function StudentAttendanceFlow() {
  const [step, setStep] = useState<FlowStep>("welcome")
  const [studentId, setStudentId] = useState<string>("")
  const [setupEmail, setSetupEmail] = useState<string>("")
  const [regName, setRegName] = useState("")
  const [regEmail, setRegEmail] = useState("")
  const [sessionInfo, setSessionInfo] = useState<QrSessionInfo | null>(null)
  const [result, setResult] = useState<FlowResult | null>(null)

  const [isBusy, setIsBusy] = useState(false)
  const [busyLabel, setBusyLabel] = useState("Working...")
  const [errorMsg, setErrorMsg] = useState("")

  const handleStartRegistration = () => {
    setRegName("")
    setRegEmail("")
    setErrorMsg("")
    setStep("register")
  }

  const handleSubmitRegistration = async () => {
    if (!regName.trim() || !regEmail.trim()) {
      setErrorMsg("Please enter your name and email")
      return
    }
    setIsBusy(true)
    setErrorMsg("")
    try {
      const res = await fetch("/api/students/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: regName.trim(), email: regEmail.trim() }),
      })
      const payload = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(parseError(payload) || "Registration failed")
      }
      setStudentId(String(payload.id))
      setStep("capture")
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "Registration failed")
    } finally {
      setIsBusy(false)
    }
  }

  const handleSetupComplete = async () => {
    if (!setupEmail.trim()) {
      setErrorMsg("Please enter your registered email")
      return
    }
    setErrorMsg("")
    setIsBusy(true)
    setBusyLabel("Verifying...")
    
    try {
      const res = await fetch(`/api/students/lookup?email=${encodeURIComponent(setupEmail.trim())}`, {
        method: "GET",
        headers: { "Content-Type": "application/json" },
      })
      
      if (res.status === 404) {
        setErrorMsg("Email not found. Please click 'New Student' to register.")
        setIsBusy(false)
        return
      }
      
      const payload = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(parseError(payload) || "Verification failed")
      }
      
      const studentData = payload as { id: number; has_face: boolean }
      setStudentId(String(studentData.id))
      
      if (!studentData.has_face) {
        setStep("capture")
        setErrorMsg("Face not enrolled. Please capture your face.")
        setIsBusy(false)
        return
      }
      
      setStep("scan")
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "Verification failed")
    } finally {
      setIsBusy(false)
    }
  }

  const FullScreenLoading = () => (
    <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-black/60 text-white backdrop-blur-sm">
      <RefreshCw className="mb-4 size-12 animate-spin text-blue-500" />
      <p className="text-xl font-medium tracking-tight">{busyLabel}</p>
    </div>
  )

  const ErrorOverlay = () => {
    if (!errorMsg) return null
    return (
      <div className="absolute left-4 right-4 top-16 z-50 rounded-2xl bg-red-500 p-4 text-white shadow-2xl animate-in slide-in-from-top-4">
        <div className="flex items-start gap-3">
          <AlertCircle className="mt-0.5 size-5 shrink-0" />
          <p className="text-sm font-medium leading-snug">{errorMsg}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="relative flex h-[100dvh] w-full flex-col overflow-hidden bg-slate-950">
      {isBusy && <FullScreenLoading />}
      <ErrorOverlay />

      {step === "welcome" && (
        <div className="flex h-full flex-col items-center justify-center p-6 bg-white dark:bg-slate-950 transition-colors">
          <div className="w-full max-w-sm space-y-8">
            <div className="text-center">
              <div className="mx-auto mb-6 flex size-20 items-center justify-center rounded-full bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400">
                <ScanFace className="size-10" />
              </div>
              <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
                Attendify
              </h1>
              <p className="mt-2 text-slate-500 dark:text-slate-400">
                Face-recognition attendance for your class
              </p>
            </div>

            <div className="space-y-4">
              <button
                onClick={handleStartRegistration}
                className="flex min-h-[72px] w-full items-center justify-center gap-3 rounded-2xl bg-blue-600 px-6 text-xl font-semibold text-white shadow-lg shadow-blue-500/20 transition-transform active:scale-95"
              >
                <span>New Student</span>
                <ArrowRight className="size-6" />
              </button>
              <button
                onClick={() => { setErrorMsg(""); setStep("setup") }}
                className="flex min-h-[72px] w-full items-center justify-center gap-3 rounded-2xl border-2 border-slate-200 bg-white px-6 text-xl font-semibold text-slate-700 transition-transform active:scale-95 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              >
                <span>Returning Student</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {step === "register" && (
        <div className="flex h-full flex-col items-center justify-center p-6 bg-white dark:bg-slate-950 transition-colors">
          <div className="w-full max-w-sm space-y-8">
            <div className="text-center">
              <div className="mx-auto mb-6 flex size-20 items-center justify-center rounded-full bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400">
                <User className="size-10" />
              </div>
              <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
                Register
              </h1>
              <p className="mt-2 text-slate-500 dark:text-slate-400">
                Enter your details to get started
              </p>
            </div>

            <div className="space-y-4">
              <input
                type="text"
                autoComplete="off"
                placeholder="Full Name"
                value={regName}
                onChange={(e) => setRegName(e.target.value)}
                className="w-full rounded-2xl border-2 border-slate-200 bg-slate-50 p-5 text-xl font-medium text-slate-900 outline-none transition-colors focus:border-blue-500 dark:border-slate-800 dark:bg-slate-900 dark:text-white dark:focus:border-blue-500"
              />
              <input
                type="email"
                autoComplete="off"
                placeholder="Email Address"
                value={regEmail}
                onChange={(e) => setRegEmail(e.target.value)}
                className="w-full rounded-2xl border-2 border-slate-200 bg-slate-50 p-5 text-xl font-medium text-slate-900 outline-none transition-colors focus:border-blue-500 dark:border-slate-800 dark:bg-slate-900 dark:text-white dark:focus:border-blue-500"
              />
              <button
                onClick={handleSubmitRegistration}
                disabled={isBusy}
                className="flex min-h-[72px] w-full items-center justify-center gap-3 rounded-2xl bg-blue-600 px-6 text-xl font-semibold text-white shadow-lg shadow-blue-500/20 transition-transform active:scale-95 disabled:opacity-50"
              >
                <span>{isBusy ? "Creating..." : "Continue"}</span>
                {!isBusy && <ArrowRight className="size-6" />}
              </button>
              <button
                onClick={() => setStep("welcome")}
                className="flex min-h-[56px] w-full items-center justify-center gap-2 text-sm font-medium text-slate-500 transition-colors hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
              >
                <ArrowLeft className="size-4" /> Back
              </button>
            </div>
          </div>
        </div>
      )}

      {step === "capture" && (
        <GuidedFaceEnrollment
          studentId={studentId}
          onComplete={() => setStep("scan")}
          onError={setErrorMsg}
        />
      )}

      {step === "setup" && (
        <div className="flex h-full flex-col items-center justify-center p-6 bg-white dark:bg-slate-950 transition-colors">
          <div className="w-full max-w-sm space-y-8">
            <div className="text-center">
              <div className="mx-auto mb-6 flex size-20 items-center justify-center rounded-full bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400">
                <User className="size-10" />
              </div>
              <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
                Welcome Back
              </h1>
              <p className="mt-2 text-slate-500 dark:text-slate-400">
                Enter your email to verify your identity.
              </p>
            </div>

            <div className="space-y-4">
              <input
                type="email"
                autoComplete="off"
                placeholder="Student Email"
                value={setupEmail}
                onChange={(e) => setSetupEmail(e.target.value)}
                className="w-full rounded-2xl border-2 border-slate-200 bg-slate-50 p-6 text-center text-xl font-bold text-slate-900 outline-none transition-colors focus:border-blue-500 focus:bg-white dark:border-slate-800 dark:bg-slate-900 dark:text-white dark:focus:border-blue-500"
              />
              <button
                onClick={handleSetupComplete}
                className="flex min-h-[72px] w-full items-center justify-center gap-3 rounded-2xl bg-blue-600 px-6 text-xl font-semibold text-white shadow-lg shadow-blue-500/20 transition-transform active:scale-95 disabled:bg-slate-300"
              >
                <span>Continue</span>
                <ArrowRight className="size-6" />
              </button>
              <button
                onClick={() => setStep("welcome")}
                className="flex min-h-[56px] w-full items-center justify-center gap-2 text-sm font-medium text-slate-500 transition-colors hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
              >
                <ArrowLeft className="size-4" /> Back
              </button>
            </div>
          </div>
        </div>
      )}

      {step === "scan" && (
        <StudentQrScanView
          studentId={studentId}
          onScanSuccess={(info) => {
            setSessionInfo(info)
            setStep("face")
          }}
          onErrorMsg={setErrorMsg}
          setIsBusy={setIsBusy}
          setBusyLabel={setBusyLabel}
        />
      )}

      {step === "face" && sessionInfo && (
        <StudentFaceMatchView
          studentId={studentId}
          sessionInfo={sessionInfo}
          onResult={(r) => {
            setResult(r)
            setStep("result")
          }}
          onErrorMsg={setErrorMsg}
          setIsBusy={setIsBusy}
          setBusyLabel={setBusyLabel}
        />
      )}

      {step === "result" && result && (
        <div
          className={`flex h-[100dvh] w-full flex-col p-6 transition-colors ${
            result.tone === "success"
              ? "bg-green-600"
              : result.tone === "error"
                ? "bg-red-600"
                : "bg-blue-600"
          }`}
        >
          <div className="flex flex-1 flex-col items-center justify-center text-center text-white">
            {result.tone === "success" && (
              <CheckCircle2 className="mb-8 size-32 opacity-90 animate-in zoom-in" />
            )}
            {result.tone === "error" && (
              <AlertCircle className="mb-8 size-32 opacity-90 animate-in zoom-in" />
            )}
            {result.tone === "info" && (
              <ScanFace className="mb-8 size-32 opacity-90 animate-in zoom-in" />
            )}

            <h1 className="mb-4 text-4xl font-bold tracking-tight">{result.title}</h1>
            <p className="text-lg opacity-90">{result.message}</p>
            {result.meta && (
              <div className="mt-6 rounded-full bg-white/20 px-6 py-2 text-sm font-semibold backdrop-blur-md">
                {result.meta}
              </div>
            )}
          </div>

          <div className="pb-8 pt-4">
            <button
              onClick={() => window.location.reload()}
              className="flex min-h-[72px] w-full items-center justify-center rounded-2xl bg-white px-6 text-xl font-bold text-slate-900 shadow-xl transition-transform active:scale-95"
            >
              Finish
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
