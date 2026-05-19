import csv
import io
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Response, status
from fastapi.responses import StreamingResponse
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, joinedload

from app.core.config import settings
from app.db.database import get_db
from app.models.models import Attendance, Course, QRToken, Session as SessionModel, Student
from app.schemas.schemas import (
    AttendanceRecord,
    ManualAttendanceRequest,
    SessionCreate,
    SessionRecap,
    SessionResponse,
    RecapPerson,
)
from app.services.qr_utils import generate_qr_image, generate_token
from app.services.session_utils import session_numbers_for_course

from pydantic import BaseModel

router = APIRouter(prefix="/sessions", tags=["sessions"])

pending_checkins: dict[int, list[str]] = {}

class CheckinRequest(BaseModel):
    student_name: str

def _session_to_response(s: SessionModel) -> SessionResponse:
    return SessionResponse(
        id=s.id,
        course_name=s.course.name,
        instructor=s.course.instructor_name,
        started_at=s.started_at,
        is_active=s.is_active,
    )


@router.get("/", response_model=list[SessionResponse])
def list_sessions(db: Session = Depends(get_db)):
    """List all sessions, ordered by most recent first."""
    sessions = (
        db.query(SessionModel)
        .options(joinedload(SessionModel.course))
        .order_by(SessionModel.started_at.desc())
        .all()
    )
    return [_session_to_response(s) for s in sessions]


@router.post("/start", response_model=SessionResponse)
def start_session(data: SessionCreate, db: Session = Depends(get_db)):
    """
    Create a new attendance session (V1 compatibility).
    Creates a dedicated Course row then a Session scoped to it.
    """
    code = f"V1-{uuid.uuid4().hex[:12].upper()}"
    course = Course(
        name=data.course_name.strip(),
        code=code,
        instructor_name=data.instructor.strip(),
    )
    db.add(course)
    db.commit()
    db.refresh(course)

    session = SessionModel(course_id=course.id, is_active=True)
    db.add(session)
    db.commit()
    db.refresh(session)

    token, expires_at_ts = generate_token(
        session.id, settings.SECRET_KEY, settings.QR_TTL_SECONDS
    )
    qr_token = QRToken(
        session_id=session.id,
        token=token,
        expires_at=expires_at_ts,
    )
    db.add(qr_token)
    db.commit()

    loaded = (
        db.query(SessionModel)
        .options(joinedload(SessionModel.course))
        .filter(SessionModel.id == session.id)
        .first()
    )
    assert loaded is not None
    return _session_to_response(loaded)


