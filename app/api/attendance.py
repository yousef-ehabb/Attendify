from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session as DBSession, joinedload

from app.core.config import settings
from app.db.database import get_db
from app.models.models import Attendance, QRToken, Session, Student
from app.schemas.schemas import (
    AttendanceStatusResponse,
    FaceVerifyRequest,
    FaceVerifyRecognized,
    FaceVerifyUnknown,
    QRVerifyRequest,
    QRVerifyResponse,
)
from app.services.face_utils import compare_face
from app.services.session_utils import session_numbers_for_course

router = APIRouter(prefix="/attend", tags=["Attendance"])


@router.post(
    "/verify-qr",
    response_model=QRVerifyResponse,
    summary="Validate a scanned QR token",
)
def verify_qr(payload: QRVerifyRequest, db: DBSession = Depends(get_db)):
    qr_token = db.query(QRToken).filter(QRToken.token == payload.token).first()
    if not qr_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid QR token",
        )

    session_record = (
        db.query(Session)
        .options(joinedload(Session.course))
        .filter(Session.id == qr_token.session_id)
        .first()
    )
    if not session_record or not session_record.is_active:
        raise HTTPException(
            status_code=status.HTTP_410_GONE,
            detail="This attendance session has been closed by the instructor.",
        )

    if qr_token.expires_at.replace(tzinfo=timezone.utc) < datetime.now(timezone.utc):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="QR token has expired",
        )

    return QRVerifyResponse(
        session_id=session_record.id,
        course_name=session_record.course.name,
        instructor=session_record.course.instructor_name,
        expires_at=qr_token.expires_at,
        is_active=session_record.is_active,
    )


@router.post(
    "/verify-face",
    response_model=FaceVerifyRecognized | FaceVerifyUnknown,
    summary="Verify a student's face and mark attendance",
)
def verify_face(payload: FaceVerifyRequest, db: DBSession = Depends(get_db)):
    qr_token = db.query(QRToken).filter(QRToken.token == payload.token).first()
    if not qr_token:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="QR token not found",
        )
    if qr_token.expires_at.replace(tzinfo=timezone.utc) < datetime.now(timezone.utc):
        raise HTTPException(
            status_code=status.HTTP_410_GONE,
            detail="QR token has expired",
        )

    session_id = qr_token.session_id
    session_record = (
        db.query(Session)
        .options(joinedload(Session.course))
        .filter(Session.id == session_id)
        .first()
    )
    if not session_record:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Session with id {session_id} not found",
        )
    if not session_record.is_active:
        raise HTTPException(
            status_code=status.HTTP_410_GONE,
            detail="This attendance session has been closed by the instructor.",
        )

    student = db.query(Student).filter(Student.id == payload.student_id).first()
    if not student:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Student with id {payload.student_id} not found",
        )
    if not student.face_encoding:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Student has not enrolled a face yet",
        )

    try:
        is_match, distance = compare_face(
            student.face_encoding,
            payload.image,
            tolerance=settings.FACE_TOLERANCE,
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc),
        )

    if not is_match:
        return FaceVerifyUnknown(status="unknown", distance=distance)

    attendance = Attendance(
        session_id=session_id,
        student_id=payload.student_id,
    )
    db.add(attendance)

    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Already marked",
        )

    db.refresh(attendance)

    num_map = session_numbers_for_course(db, session_record.course_id)
    session_number = num_map.get(session_id, 1)

    return FaceVerifyRecognized(
        status="recognized",
        student_name=student.name,
        course_name=session_record.course.name,
        session_number=session_number,
        session_id=attendance.session_id,
        student_id=attendance.student_id,
        verified_at=attendance.verified_at,
        distance=distance,
    )


@router.get(
    "/status/{session_id}",
    response_model=AttendanceStatusResponse,
    summary="Check whether a student has already been marked present",
)
def attendance_status(
    session_id: int,
    student_id: int = Query(..., gt=0),
    db: DBSession = Depends(get_db),
):
    record = (
        db.query(Attendance)
        .filter(
            Attendance.session_id == session_id,
            Attendance.student_id == student_id,
        )
        .first()
    )

    return AttendanceStatusResponse(
        session_id=session_id,
        student_id=student_id,
        already_marked=record is not None,
        verified_at=record.verified_at if record else None,
    )
