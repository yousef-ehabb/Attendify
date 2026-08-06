export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "14.15"
  }
  public: {
    Tables: {
      attendance: {
        Row: {
          id: number
          session_id: number
          student_id: number
          verified_at: string
        }
        Insert: {
          id?: never
          session_id: number
          student_id: number
          verified_at?: string
        }
        Update: {
          id?: never
          session_id?: number
          student_id?: number
          verified_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendance_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      courses: {
        Row: {
          code: string
          created_at: string
          id: number
          instructor_name: string
          name: string
        }
        Insert: {
          code: string
          created_at?: string
          id?: never
          instructor_name: string
          name: string
        }
        Update: {
          code?: string
          created_at?: string
          id?: never
          instructor_name?: string
          name?: string
        }
        Relationships: []
      }
      qr_tokens: {
        Row: {
          created_at: string
          expires_at: string
          id: number
          session_id: number
          token: string
        }
        Insert: {
          created_at?: string
          expires_at: string
          id?: never
          session_id: number
          token: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          id?: never
          session_id?: number
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "qr_tokens_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      sessions: {
        Row: {
          course_id: number
          ended_at: string | null
          id: number
          is_active: boolean
          started_at: string
        }
        Insert: {
          course_id: number
          ended_at?: string | null
          id?: never
          is_active?: boolean
          started_at?: string
        }
        Update: {
          course_id?: number
          ended_at?: string | null
          id?: never
          is_active?: boolean
          started_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sessions_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      students: {
        Row: {
          created_at: string
          email: string
          face_encoding: string | null
          id: number
          name: string
        }
        Insert: {
          created_at?: string
          email: string
          face_encoding?: string | null
          id?: never
          name: string
        }
        Update: {
          created_at?: string
          email?: string
          face_encoding?: string | null
          id?: never
          name?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}
