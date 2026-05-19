import { useState } from "react"
import { AlertCircle } from "lucide-react"

export function CameraErrorView({
  errorName,
  sessionId,
  onRetry,
}: {
  errorName: string
  sessionId?: number
  onRetry: () => void
}) {
  const [showInput, setShowInput] = useState(false)
  const [name, setName] = useState("")
  const [status, setStatus] = useState<"idle"|"loading"|"success"|"error">("idle")

  const title = "Camera Unavailable"
  const message =
    errorName === "NotAllowedError" ? "Please allow camera access in your browser settings" :
    errorName === "NotFoundError" ? "No camera was found on your device" :
    "Camera failed to start"

  const handleRequest = async () => {
    if (!name.trim() || !sessionId) return
    setStatus("loading")
    try {
      const res = await fetch(`/api/sessions/${sessionId}/request-checkin`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ student_name: name.trim() })
      })
      if (!res.ok) throw new Error("Request failed")
      setStatus("success")
    } catch {
      setStatus("error")
    }
  }

  return (
    <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-slate-950 p-6 text-center text-white">
      <AlertCircle className="mb-4 size-16 text-amber-500" />
      <h2 className="text-2xl font-bold tracking-tight">{title}</h2>
      <p className="mt-4 text-slate-400">{message}</p>
      
      {status === "success" ? (
        <div className="mt-8 rounded-xl bg-green-500/20 p-6 border border-green-500/30">
          <p className="text-lg font-medium text-green-400">✅ Your instructor has been notified. Please approach them.</p>
        </div>
      ) : showInput ? (
        <div className="mt-8 w-full max-w-sm space-y-4">
          <p className="text-sm text-slate-400">Enter your name so the instructor can find you</p>
          <input 
            type="text" 
            autoFocus
            value={name} 
            onChange={e => setName(e.target.value)} 
            placeholder="Your Name" 
            className="w-full rounded-2xl bg-slate-900 border-2 border-slate-700 p-5 text-xl font-medium text-white outline-none focus:border-blue-500"
          />
          <div className="flex gap-3">
             <button onClick={() => setShowInput(false)} className="flex-1 rounded-2xl bg-slate-800 py-4 font-bold active:scale-95 transition-transform">Cancel</button>
             <button onClick={handleRequest} disabled={!name.trim() || status === "loading"} className="flex-1 rounded-2xl bg-blue-600 py-4 font-bold disabled:opacity-50 active:scale-95 transition-transform">Submit</button>
          </div>
          {status === "error" && <p className="mt-2 text-red-500 text-sm font-bold">Failed to send request. Please try again.</p>}
        </div>
      ) : (
        <div className="mt-8 gap-4 flex w-full max-w-sm flex-col">
          <button onClick={onRetry} className="rounded-2xl bg-blue-600 py-4 px-6 text-lg font-bold shadow-lg shadow-blue-500/20 active:scale-95 transition-transform">Try Again</button>
          <button 
             onClick={() => {
                if (sessionId) setShowInput(true)
                else alert("Session not found yet. Please manually approach the instructor to mark you present.")
             }} 
             className="rounded-2xl border-2 border-slate-700 bg-transparent py-4 px-6 text-lg font-bold active:scale-95 transition-transform"
          >
             Request Manual Check-in
          </button>
        </div>
      )}
    </div>
  )
}