@router.post("/{session_id}/end")
def end_session(session_id: int, db: Session = Depends(get_db)):
    """End an attendance session and invalidate all pending QR tokens."""
    session = db.query(SessionModel).filter(SessionModel.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    session.is_active = False
    session.ended_at = datetime.now(timezone.utc)
    db.query(QRToken).filter(QRToken.session_id == session_id).delete()
    db.commit()
    return {"message": "Session ended"}


@router.get("/{session_id}/qr")
def get_qr_code(session_id: int, db: Session = Depends(get_db)):
    """Return the current QR code image for a session as PNG."""
    session = db.query(SessionModel).filter(SessionModel.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    if not session.is_active:
        raise HTTPException(status_code=400, detail="Session is not active")

    qr_token = (
        db.query(QRToken)
        .filter(QRToken.session_id == session_id)
        .order_by(QRToken.created_at.desc())
        .first()
    )
    if not qr_token:
        raise HTTPException(status_code=404, detail="No QR token found for this session")

    png_bytes = generate_qr_image(qr_token.token)
    return Response(content=png_bytes, media_type="image/png")


@router.get("/{session_id}/qr/refresh")
def refresh_qr(session_id: int, db: Session = Depends(get_db)):
    """Generate a new HMAC token and return the updated QR code image."""
    session = db.query(SessionModel).filter(SessionModel.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    if not session.is_active:
        raise HTTPException(status_code=400, detail="Session is not active")

    token, expires_at_ts = generate_token(
        session.id, settings.SECRET_KEY, settings.QR_TTL_SECONDS
    )
    qr_token = QRToken(
        session_id=session.id,
        token=token,
        expires_at=expires_at_ts,
    )
    db.add(qr_token)
    db.commit()
    db.refresh(qr_token)

    png_bytes = generate_qr_image(token)
    return Response(content=png_bytes, media_type="image/png")


@router.get("/{session_id}/attendance", response_model=list[AttendanceRecord])
def get_attendance(session_id: int, db: Session = Depends(get_db)):
    """List all verified students for a given session."""
    session = db.query(SessionModel).filter(SessionModel.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    records = (
        db.query(Attendance)
        .filter(Attendance.session_id == session_id)
        .all()
    )
    return [
        AttendanceRecord(
            student_id=r.student_id,
            student_name=r.student.name,
            student_email=r.student.email,
            verified_at=r.verified_at,
        )
        for r in records
    ]


@router.delete("/{session_id}/attendance/{student_id}")
def remove_attendance(session_id: int, student_id: int, db: Session = Depends(get_db)):
    record = (
        db.query(Attendance)
        .filter(Attendance.session_id == session_id, Attendance.student_id == student_id)
        .first()
    )
    if not record:
        raise HTTPException(status_code=404, detail="Attendance record not found")

    db.delete(record)
    db.commit()
    return {"message": "Attendance record removed"}


@router.get("/{session_id}/recap", response_model=SessionRecap)
def get_session_recap(session_id: int, db: Session = Depends(get_db)):
    session = (
        db.query(SessionModel)
        .options(joinedload(SessionModel.course))
        .filter(SessionModel.id == session_id)
        .first()
    )
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    course_id = session.course_id
    num_map = session_numbers_for_course(db, course_id)
    session_number = num_map.get(session_id, 1)

    present_rows = (
        db.query(Attendance)
        .filter(Attendance.session_id == session_id)
        .all()
    )
    present_ids = {r.student_id for r in present_rows}

    course_student_ids = (
        db.query(Attendance.student_id)
        .distinct()
        .join(SessionModel, Attendance.session_id == SessionModel.id)
        .filter(SessionModel.course_id == course_id)
        .all()
    )
    course_ids_set = {row[0] for row in course_student_ids}

    absent_ids = course_ids_set - present_ids

    present_list: list[RecapPerson] = []
    for r in present_rows:
        present_list.append(
            RecapPerson(
                student_id=r.student_id,
                name=r.student.name,
                email=r.student.email,
                verified_at=r.verified_at,
            )
        )
    present_list.sort(key=lambda p: p.name.lower())

    absent_list: list[RecapPerson] = []
    if absent_ids:
        absent_students = db.query(Student).filter(Student.id.in_(absent_ids)).all()
        for st in sorted(absent_students, key=lambda x: x.name.lower()):
            absent_list.append(
                RecapPerson(
                    student_id=st.id,
                    name=st.name,
                    email=st.email,
                    verified_at=None,
                )
            )

    present_count = len(present_list)
    absent_count = len(absent_list)
    denom = present_count + absent_count
    pct = (present_count / denom * 100.0) if denom > 0 else 0.0

    def _as_utc(dt: datetime | None) -> datetime | None:
        if dt is None:
            return None
        if dt.tzinfo is None:
            return dt.replace(tzinfo=timezone.utc)
        return dt.astimezone(timezone.utc)

    start_utc = _as_utc(session.started_at)
    end_utc = _as_utc(session.ended_at) or datetime.now(timezone.utc)
    duration_minutes: float | None = None
    if start_utc:
        duration_minutes = round((end_utc - start_utc).total_seconds() / 60.0, 1)

    return SessionRecap(
        session_id=session.id,
        course_id=course_id,
        session_number=session_number,
        started_at=session.started_at,
        ended_at=session.ended_at,
        duration_minutes=duration_minutes,
        present_count=present_count,
        absent_count=absent_count,
        attendance_percentage=round(pct, 2),
        present_list=present_list,
        absent_list=absent_list,
    )


@router.post("/{session_id}/manual-attendance")
def manual_attendance(
    session_id: int,
    body: ManualAttendanceRequest,
    db: Session = Depends(get_db),
):
    session = db.query(SessionModel).filter(SessionModel.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    if not session.is_active:
        raise HTTPException(status_code=400, detail="Session is not active")

    student_id = body.student_id
    if student_id is None and body.student_name:
        # Resolve student by name
        students = db.query(Student).filter(Student.name == body.student_name).all()
        if not students:
            raise HTTPException(status_code=404, detail=f"No student found with name: {body.student_name}")
        if len(students) > 1:
            raise HTTPException(status_code=400, detail=f"Multiple students found with name: {body.student_name}. Please use Student ID.")
        student_id = students[0].id

    student = db.query(Student).filter(Student.id == student_id).first()
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")

    attendance = Attendance(session_id=session_id, student_id=student.id)
    db.add(attendance)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        # Clean up pending checkins even on 409
        if session_id in pending_checkins and student.name in pending_checkins[session_id]:
            pending_checkins[session_id].remove(student.name)
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Already marked",
        )
    db.refresh(attendance)

    if session_id in pending_checkins and student.name in pending_checkins[session_id]:
        pending_checkins[session_id].remove(student.name)

    return {
        "message": "Attendance marked",
        "session_id": attendance.session_id,
        "student_id": attendance.student_id,
        "verified_at": attendance.verified_at,
    }


@router.get("/{session_id}/attendance/export")
def export_attendance_csv(session_id: int, db: Session = Depends(get_db)):
    """Return attendance records for a session as a CSV file download."""
    session = (
        db.query(SessionModel)
        .options(joinedload(SessionModel.course))
        .filter(SessionModel.id == session_id)
        .first()
    )
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    records = (
        db.query(Attendance)
        .filter(Attendance.session_id == session_id)
        .all()
    )

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["Student Name", "Email", "Verified At"])
    for r in records:
        writer.writerow([
            r.student.name,
            r.student.email,
            r.verified_at.strftime("%Y-%m-%d %H:%M:%S"),
        ])
    output.seek(0)

    safe = session.course.name.replace(" ", "_")
    filename = f"attendance_session_{session_id}_{safe}.csv"
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={
            "Content-Disposition": f"attachment; filename*=UTF-8''{filename}",
        },
    )

@router.post("/{session_id}/request-checkin")
def request_checkin(session_id: int, body: CheckinRequest, db: Session = Depends(get_db)):
    """Student requests manual check-in when camera fails."""
    session = db.query(SessionModel).filter(SessionModel.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    if not session.is_active:
        raise HTTPException(status_code=400, detail="Session is not active")
        
    if session_id not in pending_checkins:
        pending_checkins[session_id] = []
    
    if body.student_name not in pending_checkins[session_id]:
        pending_checkins[session_id].append(body.student_name)
    
    return {"status": "requested", "student_name": body.student_name}

@router.get("/{session_id}/pending-checkins")
def get_pending_checkins(session_id: int):
    """Instructor polls this to see who couldn't use the camera."""
    return pending_checkins.get(session_id, [])
