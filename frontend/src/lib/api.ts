export type ApiMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE"

export type Primitive = string | number | boolean | null
export type JsonValue = Primitive | JsonValue[] | { [key: string]: JsonValue }

export interface ApiProblem {
  detail?: string | { [key: string]: JsonValue } | JsonValue[]
  message?: string
  [key: string]: unknown
}

export class ApiError extends Error {
  readonly status: number
  readonly statusText: string
  readonly data: ApiProblem | null
  readonly path: string

  constructor(params: {
    message: string
    status: number
    statusText: string
    data: ApiProblem | null
    path: string
  }) {
    super(params.message)
    this.name = "ApiError"
    this.status = params.status
    this.statusText = params.statusText
    this.data = params.data
    this.path = params.path
  }
}

export class NetworkError extends Error {
  readonly cause: unknown
  readonly path: string

  constructor(message: string, path: string, cause: unknown) {
    super(message)
    this.name = "NetworkError"
    this.cause = cause
    this.path = path
  }
}

export interface ApiRequestOptions<TBody = unknown>
  extends Omit<RequestInit, "body" | "method"> {
  method?: ApiMethod
  body?: TBody
  query?: Record<string, string | number | boolean | undefined | null>
}

export interface Student {
  id: number
  name: string
  email: string
  has_face: boolean
  created_at: string
}

export interface StudentCreateInput {
  name: string
  email: string
}

export interface FaceEnrollInput {
  images: string[]
}

export interface FaceEnrollResponse {
  student_id: number
  message: string
}

export interface SessionCreateInput {
  course_name: string
  instructor: string
}

export interface SessionResponse {
  id: number
  course_name: string
  instructor: string
  started_at: string
  is_active: boolean
}

export interface AttendanceRecord {
  student_id: number
  student_name: string
  student_email: string
  verified_at: string
}

export interface QrVerifyInput {
  token: string
}

export interface QrVerifyResponse {
  session_id: number
  course_name: string
  instructor: string
  expires_at: string
  is_active: boolean
}

export interface FaceVerifyInput {
  session_id: number
  student_id: number
  image: string
}

export interface FaceVerifyResponse {
  message: string
  session_id: number
  student_id: number
  verified_at: string
  distance?: number
}

export interface AttendanceStatusResponse {
  session_id: number
  student_id: number
  already_marked: boolean
}

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL?.trim() || ""

