import { useState, useEffect } from "react"
import {
  UserPlus2,
  Users,
  Camera,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  ArrowLeft,
  ChevronRight,
  RefreshCcw,
  Trash2,
  UserX,
} from "lucide-react"
import { useRef } from "react"

import { type Student, studentsApi } from "@/lib/api"
import { useNativeCamera } from "../hooks/useNativeCamera"

const MIN_PHOTOS = 3
const MAX_PHOTOS = 5

type AdminStep = "menu" | "register" | "capture" | "success" | "roster"

// Extracting capture view ensures the hook runs on mount of this specific step.
function FaceCaptureView({
  images,
  setImages,
  isBusy,
  onSubmit
}: {
  images: string[]
  setImages: React.Dispatch<React.SetStateAction<string[]>>
  isBusy: boolean
  onSubmit: () => void
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  
  // Ref is physically attached on first render of this component, hook runs correctly.
  const { error: cameraError, isReady, captureFrame } = useNativeCamera(videoRef, { facingMode: "user", muted: true })

  const handleCapture = () => {
    if (images.length >= MAX_PHOTOS) return
    const frame = captureFrame()
    if (!frame) return
    setImages((prev) => [...prev, frame])
  }

  return (
    <div className="w-full max-w-sm flex flex-col items-center">
      
      <div className="text-center mb-6">
         <h2 className="text-2xl font-bold dark:text-white">Face Capture</h2>
         <p className="text-slate-500 text-sm">Need {Math.max(0, MIN_PHOTOS - images.length)} more photos</p>
      </div>

      <div className="relative w-[320px] h-[320px] bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden shadow-xl border-8 border-white dark:border-slate-900">
         <video
           ref={videoRef}
           playsInline
           autoPlay
           muted
           className="absolute inset-0 w-full h-full object-cover"
         />
         {cameraError && (
           <div className="absolute inset-0 bg-black/80 flex items-center justify-center p-6 text-center text-white">
             <p className="text-sm font-bold">{cameraError}</p>
           </div>
         )}
      </div>

      {/* Thumbnail Gallery Row */}
      <div className="flex gap-3 h-[60px] my-6 overflow-hidden">
         {[...Array(MAX_PHOTOS)].map((_, i) => (
           <div key={i} className={`w-[60px] h-[60px] rounded-xl bg-slate-200 dark:bg-slate-800 overflow-hidden border-2 ${i < MIN_PHOTOS ? 'border-amber-500/50' : 'border-transparent'}`}>
              {images[i] && <img src={images[i]} className="w-full h-full object-cover" alt="" />}
           </div>
         ))}
      </div>

      <div className="w-full space-y-3">
         <button
            onClick={handleCapture}
            disabled={!isReady || images.length >= MAX_PHOTOS}
            className="flex min-h-[64px] w-full items-center justify-center gap-2 rounded-2xl bg-slate-900 text-white font-bold text-lg active:scale-95 disabled:opacity-50 dark:bg-slate-800"
         >
           <Camera className="size-5" /> Capture Frame
         </button>

         <button
            onClick={onSubmit}
            disabled={images.length < MIN_PHOTOS || isBusy}
            className="flex min-h-[64px] w-full items-center justify-center gap-2 rounded-2xl bg-amber-500 text-white font-bold text-lg shadow-lg active:scale-95 disabled:opacity-50"
         >
           {isBusy ? "Saving..." : "Complete Enrollment"}
         </button>
      </div>
    </div>
  )
}

export function AdminEnrollmentDashboard() {
  const [step, setStep] = useState<AdminStep>("menu")

  // Registration State
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [studentId, setStudentId] = useState<number | null>(null)
  
  // Camera State
  const [images, setImages] = useState<string[]>([])
  
  // Loading & Errors
  const [isBusy, setIsBusy] = useState(false)
  const [errorMsg, setErrorMsg] = useState("")
  
  // Roster State
  const [students, setStudents] = useState<Student[]>([])
  const [loadingRoster, setLoadingRoster] = useState(false)

  // Custom Modal State
  const [confirmModal, setConfirmModal] = useState<{
    show: boolean
    studentId: number | null
    type: "delete" | "reset" | "bulk-delete"
  }>({ show: false, studentId: null, type: "delete" })

  const loadRoster = async () => {
    setLoadingRoster(true)
    try {
      const data = await studentsApi.list()
      setStudents(data)
    } catch {
      // Handle silently
    } finally {
      setLoadingRoster(false)
    }
  }

  useEffect(() => {
    loadRoster()
  }, [])

  const executeAction = async () => {
    if (confirmModal.type !== "bulk-delete" && !confirmModal.studentId) return
    const id = confirmModal.studentId
    
    setIsBusy(true)
    setErrorMsg("")
    setConfirmModal((prev) => ({ ...prev, show: false }))

    try {
      if (confirmModal.type === "delete") {
        console.log("Admin: Executing delete via API for student", id)
        await studentsApi.delete(id!)
        console.log("Admin: Student deleted successfully")
      } else if (confirmModal.type === "reset") {
        console.log("Admin: Executing reset via API for student", id)
        await studentsApi.resetFace(id!)
        console.log("Admin: Face reset successfully")
      } else if (confirmModal.type === "bulk-delete") {
        console.log("Admin: Executing bulk delete for all students")
        await studentsApi.bulkDelete()
        console.log("Admin: All students deleted successfully")
      }
      loadRoster()
    } catch (err: unknown) {
      console.error(`Admin: ${confirmModal.type} error`, err)
      setErrorMsg(err instanceof Error ? err.message : `Failed to ${confirmModal.type} student.`)
    } finally {
      setIsBusy(false)
    }
  }

  const enrollmentCount = students.filter(s => s.has_face).length
  const totalCount = students.length

  const handleStartEnrollment = () => {
    setName("")
    setEmail("")
    setStudentId(null)
    setImages([])
    setErrorMsg("")
    setStep("register")
  }

  const handleRegister = async () => {
    if (!name.trim() || !email.trim()) {
      setErrorMsg("Please fill in both name and email.")
      return
    }
    setIsBusy(true)
    setErrorMsg("")

    try {
      const res = await fetch("/api/students/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), email: email.trim() }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail ?? "Registration failed.")
      
      setStudentId(data.id)
      setStep("capture")
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "Network error.")
    } finally {
      setIsBusy(false)
    }
  }

  const handleSubmitEnrollment = async () => {
    if (images.length < MIN_PHOTOS || studentId === null) return
    setIsBusy(true)
    setErrorMsg("")

    try {
      const res = await fetch(`/api/students/${studentId}/enroll-face`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ images }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail ?? "Enrollment failed.")

      setStep("success")
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "Network error.")
    } finally {
      setIsBusy(false)
    }
  }

  // --- Views --- //

  if (step === "menu") {
    return (
      <div className="flex h-full flex-col items-center justify-center p-6 bg-slate-50 dark:bg-slate-950 min-h-[85vh]">
        <div className="w-full max-w-sm space-y-6">
          
          <div className="text-center mb-8">
             <div className="mx-auto mb-4 flex size-20 items-center justify-center rounded-full bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400">
                <Users className="size-10" />
              </div>
            <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white">Admin Hub</h1>
            <p className="mt-2 text-slate-500">Manage student enrollment safely.</p>
          </div>

          <button
            onClick={handleStartEnrollment}
            className="flex min-h-[80px] w-full items-center justify-between rounded-[2rem] border-2 border-amber-500/20 bg-white p-6 shadow-xl shadow-amber-500/10 transition-transform active:scale-95 dark:border-amber-400/20 dark:bg-slate-900"
          >
            <div className="flex items-center gap-4">
              <div className="flex size-14 items-center justify-center rounded-full bg-amber-500/20 text-amber-600">
                <UserPlus2 className="size-7" />
              </div>
              <div className="text-left">
                <div className="text-xl font-bold text-slate-900 dark:text-white">Enroll Student</div>
                <div className="text-sm font-medium text-slate-500">Register & Scan Face</div>
              </div>
            </div>
            <ChevronRight className="text-slate-300" />
          </button>

          <button
            onClick={() => {
              void loadRoster()
              setStep("roster")
            }}
            className="flex min-h-[80px] w-full items-center justify-between rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm transition-transform active:scale-95 dark:border-slate-800 dark:bg-slate-900"
          >
            <div className="flex items-center gap-4">
              <div className="flex size-14 items-center justify-center rounded-full bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                <Users className="size-7" />
              </div>
              <div className="text-left">
                <div className="text-xl font-bold text-slate-900 dark:text-white">View Roster</div>
                <div className="text-sm font-medium text-slate-500">
                  {enrollmentCount} / {totalCount} enrolled
                </div>
              </div>
            </div>
            <ChevronRight className="text-slate-300" />
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col min-h-[85vh] bg-slate-50 dark:bg-slate-950 p-6 relative">
      
      {/* Dynamic Error Banner */}
      {errorMsg && (
        <div className="absolute top-4 left-4 right-4 z-50 flex items-center gap-3 rounded-2xl bg-red-500 p-4 text-white shadow-xl animate-in fade-in slide-in-from-top-4">
          <AlertCircle className="size-5 shrink-0" />
          <p className="text-sm font-medium">{errorMsg}</p>
        </div>
      )}

      {/* Toolbar */}
      <div className="flex items-center justify-between mb-8">
        <button 
          onClick={() => setStep("menu")}
          className="flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-bold shadow-sm transition-transform active:scale-95 dark:bg-slate-900 dark:text-white"
        >
          <ArrowLeft className="size-4" /> Back
        </button>
        {step === "roster" && (
           <button 
             onClick={() => void loadRoster()}
             className="flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-bold shadow-sm transition-transform active:scale-95 text-blue-600 dark:bg-slate-900 dark:text-blue-400"
           >
             <RefreshCcw className={`size-4 ${loadingRoster ? 'animate-spin' : ''}`} /> Refresh
           </button>
        )}
      </div>

      <div className="flex-1 flex flex-col items-center justify-center">
        
        {/* State: Roster */}
        {step === "roster" && (
           <div className="w-full max-w-xl flex flex-col h-[60vh] rounded-[2.5rem] bg-white shadow-xl p-6 border border-slate-100 dark:bg-slate-900 dark:border-slate-800">
              <div className="flex items-center justify-between mb-8">
                 <h2 className="text-2xl font-bold dark:text-white">Roster Management</h2>
                 {students.length > 0 && (
                   <button 
                     onClick={() => setConfirmModal({ show: true, studentId: null, type: "bulk-delete" })}
                     className="px-4 py-2 bg-red-50 text-red-600 font-bold rounded-xl hover:bg-red-100 transition-all flex items-center gap-2 active:scale-95"
                   >
                     <Trash2 className="size-4" />
                     <span>Clear All</span>
                   </button>
                 )}
              </div>
             <div className="flex-1 overflow-y-auto">
                <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                  {students.map(s => (
                    <li key={s.id} className="py-4 flex items-center justify-between group">
                       <div className="flex items-center gap-3">
                         <div className={`size-10 rounded-full flex items-center justify-center ${s.has_face ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-100 text-slate-400'}`}>
                           <Users className="size-5" />
                         </div>
                         <div>
                           <div className="font-bold text-slate-900 dark:text-white leading-tight">{s.name}</div>
                           <div className="text-xs text-slate-500">{s.email}</div>
                         </div>
                       </div>
                         <div className="flex items-center gap-3">
                           {s.has_face ? (
                             <button 
                               onClick={(e) => {
                                 e.stopPropagation()
                                 setConfirmModal({ show: true, studentId: s.id, type: "reset" })
                               }}
                               title="Reset Face Data"
                               className="size-10 flex items-center justify-center rounded-xl bg-slate-50 text-slate-400 hover:bg-amber-100 hover:text-amber-600 transition-all active:scale-90"
                             >
                               <UserX className="size-5" />
                             </button>
                           ) : (
                             <div className="px-2 py-1 bg-amber-50 text-amber-600 text-[10px] font-bold rounded-md uppercase tracking-wider">Pending</div>
                           )}
                           <button 
                             onClick={(e) => {
                               e.stopPropagation()
                               setConfirmModal({ show: true, studentId: s.id, type: "delete" })
                             }}
                             title="Delete Student"
                             className="size-10 flex items-center justify-center rounded-xl bg-slate-50 text-slate-400 hover:bg-red-100 hover:text-red-600 transition-all active:scale-90"
                           >
                             <Trash2 className="size-5" />
                           </button>
                         </div>
                    </li>
                  ))}
                  {students.length === 0 && !loadingRoster && (
                     <p className="text-slate-500 text-center py-10">No students found.</p>
                  )}
                </ul>
             </div>
           </div>
        )}

        {/* State: Register */}
        {step === "register" && (
          <div className="w-full max-w-sm space-y-6">
            <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
              Student Details
            </h1>
            <div className="space-y-4">
              <input
                type="text"
                placeholder="Full Name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-2xl border-2 border-slate-200 bg-white p-5 text-xl font-medium text-slate-900 outline-none transition-colors focus:border-amber-500 dark:border-slate-800 dark:bg-slate-900 dark:text-white dark:focus:border-amber-500"
              />
              <input
                type="email"
                placeholder="Email Address"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-2xl border-2 border-slate-200 bg-white p-5 text-xl font-medium text-slate-900 outline-none transition-colors focus:border-amber-500 dark:border-slate-800 dark:bg-slate-900 dark:text-white dark:focus:border-amber-500"
              />
              <button
                onClick={handleRegister}
                disabled={isBusy}
                className="flex min-h-[72px] mt-4 w-full items-center justify-center gap-3 rounded-2xl bg-amber-500 px-6 text-xl font-bold text-white shadow-lg shadow-amber-500/20 transition-transform active:scale-95 disabled:opacity-50"
              >
                <span>{isBusy ? "Registering..." : "Continue"}</span>
                {!isBusy && <ArrowRight className="size-6" />}
              </button>
            </div>
          </div>
        )}

        {/* State: Capture */}
        {step === "capture" && (
          <FaceCaptureView
            images={images}
            setImages={setImages}
            isBusy={isBusy}
            onSubmit={handleSubmitEnrollment}
          />
        )}

        {/* State: Success */}
        {step === "success" && (
          <div className="w-full max-w-sm text-center">
             <CheckCircle2 className="mx-auto size-32 text-emerald-500 animate-in zoom-in" />
             <h2 className="mt-6 text-3xl font-bold dark:text-white">Enrolled!</h2>
             <p className="mt-2 text-slate-500 pb-8">{name} was successfully registered.</p>
             <button
               onClick={handleStartEnrollment}
               className="flex min-h-[72px] w-full items-center justify-center rounded-2xl bg-emerald-600 px-6 text-xl font-bold text-white shadow-xl transition-transform active:scale-95"
             >
               Enroll Another
             </button>
          </div>
        )}

      </div>
      
      {/* Custom Confirmation Modal */}
      {confirmModal.show && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm p-6">
           <div className="w-full max-w-sm rounded-[2.5rem] bg-white p-8 shadow-2xl animate-in zoom-in duration-200 dark:bg-slate-950 dark:border dark:border-slate-800">
               <div className={`mx-auto mb-6 flex size-20 items-center justify-center rounded-full ${
                 confirmModal.type === 'delete' || confirmModal.type === 'bulk-delete' ? 'bg-red-100 text-red-600' : 'bg-amber-100 text-amber-600'
               }`}>
                  {confirmModal.type === 'reset' ? <UserX className="size-10" /> : <Trash2 className="size-10" />}
               </div>
               <h3 className="text-2xl font-bold text-center mb-2 dark:text-white">
                 {confirmModal.type === 'delete' ? 'Delete Student?' : 
                  confirmModal.type === 'reset' ? 'Reset biometric data?' : 
                  'Delete ALL Students?'}
               </h3>
               <p className="text-center text-slate-500 mb-8 px-4">
                 {confirmModal.type === 'delete' 
                   ? 'This will permanently remove the student and all their attendance records. This cannot be undone.' 
                   : confirmModal.type === 'reset' 
                   ? 'This will delete the enrolled face photos. The student will stay registered but must scan their face again.'
                   : 'WARNING: This will permanently wipe the entire roster and all attendance data. The system will be completely reset. This is final.'}
               </p>
               <div className="space-y-3">
                  <button 
                    onClick={executeAction}
                    className={`w-full min-h-[60px] rounded-2xl font-bold text-white shadow-lg active:scale-95 ${
                      confirmModal.type === 'delete' || confirmModal.type === 'bulk-delete' ? 'bg-red-500' : 'bg-amber-500'
                    }`}
                  >
                    Confirm {
                      confirmModal.type === 'delete' ? 'Deletion' : 
                      confirmModal.type === 'reset' ? 'Reset' : 
                      'FULL SYSTEM WIPE'
                    }
                  </button>
                 <button 
                   onClick={() => setConfirmModal((prev) => ({ ...prev, show: false }))}
                   className="w-full min-h-[60px] rounded-2xl font-bold text-slate-500 bg-slate-100 active:scale-95 dark:bg-slate-900 dark:text-slate-400"
                 >
                   Cancel
                 </button>
              </div>
           </div>
        </div>
      )}
    </div>
  )
}
