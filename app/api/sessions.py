import csv
import io

from fastapi import APIRouter, Depends, HTTPException, Response
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.database import get_db
from app.models.models import Attendance, QRToken, Session as SessionModel
from app.schemas.schemas import (
    AttendanceRecord,
    SessionCreate,
    SessionResponse,
)
from app.services.qr_utils import generate_qr_image, generate_token

router = APIRouter(prefix="/sessions", tags=["sessions"])


@router.get("/", response_model=list[SessionResponse])
def list_sessions(db: Session = Depends(get_db)):
    """List all sessions, ordered by most recent first."""
    sessions = db.query(SessionModel).order_by(SessionModel.started_at.desc()).all()
    return sessions


@router.post("/start", response_model=SessionResponse)
def start_session(data: SessionCreate, db: Session = Depends(get_db)):
    """Create a new attendance session and generate its first QR token."""
    session = SessionModel(
        course_name=data.course_name,
        instructor=data.instructor,
        is_active=True,
    )
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

    return session


@router.post("/{session_id}/end")
def end_session(session_id: int, db: Session = Depends(get_db)):
    """End an attendance session and invalidate all pending QR tokens."""
    session = db.query(SessionModel).filter(SessionModel.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    session.is_active = False
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


@router.get("/{session_id}/attendance/export")
def export_attendance_csv(session_id: int, db: Session = Depends(get_db)):
    """Return attendance records for a session as a CSV file download."""
    session = db.query(SessionModel).filter(SessionModel.id == session_id).first()
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

    filename = f"attendance_session_{session_id}_{session.course_name.replace(' ', '_')}.csv"
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={
            "Content-Disposition": f"attachment; filename*=UTF-8''{filename}",
        },
    )