function buildUrl(
  path: string,
  query?: Record<string, string | number | boolean | undefined | null>,
) {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`
  const url = new URL(`${API_BASE_URL}${normalizedPath}`, window.location.origin)

  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined || value === null) {
        continue
      }

      url.searchParams.set(key, String(value))
    }
  }

  return url.toString()
}

function isJsonContentType(contentType: string | null) {
  return contentType?.includes("application/json") ?? false
}

async function parseErrorPayload(response: Response): Promise<ApiProblem | null> {
  const contentType = response.headers.get("content-type")

  try {
    if (isJsonContentType(contentType)) {
      return (await response.json()) as ApiProblem
    }

    const text = await response.text()
    return text ? { detail: text } : null
  } catch {
    return null
  }
}

function getErrorMessage(
  payload: ApiProblem | null,
  fallbackStatusText: string,
  status: number,
) {
  if (typeof payload?.detail === "string" && payload.detail.trim().length > 0) {
    return payload.detail
  }

  if (typeof payload?.message === "string" && payload.message.trim().length > 0) {
    return payload.message
  }

  if (fallbackStatusText.trim().length > 0) {
    return fallbackStatusText
  }

  return `Request failed with status ${status}`
}

export async function apiRequest<TResponse, TBody = unknown>(
  path: string,
  options: ApiRequestOptions<TBody> = {},
): Promise<TResponse> {
  const { method = "GET", body, headers, query, ...init } = options

  const requestHeaders = new Headers(headers)
  let serializedBody: BodyInit | undefined

  if (body !== undefined) {
    requestHeaders.set("Content-Type", "application/json")
    serializedBody = JSON.stringify(body)
  }

  try {
    const response = await fetch(buildUrl(path, query), {
      ...init,
      method,
      headers: requestHeaders,
      body: serializedBody,
    })

    if (!response.ok) {
      const payload = await parseErrorPayload(response)

      throw new ApiError({
        message: getErrorMessage(payload, response.statusText, response.status),
        status: response.status,
        statusText: response.statusText,
        data: payload,
        path,
      })
    }

    if (response.status === 204) {
      return undefined as TResponse
    }

    const contentType = response.headers.get("content-type")

    if (!isJsonContentType(contentType)) {
      return (await response.text()) as TResponse
    }

    return (await response.json()) as TResponse
  } catch (error) {
    if (error instanceof ApiError) {
      throw error
    }

    throw new NetworkError("Unable to reach the Attendify API.", path, error)
  }
}

export const api = {
  get: <TResponse>(
    path: string,
    options?: Omit<ApiRequestOptions<never>, "method" | "body">,
  ) => apiRequest<TResponse>(path, { ...options, method: "GET" }),
  post: <TResponse, TBody>(
    path: string,
    body?: TBody,
    options?: Omit<ApiRequestOptions<TBody>, "method" | "body">,
  ) => apiRequest<TResponse, TBody>(path, { ...options, method: "POST", body }),
  put: <TResponse, TBody>(
    path: string,
    body?: TBody,
    options?: Omit<ApiRequestOptions<TBody>, "method" | "body">,
  ) => apiRequest<TResponse, TBody>(path, { ...options, method: "PUT", body }),
  patch: <TResponse, TBody>(
    path: string,
    body?: TBody,
    options?: Omit<ApiRequestOptions<TBody>, "method" | "body">,
  ) => apiRequest<TResponse, TBody>(path, { ...options, method: "PATCH", body }),
  delete: <TResponse>(
    path: string,
    options?: Omit<ApiRequestOptions<never>, "method" | "body">,
  ) => apiRequest<TResponse>(path, { ...options, method: "DELETE" }),
}

export const studentsApi = {
  list: () => api.get<Student[]>("/api/students/"),
  get: (studentId: number) => api.get<Student>(`/api/students/${studentId}`),
  register: (payload: StudentCreateInput) =>
    api.post<Student, StudentCreateInput>("/api/students/register", payload),
  enrollFace: (studentId: number, payload: FaceEnrollInput) =>
    api.post<FaceEnrollResponse, FaceEnrollInput>(
      `/api/students/${studentId}/enroll-face`,
      payload,
    ),
  delete: (studentId: number) => api.delete<void>(`/api/students/${studentId}`),
  resetFace: (studentId: number) =>
    api.post<{ message: string }, undefined>(`/api/students/${studentId}/reset-face`),
  bulkDelete: () => api.post<{ message: string }, undefined>("/api/students/bulk-wipe"),
}

export const sessionsApi = {
  list: () => api.get<SessionResponse[]>("/api/sessions/"),
  start: (payload: SessionCreateInput) =>
    api.post<SessionResponse, SessionCreateInput>("/api/sessions/start", payload),
  end: (sessionId: number) =>
    api.post<{ message: string }, undefined>(`/api/sessions/${sessionId}/end`),
  listAttendance: (sessionId: number) =>
    api.get<AttendanceRecord[]>(`/api/sessions/${sessionId}/attendance`),
  qrUrl: (sessionId: number, refresh = false) =>
    `/api/sessions/${sessionId}/qr${refresh ? "/refresh" : ""}?ts=${Date.now()}`,
}

export const attendanceApi = {
  verifyQr: (payload: QrVerifyInput) =>
    api.post<QrVerifyResponse, QrVerifyInput>("/api/attend/verify-qr", payload),
  verifyFace: (payload: FaceVerifyInput) =>
    api.post<FaceVerifyResponse, FaceVerifyInput>("/api/attend/verify-face", payload),
  status: (sessionId: number, studentId: number) =>
    api.get<AttendanceStatusResponse>(`/api/attend/status/${sessionId}`, {
      query: { student_id: studentId },
    }),
}
