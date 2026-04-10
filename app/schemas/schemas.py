"""
Pydantic models for request validation and response serialization.

Key design choice: StudentResponse deliberately excludes face_encoding
to prevent leaking biometric data through the API. Face data should
only ever be compared server-side, never returned to clients.
"""

from datetime import datetime

from pydantic import BaseModel, EmailStr, Field


class StudentCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100, examples=["Ahmed Hassan"])
    email: EmailStr = Field(..., examples=["ahmed@university.edu"])


class StudentResponse(BaseModel):
    """Returned from GET /students/ and never exposes face_encoding."""

    id: int
    name: str
    email: str
    has_face: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class FaceEnrollRequest(BaseModel):
    """
    Accepts 3-5 base64-encoded JPEG images for face enrollment.
    Multiple images improve encoding accuracy by averaging out
    pose/lighting variations.
    """

    images: list[str] = Field(
        ...,
        min_length=3,
        max_length=5,
        description="List of base64-encoded JPEG images (3-5 required)",
    )


class FaceEnrollResponse(BaseModel):
    message: str
    student_id: int


class SessionCreate(BaseModel):
    course_name: str = Field(..., min_length=1, max_length=200)
    instructor: str = Field(..., min_length=1, max_length=100)


class SessionResponse(BaseModel):
    id: int
    course_name: str
    instructor: str
    started_at: datetime
    is_active: bool

    model_config = {"from_attributes": True}


class AttendanceRecord(BaseModel):
    student_id: int
    student_name: str
    student_email: str
    verified_at: datetime


class QRVerifyRequest(BaseModel):
    token: str = Field(..., min_length=1, description="Scanned QR token")


class QRVerifyResponse(BaseModel):
    session_id: int
    course_name: str
    instructor: str
    expires_at: datetime
    is_active: bool


class FaceVerifyRequest(BaseModel):
    token: str = Field(..., min_length=1, description="Scanned QR token")
    student_id: int
    image: str = Field(..., min_length=1, description="Base64-encoded JPEG frame")


class FaceVerifyResponse(BaseModel):
    message: str
    session_id: int
    student_id: int
    verified_at: datetime
    distance: float


class AttendanceStatusResponse(BaseModel):
    session_id: int
    student_id: int
    already_marked: bool
    verified_at: datetime | None = None


