import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  BookOpen,
  Calendar,
  Check,
  ChevronRight,
  Clock,
  Download,
  LayoutGrid,
  Plus,
  Presentation,
  QrCode,
  Search,
  Square,
  Trash2,
  UserPlus,
  Users,
  X,
} from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  ApiError,
  type AttendanceRecord,
  type CourseDetailResponse,
  type CourseResponse,
  type CourseStudentStats,
  type SessionRecapResponse,
  coursesApi,
  sessionsApi,
} from "@/lib/api"

type InstructorView =
  | { type: "home" }
  | { type: "course"; courseId: number }
  | { type: "live"; courseId: number; sessionId: number }
  | { type: "recap"; courseId: number; sessionId: number }

function formatShortDate(iso: string) {
  return new Date(iso).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true
  })
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], { 
    hour: "2-digit", 
    minute: "2-digit", 
    hour12: true 
  })
}

export function InstructorDashboard() {
  const [view, setView] = useState<InstructorView>({ type: "home" })
  const [courses, setCourses] = useState<CourseResponse[]>([])
  const [courseDetail, setCourseDetail] = useState<CourseDetailResponse | null>(null)
  const [roster, setRoster] = useState<CourseStudentStats[]>([])
  const [loadingHome, setLoadingHome] = useState(true)
  const [loadingCourse, setLoadingCourse] = useState(false)
  const [globalError, setGlobalError] = useState<string | null>(null)

  const [showNewCourse, setShowNewCourse] = useState(false)
  const [newCourseName, setNewCourseName] = useState("")
  const [newCourseCode, setNewCourseCode] = useState("")
  const [newInstructorName, setNewInstructorName] = useState("")
  const [creatingCourse, setCreatingCourse] = useState(false)

  const loadCourses = useCallback(async () => {
    setLoadingHome(true)
    setGlobalError(null)
    try {
      const data = await coursesApi.list()
      setCourses(data)
    } catch (e) {
      setGlobalError(e instanceof Error ? e.message : "Could not load courses.")
    } finally {
      setLoadingHome(false)
    }
  }, [])

  useEffect(() => {
    void loadCourses()
  }, [loadCourses])

  const loadCourse = useCallback(async (courseId: number) => {
    setCourseDetail(null)
    setRoster([])
    setLoadingCourse(true)
    setGlobalError(null)
    try {
      const [detail, students] = await Promise.all([
        coursesApi.get(courseId),
        coursesApi.listStudents(courseId),
      ])
      setCourseDetail(detail)
      setRoster(students)
    } catch (e) {
      setGlobalError(e instanceof Error ? e.message : "Could not load course.")
    } finally {
      setLoadingCourse(false)
    }
  }, [])

  useEffect(() => {
    if (view.type === "course") {
      void loadCourse(view.courseId)
    }
  }, [view, loadCourse])

  const handleCreateCourse = async () => {
    if (!newCourseName.trim() || !newCourseCode.trim() || !newInstructorName.trim()) {
      toast.error("Fill in course name, code, and instructor name.")
      return
    }
    setCreatingCourse(true)
    try {
      await coursesApi.create({
        name: newCourseName.trim(),
        code: newCourseCode.trim(),
        instructor_name: newInstructorName.trim(),
      })
      toast.success("Course created.")
      setShowNewCourse(false)
      setNewCourseName("")
      setNewCourseCode("")
      setNewInstructorName("")
      await loadCourses()
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Could not create course.")
    } finally {
      setCreatingCourse(false)
    }
  }

  const handleStartSession = async (courseId: number) => {
    try {
      const session = await coursesApi.startSession(courseId)
      setView({ type: "live", courseId, sessionId: session.id })
      toast.success("Session started — show the QR code to students.")
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Could not start session.")
    }
  }

  const handleDeleteCourse = async (courseId: number) => {
    try {
      await coursesApi.delete(courseId)
      toast.success("Course deleted.")
      setView({ type: "home" })
      setCourses(prev => prev.filter(c => c.id !== courseId))
    } catch (e) {
      if (e instanceof ApiError && e.status === 400) {
        toast.error("End the active session before deleting this course.")
      } else {
        toast.error(e instanceof Error ? e.message : "Could not delete course.")
      }
    }
  }

  const openRecap = (courseId: number, sessionId: number) => {
    setView({ type: "recap", courseId, sessionId })
  }

  const resumeLive = (courseId: number, sessionId: number) => {
    setView({ type: "live", courseId, sessionId })
  }

  return (
    <div className="w-full pb-16">
      {globalError && view.type === "home" && (
        <div className="mb-6 flex items-center gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200">
          <AlertCircle className="size-5 shrink-0" />
          <p className="text-sm font-medium">{globalError}</p>
        </div>
      )}

      {view.type === "home" && (
        <CourseHome
          courses={courses}
          loading={loadingHome}
          onOpenCourse={(id) => setView({ type: "course", courseId: id })}
          onNewCourse={() => setShowNewCourse(true)}
          onRefresh={loadCourses}
        />
      )}

      {view.type === "course" && courseDetail && (
        <CourseDetail
          detail={courseDetail}
          roster={roster}
          loading={loadingCourse}
          onBack={() => setView({ type: "home" })}
          onStartSession={() => void handleStartSession(courseDetail.id)}
          onExportCourse={() =>
            window.open(coursesApi.exportUrl(courseDetail.id), "_blank")
          }
          onOpenRecap={(sessionId) => openRecap(courseDetail.id, sessionId)}
          onResumeLive={(sessionId) => resumeLive(courseDetail.id, sessionId)}
          onDeleteCourse={() => void handleDeleteCourse(courseDetail.id)}
        />
      )}

      {view.type === "course" && !courseDetail && loadingCourse && (
        <div className="flex min-h-[40vh] items-center justify-center text-slate-500">
          Loading course…
        </div>
      )}

      {view.type === "course" && !courseDetail && !loadingCourse && globalError && (
        <div className="mx-auto max-w-md space-y-4 rounded-2xl border border-red-200 bg-red-50 p-6 dark:border-red-900/50 dark:bg-red-950/30">
          <p className="text-sm font-medium text-red-800 dark:text-red-200">{globalError}</p>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              className="min-h-11"
              onClick={() => void loadCourse(view.courseId)}
            >
              Retry
            </Button>
            <Button type="button" variant="outline" className="min-h-11" onClick={() => setView({ type: "home" })}>
              All courses
            </Button>
          </div>
        </div>
      )}

      {view.type === "live" && (
        <LiveSessionView
          courseId={view.courseId}
          sessionId={view.sessionId}
          onBackToCourse={() => {
            void loadCourse(view.courseId)
            setView({ type: "course", courseId: view.courseId })
          }}
          onEnded={(sessionId) => openRecap(view.courseId, sessionId)}
        />
      )}

      {view.type === "recap" && (
        <SessionRecapView
          courseId={view.courseId}
          sessionId={view.sessionId}
          onBackToCourse={() => {
            void loadCourse(view.courseId)
            setView({ type: "course", courseId: view.courseId })
          }}
        />
      )}

      {showNewCourse && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="new-course-title"
        >
          <Card className="w-full max-w-md border-slate-200 shadow-2xl dark:border-slate-800">
            <CardHeader>
              <CardTitle id="new-course-title">New course</CardTitle>
              <CardDescription>
                Create a course, then start sessions from its detail page.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Course name
                </label>
                <input
                  className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-slate-900 outline-none ring-offset-2 focus:ring-2 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                  value={newCourseName}
                  onChange={(e) => setNewCourseName(e.target.value)}
                  placeholder="Programming 101"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Course code (unique)
                </label>
                <input
                  className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-slate-900 outline-none ring-offset-2 focus:ring-2 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                  value={newCourseCode}
                  onChange={(e) => setNewCourseCode(e.target.value)}
                  placeholder="CS101"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Instructor name
                </label>
                <input
                  className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-slate-900 outline-none ring-offset-2 focus:ring-2 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                  value={newInstructorName}
                  onChange={(e) => setNewInstructorName(e.target.value)}
                  placeholder="Dr. Smith"
                />
              </div>
              <div className="flex gap-3 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  className="min-h-11 flex-1"
                  onClick={() => setShowNewCourse(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  className="min-h-11 flex-1 bg-emerald-600 hover:bg-emerald-700"
                  disabled={creatingCourse}
                  onClick={() => void handleCreateCourse()}
                >
                  {creatingCourse ? "Saving…" : "Create"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}

function CourseHome({
  courses,
  loading,
  onOpenCourse,
  onNewCourse,
  onRefresh,
}: {
  courses: CourseResponse[]
  loading: boolean
  onOpenCourse: (id: number) => void
  onNewCourse: () => void
  onRefresh: () => void
}) {
  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wider text-blue-600 dark:text-blue-400">
            Instructor
          </p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
            Attendify command center
          </h1>
          <p className="mt-2 max-w-xl text-slate-600 dark:text-slate-400">
            Manage courses, run live sessions with rotating QR codes, and review attendance.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            className="min-h-11"
            onClick={() => onRefresh()}
          >
            Refresh
          </Button>
          <Button
            type="button"
            className="min-h-11 gap-2 bg-blue-600 hover:bg-blue-700"
            onClick={onNewCourse}
          >
            <Plus className="size-4" />
            New course
          </Button>
        </div>
      </div>

      {loading ? (
        <p className="text-slate-500">Loading courses…</p>
      ) : courses.length === 0 ? (
        <Card className="border-dashed border-slate-300 dark:border-slate-700">
          <CardContent className="flex flex-col items-center gap-4 py-16 text-center">
            <LayoutGrid className="size-12 text-slate-400" />
            <div>
              <p className="font-semibold text-slate-900 dark:text-white">No courses yet</p>
              <p className="mt-1 text-sm text-slate-500">
                Create a course to start scheduling class sessions.
              </p>
            </div>
            <Button className="min-h-11 gap-2" onClick={onNewCourse}>
              <Plus className="size-4" />
              Create your first course
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {courses.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => onOpenCourse(c.id)}
              className="group min-h-[44px] rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-sm outline-none ring-offset-2 transition hover:border-blue-300 hover:shadow-md focus-visible:ring-2 focus-visible:ring-blue-500 dark:border-slate-800 dark:bg-slate-900/80 dark:hover:border-blue-700"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="rounded-xl bg-blue-50 p-2 text-blue-600 dark:bg-blue-950/50 dark:text-blue-400">
                  <BookOpen className="size-6" />
                </div>
                <ChevronRight className="size-5 text-slate-400 transition group-hover:translate-x-0.5 group-hover:text-slate-600 dark:group-hover:text-slate-300" />
              </div>
              <h2 className="mt-4 text-lg font-bold text-slate-900 dark:text-white">
                {c.name}
              </h2>
              <p className="text-sm font-medium text-slate-500">{c.code}</p>
              <div className="mt-4 flex flex-wrap gap-3 text-xs font-medium text-slate-600 dark:text-slate-400">
                <span className="inline-flex items-center gap-1">
                  <Users className="size-3.5" />
                  {c.student_count} students
                </span>
                <span className="inline-flex items-center gap-1">
                  <Calendar className="size-3.5" />
                  {c.session_count} sessions
                </span>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function CourseDetail({
  detail,
  roster,
  loading,
  onBack,
  onStartSession,
  onExportCourse,
  onOpenRecap,
  onResumeLive,
  onDeleteCourse,
}: {
  detail: CourseDetailResponse
  roster: CourseStudentStats[]
  loading: boolean
  onBack: () => void
  onStartSession: () => void
  onExportCourse: () => void
  onOpenRecap: (sessionId: number) => void
  onResumeLive: (sessionId: number) => void
  onDeleteCourse: () => void
}) {
  const activeSession = detail.sessions.find((s) => s.is_active)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <Button
            type="button"
            variant="ghost"
            className="mb-2 min-h-11 gap-2 px-0 text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
            onClick={onBack}
          >
            <ArrowLeft className="size-4" />
            All courses
          </Button>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
            {detail.name}
          </h1>
          <p className="mt-1 text-slate-600 dark:text-slate-400">
            {detail.code} · {detail.instructor_name}
          </p>
          <div className="mt-3 flex flex-wrap gap-4 text-sm font-medium text-slate-600 dark:text-slate-400">
            <span>{detail.student_count} students in roster</span>
            <span>{detail.session_count} sessions held</span>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            className="min-h-11 gap-2"
            onClick={onExportCourse}
          >
            <Download className="size-4" />
            Export CSV
          </Button>
          <Button
            type="button"
            variant="outline"
            className="min-h-11 gap-2 border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700 dark:border-red-900/50 dark:hover:bg-red-950/30"
            onClick={() => setShowDeleteConfirm(true)}
          >
            <Trash2 className="size-4" />
            Delete course
          </Button>
          {activeSession ? (
            <Button
              type="button"
              className="min-h-11 gap-2 bg-emerald-600 hover:bg-emerald-700"
              onClick={() => onResumeLive(activeSession.id)}
            >
              <Presentation className="size-4" />
              Open live session
            </Button>
          ) : (
            <Button
              type="button"
              className="min-h-11 gap-2 bg-emerald-600 hover:bg-emerald-700"
              onClick={onStartSession}
            >
              <Plus className="size-4" />
              Start new session
            </Button>
          )}
        </div>
      </div>

      {loading ? (
        <p className="text-slate-500">Updating…</p>
      ) : null}

      <Card className="border-slate-200 dark:border-slate-800">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Users className="size-5 text-blue-600 dark:text-blue-400" />
            Student roster
          </CardTitle>
          <CardDescription>
            Attendance rates are computed across all sessions for this course. Below 75% is flagged.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {roster.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-500">
              No students yet — students appear after their first check-in for this course.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead className="text-right">Sessions</TableHead>
                  <TableHead className="text-right">Rate</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {roster.map((r) => (
                  <TableRow key={r.student_id}>
                    <TableCell className="font-medium text-slate-900 dark:text-white">
                      <div className="flex items-center gap-2">
                        {r.name}
                        {r.consecutive_misses >= 3 && (
                          <span className="inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-red-700 dark:bg-red-900/40 dark:text-red-300">
                            At Risk
                          </span>
                        )}
                        {r.consecutive_misses === 2 && (
                          <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
                            Warning
                          </span>
                        )}
                        {r.attendance_rate < 75 && r.consecutive_misses < 3 && (
                          <AlertTriangle
                            className="inline size-4 text-amber-600 dark:text-amber-400"
                            aria-label="Below 75% attendance"
                          />
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-slate-600 dark:text-slate-400">
                      {r.email}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {r.sessions_attended} / {r.total_sessions}
                    </TableCell>
                    <TableCell className="text-right font-semibold tabular-nums">
                      {r.attendance_rate}%
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card className="border-slate-200 dark:border-slate-800">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Calendar className="size-5 text-emerald-600 dark:text-emerald-400" />
            Session history
          </CardTitle>
        </CardHeader>
        <CardContent>
          {detail.sessions.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-500">
              No sessions yet. Start one to generate a QR code.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>#</TableHead>
                  <TableHead>When</TableHead>
                  <TableHead>Present</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {detail.sessions.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="font-mono text-sm">{s.session_number}</TableCell>
                    <TableCell>{formatShortDate(s.started_at)}</TableCell>
                    <TableCell className="tabular-nums">{s.present_count}</TableCell>
                    <TableCell>
                      {s.is_active ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300">
                          Live
                        </span>
                      ) : (
                        <span className="text-xs text-slate-500">Ended</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {s.is_active ? (
                        <Button
                          type="button"
                          size="sm"
                          className="min-h-11"
                          onClick={() => onResumeLive(s.id)}
                        >
                          Open
                        </Button>
                      ) : (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="min-h-11"
                          onClick={() => onOpenRecap(s.id)}
                        >
                          Recap
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {showDeleteConfirm && (
        <div
          className="fixed inset-0 z-[110] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
        >
          <Card className="w-full max-w-sm border-slate-200 shadow-2xl dark:border-slate-800">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-red-600">
                <AlertTriangle className="size-5" />
                Delete course?
              </CardTitle>
              <CardDescription className="text-slate-600 dark:text-slate-400">
                Are you sure you want to delete <strong>{detail.name}</strong>? This will permanently delete all sessions and attendance records.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex gap-3 pt-2">
              <Button
                type="button"
                variant="outline"
                className="flex-1"
                onClick={() => setShowDeleteConfirm(false)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="destructive"
                className="flex-1"
                onClick={() => {
                  setShowDeleteConfirm(false)
                  onDeleteCourse()
                }}
              >
                Yes, delete
              </Button>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}

function LiveSessionView({
  courseId,
  sessionId,
  onBackToCourse,
  onEnded,
}: {
  courseId: number
  sessionId: number
  onBackToCourse: () => void
  onEnded: (sessionId: number) => void
}) {
  const [detail, setDetail] = useState<CourseDetailResponse | null>(null)
  const [roster, setRoster] = useState<CourseStudentStats[]>([])
  const [records, setRecords] = useState<AttendanceRecord[]>([])
  const [pendingCheckins, setPendingCheckins] = useState<string[]>([])
  const [qrImageUrl, setQrImageUrl] = useState<string | null>(null)
  const [secondsUntilRefresh, setSecondsUntilRefresh] = useState(30)
  const [refreshingQr, setRefreshingQr] = useState(false)
  const [manualId, setManualId] = useState("")
  const [manualSearch, setManualSearch] = useState("")
  const [highlightIds, setHighlightIds] = useState<Set<number>>(new Set())
  const prevIdsRef = useRef<Set<number>>(new Set())

  const sessionMeta = useMemo(() => {
    if (!detail) return null
    return detail.sessions.find((s) => s.id === sessionId) ?? null
  }, [detail, sessionId])

  useEffect(() => {
    const load = async () => {
      try {
        const [d, r] = await Promise.all([
          coursesApi.get(courseId),
          coursesApi.listStudents(courseId),
        ])
        setDetail(d)
        setRoster(r)
      } catch {
        toast.error("Could not load course.")
      }
    }
    void load()
  }, [courseId])

  useEffect(() => {
    setRefreshingQr(true)
    setQrImageUrl(sessionsApi.qrUrl(sessionId))
    setSecondsUntilRefresh(30)
    setRefreshingQr(false)

    const refreshQr = () => {
      setRefreshingQr(true)
      setQrImageUrl(sessionsApi.qrUrl(sessionId, true))
      setSecondsUntilRefresh(30)
      window.setTimeout(() => setRefreshingQr(false), 500)
    }

    const refreshTimer = window.setInterval(refreshQr, 30_000)
    const countdownTimer = window.setInterval(() => {
      setSecondsUntilRefresh((c) => (c <= 1 ? 30 : c - 1))
    }, 1_000)

    return () => {
      window.clearInterval(refreshTimer)
      window.clearInterval(countdownTimer)
    }
  }, [sessionId])

  useEffect(() => {
    const poll = async () => {
      try {
        const [list, pending] = await Promise.all([
          sessionsApi.listAttendance(sessionId),
          sessionsApi.listPendingCheckins(sessionId)
        ])
        setRecords(list)
        setPendingCheckins(pending)

        const next = new Set(list.map((x) => x.student_id))
        if (prevIdsRef.current.size > 0) {
          const added = [...next].filter((id) => !prevIdsRef.current.has(id))
          if (added.length > 0) {
            setHighlightIds(new Set(added))
            window.setTimeout(() => setHighlightIds(new Set()), 900)
          }
        }
        prevIdsRef.current = next
      } catch {
        /* session may have ended */
      }
    }
    void poll()
    const t = window.setInterval(poll, 5_000) // Polling every 5 seconds as requested
    return () => window.clearInterval(t)
  }, [sessionId])

  const rosterTotal = detail?.student_count ?? roster.length
  const filteredRoster = useMemo(() => {
    const q = manualSearch.trim().toLowerCase()
    if (!q) return roster.slice(0, 8)
    return roster
      .filter(
        (s) =>
          s.name.toLowerCase().includes(q) ||
          s.email.toLowerCase().includes(q) ||
          String(s.student_id).includes(q),
      )
      .slice(0, 12)
  }, [roster, manualSearch])

  const handleManualMark = async (studentId: number) => {
    try {
      await sessionsApi.manualAttendance(sessionId, { student_id: studentId })
      toast.success("Marked present.")
      const list = await sessionsApi.listAttendance(sessionId)
      setRecords(list)
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        toast.info("Already marked for this session.")
      } else {
        toast.error(e instanceof Error ? e.message : "Could not mark attendance.")
      }
    }
  }

  const handleMarkPending = async (studentName: string) => {
    // Optimistic UI: remove from local state immediately
    setPendingCheckins(prev => prev.filter(n => n !== studentName))

    try {
      await sessionsApi.manualAttendance(sessionId, { student_name: studentName })
      toast.success(`${studentName} marked present.`)
      // Refresh list to update check-in feed
      const list = await sessionsApi.listAttendance(sessionId)
      setRecords(list)
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        toast.info(`${studentName} already marked.`)
        // Keep it removed from pending as backend also cleans it up on 409 now
      } else {
        toast.error(e instanceof Error ? e.message : `Could not mark ${studentName}.`)
        // Put it back on error if not a conflict
        setPendingCheckins(prev => [...prev, studentName])
      }
    }
  }

  const handleEnd = async () => {
    try {
      await sessionsApi.end(sessionId)
      toast.success("Session ended.")
      onEnded(sessionId)
    } catch {
      toast.error("Could not end session.")
    }
  }

  const handleRemoveAttendance = async (sessionId: number, studentId: number) => {
    try {
      await sessionsApi.removeAttendance(sessionId, studentId)
      toast.success("Attendance record removed.")
      setRecords(prev => prev.filter(r => r.student_id !== studentId))
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not remove attendance.")
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <Button
            type="button"
            variant="ghost"
            className="min-h-11 gap-2 px-0 text-slate-600 dark:text-slate-400"
            onClick={onBackToCourse}
          >
            <ArrowLeft className="size-4" />
            Back to course
          </Button>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
            {detail?.name ?? "Live session"}
            {sessionMeta ? ` — Session ${sessionMeta.session_number}` : ""}
          </h1>
          <p className="mt-1 flex items-center gap-2 text-sm text-emerald-600 dark:text-emerald-400">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
            </span>
            Live · QR rotates every 30s
          </p>
        </div>
        <div
          className="rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white dark:bg-white dark:text-slate-900"
          aria-live="polite"
          aria-atomic="true"
        >
          {records.length} / {Math.max(rosterTotal, records.length)} checked in
        </div>
      </div>

      <div className="grid gap-8 lg:grid-cols-2">
        <Card className="border-slate-200 dark:border-slate-800">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <QrCode className="size-5" />
              Class QR
            </CardTitle>
            <CardDescription>Project this code for students to scan.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col items-center">
            <div
              className={`relative flex aspect-square w-full max-w-[280px] items-center justify-center rounded-3xl bg-white p-4 shadow-inner ring-2 ring-emerald-500/20 transition dark:bg-slate-950 ${
                refreshingQr ? "scale-95 opacity-60" : ""
              }`}
            >
              {qrImageUrl ? (
                <img src={qrImageUrl} alt="Attendance QR code" className="h-full w-full object-contain" />
              ) : (
                <QrCode className="size-16 animate-pulse text-slate-300" />
              )}
            </div>
            <p
              className="mt-4 text-center text-sm font-medium text-slate-600 dark:text-slate-400"
              aria-live="polite"
              aria-atomic="true"
            >
              Next refresh in {secondsUntilRefresh}s
            </p>
          </CardContent>
        </Card>

        <Card className="border-slate-200 dark:border-slate-800">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <UserPlus className="size-5" />
              Manual attendance
            </CardTitle>
            <CardDescription>
              Mark a student by ID if face recognition fails. Match roster below or enter ID.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {pendingCheckins.length > 0 && (
              <div
                className="mb-2 rounded-2xl border-2 border-[#D97706] bg-[#D97706]/10 p-4"
                role="alert"
              >
                <div className="mb-3 flex items-center gap-2 font-bold text-[#b45309]">
                  <AlertTriangle className="size-5 text-[#D97706]" />
                  Waiting for Manual Check-in
                </div>
                <ul className="space-y-2">
                  {pendingCheckins.map((name, idx) => (
                    <li
                      key={`${name}-${idx}`}
                      className="flex min-h-[44px] items-center justify-between gap-4 border-b border-[#D97706]/10 pb-2 last:border-0"
                    >
                      <span className="font-medium text-slate-900 dark:text-white">{name}</span>
                      <Button
                        type="button"
                        size="sm"
                        className="min-h-11 shrink-0 bg-[#D97706] hover:bg-[#b45309] text-white"
                        onClick={() => void handleMarkPending(name)}
                      >
                        Mark Present
                      </Button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
                <input
                  className="w-full min-h-11 rounded-xl border border-slate-200 bg-white py-2 pl-10 pr-3 text-slate-900 outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                  placeholder="Search name or email…"
                  value={manualSearch}
                  onChange={(e) => setManualSearch(e.target.value)}
                />
              </div>
            </div>
            <ul className="max-h-40 overflow-auto rounded-xl border border-slate-100 dark:border-slate-800">
              {filteredRoster.map((s) => (
                <li key={s.student_id} className="flex items-center justify-between gap-2 border-b border-slate-50 px-3 py-2 last:border-0 dark:border-slate-800">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-900 dark:text-white">
                      {s.name}
                    </p>
                    <p className="truncate text-xs text-slate-500">
                      #{s.student_id} · {s.email}
                    </p>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    className="min-h-11 shrink-0"
                    onClick={() => void handleManualMark(s.student_id)}
                  >
                    Mark
                  </Button>
                </li>
              ))}
            </ul>
            <div className="flex gap-2">
              <input
                className="min-h-11 flex-1 rounded-xl border border-slate-200 bg-white px-3 text-slate-900 outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                inputMode="numeric"
                placeholder="Student ID"
                value={manualId}
                onChange={(e) => setManualId(e.target.value.replace(/\D/g, ""))}
              />
              <Button
                type="button"
                className="min-h-11 min-w-[44px]"
                disabled={!manualId}
                onClick={() => void handleManualMark(Number(manualId))}
              >
                Add
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="border-slate-200 dark:border-slate-800">
        <CardHeader>
          <CardTitle className="text-lg">Live check-ins</CardTitle>
          <CardDescription aria-live="polite">
            Updates every 3 seconds. New arrivals are highlighted briefly.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div
            className="grid gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4"
            aria-live="polite"
            aria-relevant="additions"
          >
            {records.length === 0 ? (
              <p className="col-span-full py-10 text-center text-sm text-slate-500">
                Waiting for the first check-in…
              </p>
            ) : (
              records.map((rec) => (
                <div
                  key={rec.student_id}
                  className={`rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition dark:border-slate-800 dark:bg-slate-900/80 ${
                    highlightIds.has(rec.student_id)
                      ? "animate-in zoom-in-95 fade-in duration-300 ring-2 ring-emerald-400/60"
                      : ""
                  }`}
                >
                  <div className="flex items-start justify-between gap-1">
                    <div className="min-w-0">
                      <p className="font-semibold text-slate-900 dark:text-white truncate">{rec.student_name}</p>
                      <p className="truncate text-xs text-slate-500">{rec.student_email}</p>
                    </div>
                    <RemoveButton onConfirm={() => void handleRemoveAttendance(sessionId, rec.student_id)} />
                  </div>
                  <p className="mt-2 flex items-center gap-1 text-xs font-bold text-emerald-600 dark:text-emerald-400">
                    <Check className="size-3.5 shrink-0" aria-hidden />
                    {formatTime(rec.verified_at)}
                  </p>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>

      <Button
        type="button"
        variant="destructive"
        className="min-h-12 w-full gap-2 rounded-2xl text-base font-semibold sm:max-w-md"
        onClick={() => void handleEnd()}
      >
        <Square className="size-4 fill-current" />
        End session
      </Button>
    </div>
  )
}

function SessionRecapView({
  courseId,
  sessionId,
  onBackToCourse,
}: {
  courseId: number
  sessionId: number
  onBackToCourse: () => void
}) {
  const [recap, setRecap] = useState<SessionRecapResponse | null>(null)
  const [courseName, setCourseName] = useState<string>("")

  useEffect(() => {
    const load = async () => {
      try {
        const [r, c] = await Promise.all([
          sessionsApi.recap(sessionId),
          coursesApi.get(courseId),
        ])
        setRecap(r)
        setCourseName(c.name)
      } catch {
        toast.error("Could not load recap.")
      }
    }
    void load()
  }, [courseId, sessionId])

  const handleRemoveAttendance = async (sessionId: number, studentId: number) => {
    try {
      await sessionsApi.removeAttendance(sessionId, studentId)
      toast.success("Attendance record removed.")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not remove attendance.")
    }
  }

  if (!recap) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-slate-500">
        Loading recap…
      </div>
    )
  }

  const pct = recap.attendance_percentage

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <div>
        <Button
          type="button"
          variant="ghost"
          className="min-h-11 gap-2 px-0 text-slate-600 dark:text-slate-400"
          onClick={onBackToCourse}
        >
          <ArrowLeft className="size-4" />
          Back to course
        </Button>
        <h1 className="mt-2 text-3xl font-bold text-slate-900 dark:text-white">
          Session {recap.session_number} recap
        </h1>
        <p className="text-slate-600 dark:text-slate-400">{courseName}</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="pt-6">
            <p className="text-xs font-semibold uppercase text-slate-500">Attendance</p>
            <p className="mt-1 text-3xl font-bold tabular-nums text-slate-900 dark:text-white">
              {pct}%
            </p>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
              <div
                className="h-full rounded-full bg-emerald-500 transition-all"
                style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
              />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-xs font-semibold uppercase text-slate-500">Present</p>
            <p className="mt-1 text-3xl font-bold text-emerald-600 dark:text-emerald-400">
              {recap.present_count}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-xs font-semibold uppercase text-slate-500">Absent (in roster)</p>
            <p className="mt-1 text-3xl font-bold text-amber-600 dark:text-amber-400">
              {recap.absent_count}
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-wrap gap-2 text-sm text-slate-600 dark:text-slate-400">
        <span className="inline-flex items-center gap-1">
          <Clock className="size-4" />
          Started {formatShortDate(recap.started_at)}
        </span>
        {recap.duration_minutes != null && (
          <span className="inline-flex items-center gap-1">
            · Duration ~{recap.duration_minutes} min
          </span>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          className="min-h-11 gap-2"
          onClick={() => window.open(sessionsApi.exportAttendanceUrl(sessionId), "_blank")}
        >
          <Download className="size-4" />
          Export this session CSV
        </Button>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Present ({recap.present_list.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="max-h-72 space-y-2 overflow-auto text-sm">
              {recap.present_list.map((p) => (
                <li
                  key={p.student_id}
                  className="flex justify-between gap-2 border-b border-slate-100 pb-2 dark:border-slate-800"
                >
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-slate-900 dark:text-white">{p.name}</span>
                    <RemoveButton size="xs" onConfirm={() => void handleRemoveAttendance(sessionId, p.student_id).then(() => {
                      // refresh recap locally
                      setRecap(prev => prev ? {
                        ...prev,
                        present_count: prev.present_count - 1,
                        absent_count: prev.absent_count + 1,
                        present_list: prev.present_list.filter(item => item.student_id !== p.student_id),
                        absent_list: [...prev.absent_list, { ...p, verified_at: null }].sort((a, b) => a.name.localeCompare(b.name))
                      } : null)
                    })} />
                  </div>
                  <span className="shrink-0 text-slate-500">
                    {p.verified_at ? formatTime(p.verified_at) : "—"}
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Absent ({recap.absent_list.length})</CardTitle>
            <CardDescription>Students who attended this course before but not this session.</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="max-h-72 space-y-2 overflow-auto text-sm">
              {recap.absent_list.length === 0 ? (
                <li className="text-slate-500">None</li>
              ) : (
                recap.absent_list.map((p) => (
                  <li
                    key={p.student_id}
                    className="border-b border-slate-100 pb-2 dark:border-slate-800"
                  >
                    <span className="font-medium text-slate-900 dark:text-white">{p.name}</span>
                    <p className="text-xs text-slate-500">{p.email}</p>
                  </li>
                ))
              )}
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function RemoveButton({ onConfirm, size = "sm" }: { onConfirm: () => void, size?: "sm" | "xs" }) {
  const [confirming, setConfirming] = useState(false)

  if (confirming) {
    return (
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            setConfirming(false)
            onConfirm()
          }}
          className="rounded-md bg-emerald-50 p-1 text-emerald-600 transition hover:bg-emerald-100 dark:bg-emerald-950/30 dark:text-emerald-400"
          title="Confirm"
        >
          <Check className={size === "xs" ? "size-3" : "size-3.5"} />
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            setConfirming(false)
          }}
          className="rounded-md bg-red-50 p-1 text-red-600 transition hover:bg-red-100 dark:bg-red-950/30 dark:text-red-400"
          title="Cancel"
        >
          <X className={size === "xs" ? "size-3" : "size-3.5"} />
        </button>
      </div>
    )
  }

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation()
        setConfirming(true)
      }}
      className="rounded-md p-1 text-slate-400 opacity-0 transition hover:bg-slate-100 hover:text-red-500 group-hover:opacity-100 dark:hover:bg-slate-800 focus:opacity-100"
      title="Remove attendance"
    >
      <Trash2 className={size === "xs" ? "size-3" : "size-3.5"} />
    </button>
  )
}
