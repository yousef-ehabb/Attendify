import { ScanFace, Settings, QrCode } from "lucide-react"

export function Landing({ onNavigate }: { onNavigate: (path: string) => void }) {
  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center p-6 text-center">
      <div className="mb-12 space-y-4">
        <h1 className="text-4xl font-bold tracking-tight text-slate-950 sm:text-5xl dark:text-white">
          Attendify
        </h1>
        <p className="text-lg text-slate-600 dark:text-slate-400">
          Select your role to continue
        </p>
      </div>

      <div className="flex w-full max-w-sm flex-col gap-4">
        <button
          onClick={() => onNavigate("/student")}
          className="flex min-h-[80px] w-full items-center justify-between rounded-[2rem] border-2 border-blue-500/20 bg-blue-500/10 px-6 py-4 text-left transition-transform active:scale-95 dark:border-blue-400/20 dark:bg-blue-400/10"
        >
          <div className="flex items-center gap-4">
            <div className="flex size-12 items-center justify-center rounded-full bg-blue-500/20 text-blue-700 dark:text-blue-300">
              <ScanFace className="size-6" />
            </div>
            <div>
              <div className="text-lg font-semibold text-slate-900 dark:text-white">
                Student
              </div>
              <div className="text-sm text-slate-600 dark:text-slate-400">
                Mark my attendance
              </div>
            </div>
          </div>
        </button>

        <button
          onClick={() => onNavigate("/instructor")}
          className="flex min-h-[80px] w-full items-center justify-between rounded-[2rem] border-2 border-emerald-500/20 bg-emerald-500/10 px-6 py-4 text-left transition-transform active:scale-95 dark:border-emerald-400/20 dark:bg-emerald-400/10"
        >
          <div className="flex items-center gap-4">
            <div className="flex size-12 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-700 dark:text-emerald-300">
              <QrCode className="size-6" />
            </div>
            <div>
              <div className="text-lg font-semibold text-slate-900 dark:text-white">
                Instructor
              </div>
              <div className="text-sm text-slate-600 dark:text-slate-400">
                Start a live session
              </div>
            </div>
          </div>
        </button>

        <button
          onClick={() => onNavigate("/admin")}
          className="flex min-h-[80px] w-full items-center justify-between rounded-[2rem] border-2 border-amber-500/20 bg-amber-500/10 px-6 py-4 text-left transition-transform active:scale-95 dark:border-amber-400/20 dark:bg-amber-400/10"
        >
          <div className="flex items-center gap-4">
            <div className="flex size-12 items-center justify-center rounded-full bg-amber-500/20 text-amber-700 dark:text-amber-300">
              <Settings className="size-6" />
            </div>
            <div>
              <div className="text-lg font-semibold text-slate-900 dark:text-white">
                Admin
              </div>
              <div className="text-sm text-slate-600 dark:text-slate-400">
                Enroll new students
              </div>
            </div>
          </div>
        </button>
      </div>
    </div>
  )
}
