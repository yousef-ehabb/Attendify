import { useEffect, useState } from "react"
import { ThemeToggle } from "@/components/theme-toggle"
import { Toaster } from "@/components/ui/sonner"
import { StudentAttendanceFlow } from "@/features/student/StudentAttendanceFlow"
import { AdminEnrollmentDashboard } from "@/views/admin-enrollment-dashboard"
import { InstructorDashboard } from "@/views/instructor-dashboard"

type AppRoute = "/student" | "/instructor" | "/admin"

function getRouteFromPath(path: string): AppRoute | null {
  if (path.startsWith("/admin")) return "/admin"
  if (path.startsWith("/student")) return "/student"
  if (path.startsWith("/instructor")) return "/instructor"
  return null
}

function App() {
  const [activeRoute, setActiveRoute] = useState<AppRoute | null>(() =>
    getRouteFromPath(window.location.pathname),
  )

  useEffect(() => {
    const onPopState = () => {
      setActiveRoute(getRouteFromPath(window.location.pathname))
    }
    window.addEventListener("popstate", onPopState)
    return () => window.removeEventListener("popstate", onPopState)
  }, [])

  if (!activeRoute) {
    window.history.replaceState({}, "", "/student")
    return null
  }

  return (
    <div className="relative min-h-[100dvh] w-full overflow-hidden bg-[radial-gradient(circle_at_top,rgba(37,99,235,0.2),transparent_30%),linear-gradient(180deg,#f8fbff_0%,#eef4ff_42%,#f8fafc_100%)] text-foreground dark:bg-[radial-gradient(circle_at_top,rgba(37,99,235,0.24),transparent_28%),linear-gradient(180deg,#09111f_0%,#0b1323_44%,#050914_100%)]">
      {/* Background Grid Pattern */}
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,rgba(148,163,184,0.08)_1px,transparent_1px),linear-gradient(to_bottom,rgba(148,163,184,0.08)_1px,transparent_1px)] bg-[size:36px_36px] [mask-image:linear-gradient(to_bottom,white,transparent_85%)] dark:bg-[linear-gradient(to_right,rgba(148,163,184,0.06)_1px,transparent_1px),linear-gradient(to_bottom,rgba(148,163,184,0.06)_1px,transparent_1px)]" />

      {/* Persistent Floating Controls */}
      <div className="absolute right-4 top-4 z-50 flex items-center gap-2">
        <ThemeToggle />
      </div>

      {/* Main View Area */}
      <main className="relative flex min-h-[100dvh] w-full flex-col">
        {activeRoute === "/instructor" ? (
          <div className="mx-auto w-full max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
            <InstructorDashboard />
          </div>
        ) : null}
        {activeRoute === "/admin" ? (
          <div className="mx-auto w-full max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
            <AdminEnrollmentDashboard />
          </div>
        ) : null}
        {activeRoute === "/student" ? (
          // Notice student flow doesn't have the padding shell. It gets 100% of the screen.
          <StudentAttendanceFlow />
        ) : null}
      </main>

      <Toaster richColors position="top-right" />
    </div>
  )
}

export default App
