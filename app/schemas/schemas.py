"""
Pydantic models for request validation and response serialization.

Key design choice: StudentResponse deliberately excludes face_encoding
to prevent leaking biometric data through the API. Face data should
only ever be compared server-side, never returned to clients.
"""

from datetime import datetime
from typing import Annotated, Literal, Union

from pydantic import BaseModel, EmailStr, Field, model_validator


class StudentCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100, examples=["Ahmed Hassan"])
    email: EmailStr = Field(..., examples=["ahmed@university.edu"])
    session_id: int | None = Field(
        None,
        description="If set, mark attendance for this session after registration (requires images).",
    )
    images: list[str] | None = Field(
        None,
        min_length=3,
        max_length=5,
        description="3–5 face photos; required when session_id is set.",
    )

    @model_validator(mode="after")
    def session_requires_images(self):
        if self.session_id is not None:
            if not self.images or len(self.images) < 3:
                raise ValueError("When session_id is set, provide 3–5 images in the same request.")
        return self


class StudentResponse(BaseModel):
    """Returned from GET /students/ and never exposes face_encoding."""

    id: int
    name: str
    email: str
    has_face: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class StudentRegisterResponse(StudentResponse):
    """Returned from POST /students/register when session context is included."""

    course_name: str | None = None
    session_number: int | None = None


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


class AddFaceRequest(BaseModel):
    """Single image to merge into an existing averaged face encoding."""

    image: str = Field(..., min_length=1, description="Base64-encoded JPEG frame")


class AddFaceResponse(BaseModel):
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


class FaceVerifyRecognized(BaseModel):
    status: Literal["recognized"] = "recognized"
    student_name: str
    course_name: str
    session_number: int
    session_id: int
    student_id: int
    verified_at: datetime
    distance: float


class FaceVerifyUnknown(BaseModel):
    status: Literal["unknown"] = "unknown"
    distance: float | None = None


FaceVerifyResult = Annotated[
    Union[FaceVerifyRecognized, FaceVerifyUnknown],
    Field(discriminator="status"),
]


class AttendanceStatusResponse(BaseModel):
    session_id: int
    student_id: int
    already_marked: bool
    verified_at: datetime | None = None


# --- V2 Courses ---


class CourseCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    code: str = Field(..., min_length=1, max_length=64)
    instructor_name: str = Field(..., min_length=1, max_length=200)


class CourseResponse(BaseModel):
    id: int
    name: str
    code: str
    instructor_name: str
    student_count: int
    session_count: int
    created_at: datetime


class CourseDetailSessionItem(BaseModel):
    id: int
    session_number: int
    started_at: datetime
    is_active: bool
    present_count: int


class CourseDetailResponse(BaseModel):
    id: int
    name: str
    code: str
    instructor_name: str
    created_at: datetime
    student_count: int
    session_count: int
    sessions: list[CourseDetailSessionItem]


class CourseStudentStats(BaseModel):
    student_id: int
    name: str
    email: str
    sessions_attended: int
    total_sessions: int
    attendance_rate: float
    consecutive_misses: int


class RecapPerson(BaseModel):
    student_id: int
    name: str
    email: str
    verified_at: datetime | None = None


class SessionRecap(BaseModel):
    session_id: int
    course_id: int
    session_number: int
    started_at: datetime
    ended_at: datetime | None = None
    duration_minutes: float | None = None
    present_count: int
    absent_count: int
    attendance_percentage: float
    present_list: list[RecapPerson]
    absent_list: list[RecapPerson]


class ManualAttendanceRequest(BaseModel):
    student_id: int | None = Field(None, gt=0)
    student_name: str | None = Field(None, min_length=1)

    @model_validator(mode="after")
    def id_or_name_required(self):
        if self.student_id is None and self.student_name is None:
            raise ValueError("Either student_id or student_name must be provided")
        return self

