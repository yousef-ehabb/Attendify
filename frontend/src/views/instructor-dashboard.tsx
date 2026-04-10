import { useEffect, useState } from "react"
import {
  Presentation,
  QrCode,
  Users,
  Square,
  RefreshCcw,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  ArrowRight,
} from "lucide-react"

import {
  ApiError,
  type AttendanceRecord,
  type SessionResponse,
  sessionsApi,
} from "@/lib/api"

export function InstructorDashboard() {
  const [courseName, setCourseName] = useState("")
  const [instructor, setInstructor] = useState("")
  const [activeSessionId, setActiveSessionId] = useState<number | null>(null)
  
  const [creatingSession, setCreatingSession] = useState(false)
  const [globalError, setGlobalError] = useState<string | null>(null)

  const [qrImageUrl, setQrImageUrl] = useState<string | null>(null)
  const [secondsUntilRefresh, setSecondsUntilRefresh] = useState(30)
  const [refreshingQr, setRefreshingQr] = useState(false)

  const [attendanceRecords, setAttendanceRecords] = useState<AttendanceRecord[]>([])
  const [loadingAttendance, setLoadingAttendance] = useState(false)
  const [showAttendance, setShowAttendance] = useState(false)

  // Initialization: check if there's already an active session
  useEffect(() => {
    const loadSessions = async () => {
      try {
        const response = await sessionsApi.list()
        const active = response.find((s) => s.is_active)
        if (active) {
          setActiveSessionId(active.id)
        }
      } catch (error) {
        console.error("Failed to fetch initial sessions", error)
      }
    }
    void loadSessions()
  }, [])

  // Handle Session Creation
  const handleCreateSession = async () => {
    if (!courseName.trim() || !instructor.trim()) {
      setGlobalError("Course name and instructor name are required.")
      return
    }
    setCreatingSession(true)
    setGlobalError(null)

    try {
      const created = await sessionsApi.start({
        course_name: courseName.trim(),
        instructor: instructor.trim(),
      })
      setActiveSessionId(created.id)
      setCourseName("")
      setInstructor("")
    } catch (error) {
      setGlobalError(
        error instanceof ApiError || error instanceof Error 
          ? error.message 
          : "Unable to start session.",
      )
    } finally {
      setCreatingSession(false)
    }
  }

  // Manage QR Rotation
  useEffect(() => {
    if (!activeSessionId) return

    setRefreshingQr(true)
    setQrImageUrl(sessionsApi.qrUrl(activeSessionId))
    setSecondsUntilRefresh(30)
    setRefreshingQr(false)

    const refreshQr = () => {
      setRefreshingQr(true)
      setQrImageUrl(sessionsApi.qrUrl(activeSessionId, true))
      setSecondsUntilRefresh(30)
      window.setTimeout(() => setRefreshingQr(false), 600)
    }

    const refreshTimer = window.setInterval(refreshQr, 30_000)
    const countdownTimer = window.setInterval(() => {
      setSecondsUntilRefresh((current) => (current <= 1 ? 30 : current - 1))
    }, 1_000)

    return () => {
      window.clearInterval(refreshTimer)
      window.clearInterval(countdownTimer)
    }
  }, [activeSessionId])

  // Manage Live Attendance Polling
  useEffect(() => {
    if (!activeSessionId) return

    const loadAttendance = async () => {
      try {
        const response = await sessionsApi.listAttendance(activeSessionId)
        setAttendanceRecords(response)
      } catch (error) {
        console.error("Attendance polling failed", error)
      }
    }

    void loadAttendance()
    const pollTimer = window.setInterval(loadAttendance, 5_000)
    return () => window.clearInterval(pollTimer)
  }, [activeSessionId])

  const handleEndSession = async () => {
    if (!activeSessionId) return
    try {
      await sessionsApi.end(activeSessionId)
      setActiveSessionId(null)
      setQrImageUrl(null)
      setShowAttendance(false)
    } catch (error) {
      setGlobalError("Failed to end session.")
    }
  }

  const formatTime = (isoString: string) => {
    return new Date(isoString).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }

  const handleDownloadCsv = () => {
    if (!activeSessionId) return
    window.open(`/api/sessions/${activeSessionId}/attendance/export`, "_blank")
  }

  // --- Render State 1: Idle (Create Session) ---
  if (!activeSessionId) {
    return (
      <div className="flex h-full flex-col items-center justify-center p-6 bg-white dark:bg-slate-950 min-h-[85vh]">
        <div className="w-full max-w-sm space-y-8">
          <div className="text-center">
            <div className="mx-auto mb-6 flex size-20 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400">
              <Presentation className="size-10" />
            </div>
            <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
              New Session
            </h1>
            <p className="mt-2 text-slate-500 dark:text-slate-400">
              Start an attendance session to display the class QR.
            </p>
          </div>

          {globalError && (
            <div className="flex items-center gap-3 rounded-2xl bg-red-50 p-4 text-red-600 dark:bg-red-500/10 dark:text-red-400">
              <AlertCircle className="size-5 shrink-0" />
              <p className="text-sm font-medium">{globalError}</p>
            </div>
          )}

          <div className="space-y-4">
            <input
              type="text"
              placeholder="Course Name (e.g. CS101)"
              value={courseName}
              onChange={(e) => setCourseName(e.target.value)}
              className="w-full rounded-2xl border-2 border-slate-200 bg-slate-50 p-5 text-xl font-medium text-slate-900 outline-none transition-colors focus:border-emerald-500 focus:bg-white dark:border-slate-800 dark:bg-slate-900 dark:text-white dark:focus:border-emerald-500"
            />
            <input
              type="text"
              placeholder="Instructor Name"
              value={instructor}
              onChange={(e) => setInstructor(e.target.value)}
              className="w-full rounded-2xl border-2 border-slate-200 bg-slate-50 p-5 text-xl font-medium text-slate-900 outline-none transition-colors focus:border-emerald-500 focus:bg-white dark:border-slate-800 dark:bg-slate-900 dark:text-white dark:focus:border-emerald-500"
            />
            <button
              onClick={handleCreateSession}
              disabled={creatingSession}
              className="flex min-h-[72px] mt-4 w-full items-center justify-center gap-3 rounded-2xl bg-emerald-600 px-6 text-xl font-semibold text-white shadow-lg shadow-emerald-500/20 transition-transform active:scale-95 disabled:opacity-50"
            >
              <span>{creatingSession ? "Starting..." : "Start Session"}</span>
              {!creatingSession && <ArrowRight className="size-6" />}
            </button>
          </div>
        </div>
      </div>
    )
  }

  // --- Render State 2: Active Session ---
  return (
    <div className="flex h-full flex-col p-6 items-center justify-center min-h-[85vh] overflow-hidden bg-slate-50 dark:bg-slate-950">
      
      {/* Dynamic QR Display */}
      <div className="flex w-full flex-col items-center flex-1 justify-center space-y-6">
        <div className="text-center">
          <span className="inline-flex items-center gap-2 rounded-full bg-emerald-100 px-4 py-1.5 text-sm font-semibold text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            Session Live
          </span>
          <h2 className="mt-4 text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
            Scan to Attend
          </h2>
        </div>

        <div className={`relative flex aspect-square w-full max-w-[320px] sm:max-w-[400px] items-center justify-center rounded-[2.5rem] bg-white p-6 shadow-2xl transition-opacity duration-300 ${refreshingQr ? 'opacity-50 scale-95' : 'opacity-100 scale-100'} ring-4 ring-emerald-500/10`}>
          {qrImageUrl ? (
             <img src={qrImageUrl} alt="Class QR" className="w-full h-full object-contain rounded-xl" />
          ) : (
            <QrCode className="size-16 text-slate-300 animate-pulse" />
          )}
          
          {/* Refresh Timer Indicator */}
          <div className="absolute -bottom-4 right-8 rounded-full bg-slate-900 px-4 py-1.5 text-xs font-bold text-white shadow-lg dark:bg-white dark:text-slate-900">
            Resets in {secondsUntilRefresh}s
          </div>
        </div>
      </div>

      {/* Floating Action Bar (Bottom) */}
      <div className="w-full max-w-sm mt-8 flex flex-col gap-3 z-10">
        
        {/* Collapsible Attendance List */}
        <div className="bg-white dark:bg-slate-900 rounded-3xl overflow-hidden shadow-xl border border-slate-200 dark:border-slate-800 transition-all duration-300">
          <button 
            onClick={() => setShowAttendance(!showAttendance)}
            className="flex w-full items-center justify-between p-5 text-left active:bg-slate-50 dark:active:bg-slate-800"
          >
            <div className="flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-full bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400">
                <Users className="size-5" />
              </div>
              <div>
                <div className="text-base font-bold text-slate-900 dark:text-white">
                  Live Roster
                </div>
                <div className="text-sm font-medium text-slate-500">
                  {attendanceRecords.length} present
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  handleDownloadCsv()
                }}
                className="rounded-lg bg-blue-50 px-3 py-1.5 text-xs font-bold text-blue-700 hover:bg-blue-100 dark:bg-blue-900/40 dark:text-blue-400"
              >
                CSV
              </button>
              {showAttendance ? <ChevronDown className="text-slate-400" /> : <ChevronUp className="text-slate-400" />}
            </div>
          </button>
          
          {showAttendance && (
            <div className="border-t border-slate-100 dark:border-slate-800 max-h-[40vh] overflow-y-auto">
               {attendanceRecords.length === 0 ? (
                 <div className="p-8 text-center text-sm text-slate-500">
                   Waiting for first student scan...
                 </div>
               ) : (
                 <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                    {attendanceRecords.map((rec) => (
                      <li key={rec.student_id} className="flex items-center justify-between p-4">
                        <div>
                          <div className="font-semibold text-slate-900 dark:text-white">{rec.student_name}</div>
                          <div className="text-xs text-slate-500">{rec.student_email}</div>
                        </div>
                        <div className="text-xs font-bold text-emerald-600 dark:text-emerald-400">
                          {formatTime(rec.verified_at)}
                        </div>
                      </li>
                    ))}
                 </ul>
               )}
            </div>
          )}
        </div>

        <button
          onClick={handleEndSession}
          className="flex min-h-[64px] w-full items-center justify-center gap-2 rounded-[2rem] bg-slate-900 px-6 text-lg font-bold text-white transition-transform active:scale-95 dark:bg-slate-800 dark:hover:bg-slate-700"
        >
          <Square className="size-5 fill-current" />
          End Session
        </button>
      </div>

    </div>
  )
}
