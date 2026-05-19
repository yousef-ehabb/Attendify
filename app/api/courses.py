import csv
import io

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from app.core.config import settings
from app.db.database import get_db
from app.models.models import Attendance, Course, QRToken, Session as SessionModel, Student
from app.schemas.schemas import (
    CourseCreate,
    CourseDetailResponse,
    CourseDetailSessionItem,
    CourseResponse,
    CourseStudentStats,
    SessionResponse,
)
from app.services.qr_utils import generate_token
from app.services.session_utils import session_numbers_for_course

router = APIRouter(prefix="/courses", tags=["courses"])


def _distinct_student_count(db: Session, course_id: int) -> int:
    q = (
        db.query(func.count(func.distinct(Attendance.student_id)))
        .join(SessionModel, Attendance.session_id == SessionModel.id)
        .filter(SessionModel.course_id == course_id)
    )
    return int(q.scalar() or 0)


@router.post("", response_model=CourseResponse, status_code=status.HTTP_201_CREATED)
def create_course(data: CourseCreate, db: Session = Depends(get_db)):
    existing = db.query(Course).filter(Course.code == data.code.strip()).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"A course with code '{data.code}' already exists",
        )
    course = Course(
        name=data.name.strip(),
        code=data.code.strip(),
        instructor_name=data.instructor_name.strip(),
    )
    db.add(course)
    db.commit()
    db.refresh(course)
    return CourseResponse(
        id=course.id,
        name=course.name,
        code=course.code,
        instructor_name=course.instructor_name,
        student_count=0,
        session_count=0,
        created_at=course.created_at,
    )


@router.get("", response_model=list[CourseResponse])
def list_courses(db: Session = Depends(get_db)):
    courses = db.query(Course).order_by(Course.created_at.desc()).all()
    out: list[CourseResponse] = []
    for c in courses:
        session_count = (
            db.query(func.count(SessionModel.id))
            .filter(SessionModel.course_id == c.id)
            .scalar()
            or 0
        )
        out.append(
            CourseResponse(
                id=c.id,
                name=c.name,
                code=c.code,
                instructor_name=c.instructor_name,
                student_count=_distinct_student_count(db, c.id),
                session_count=int(session_count),
                created_at=c.created_at,
            )
        )
    return out


@router.get("/{course_id}", response_model=CourseDetailResponse)
def get_course(course_id: int, db: Session = Depends(get_db)):
    course = db.query(Course).filter(Course.id == course_id).first()
    if not course:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Course not found")

    sessions = (
        db.query(SessionModel)
        .filter(SessionModel.course_id == course_id)
        .order_by(SessionModel.started_at.desc(), SessionModel.id.desc())
        .all()
    )
    num_map = session_numbers_for_course(db, course_id)
    session_items: list[CourseDetailSessionItem] = []
    for s in sessions:
        present_count = (
            db.query(func.count(Attendance.id))
            .filter(Attendance.session_id == s.id)
            .scalar()
            or 0
        )
        session_items.append(
            CourseDetailSessionItem(
                id=s.id,
                session_number=num_map.get(s.id, 0),
                started_at=s.started_at,
                is_active=s.is_active,
                present_count=int(present_count),
            )
        )

    session_count = len(sessions)
    return CourseDetailResponse(
        id=course.id,
        name=course.name,
        code=course.code,
        instructor_name=course.instructor_name,
        created_at=course.created_at,
        student_count=_distinct_student_count(db, course_id),
        session_count=session_count,
        sessions=session_items,
    )


@router.get("/{course_id}/students", response_model=list[CourseStudentStats])
def get_course_students(course_id: int, db: Session = Depends(get_db)):
    course = db.query(Course).filter(Course.id == course_id).first()
    if not course:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Course not found")

    total_sessions = (
        db.query(func.count(SessionModel.id))
        .filter(SessionModel.course_id == course_id)
        .scalar()
        or 0
    )
    total_sessions = int(total_sessions)

    subq = (
        db.query(Attendance.student_id, func.count(func.distinct(Attendance.session_id)).label("cnt"))
        .join(SessionModel, Attendance.session_id == SessionModel.id)
        .filter(SessionModel.course_id == course_id)
        .group_by(Attendance.student_id)
        .all()
    )
    if not subq:
        return []

    # Calculate consecutive misses based on latest sessions
    latest_sessions = (
        db.query(SessionModel.id)
        .filter(SessionModel.course_id == course_id)
        .order_by(SessionModel.started_at.desc())
        .limit(10)
        .all()
    )
    latest_ids = [s.id for s in latest_sessions]
    
    recent_att = (
        db.query(Attendance.student_id, Attendance.session_id)
        .filter(Attendance.session_id.in_(latest_ids))
        .all()
    )
    # Map student_id to set of recent session IDs naturally attended
    att_set_map = {}
    for row in recent_att:
        if row.student_id not in att_set_map:
            att_set_map[row.student_id] = set()
        att_set_map[row.student_id].add(row.session_id)

    counts = {row.student_id: int(row.cnt) for row in subq}
    students = db.query(Student).filter(Student.id.in_(counts.keys())).all()
    out: list[CourseStudentStats] = []
    for st in students:
        attended = counts.get(st.id, 0)
        rate = (attended / total_sessions * 100.0) if total_sessions > 0 else 0.0
        
        # Streak calculation
        consecutive_misses = 0
        st_att = att_set_map.get(st.id, set())
        for sid in latest_ids:
            if sid in st_att:
                break
            consecutive_misses += 1

        out.append(
            CourseStudentStats(
                student_id=st.id,
                name=st.name,
                email=st.email,
                sessions_attended=attended,
                total_sessions=total_sessions,
                attendance_rate=round(rate, 2),
                consecutive_misses=consecutive_misses,
            )
        )
    out.sort(key=lambda x: x.name.lower())
    return out


@router.get("/{course_id}/export")
def export_course_csv(course_id: int, db: Session = Depends(get_db)):
    course = db.query(Course).filter(Course.id == course_id).first()
    if not course:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Course not found")

    sessions_ordered = (
        db.query(SessionModel)
        .filter(SessionModel.course_id == course_id)
        .order_by(SessionModel.started_at.asc(), SessionModel.id.asc())
        .all()
    )
    num_map = session_numbers_for_course(db, course_id)

    student_ids = (
        db.query(Attendance.student_id)
        .distinct()
        .join(SessionModel, Attendance.session_id == SessionModel.id)
        .filter(SessionModel.course_id == course_id)
        .all()
    )
    sid_list = [row[0] for row in student_ids]
    students = (
        db.query(Student).filter(Student.id.in_(sid_list)).order_by(Student.name.asc()).all()
        if sid_list
        else []
    )

    # presence matrix: (student_id, session_id) -> bool
    att_rows = (
        db.query(Attendance.student_id, Attendance.session_id)
        .join(SessionModel, Attendance.session_id == SessionModel.id)
        .filter(SessionModel.course_id == course_id)
        .all()
    )
    present_pairs = {(r.student_id, r.session_id) for r in att_rows}

    output = io.StringIO()
    writer = csv.writer(output)
    header = ["name", "email"]
    for s in sessions_ordered:
        header.append(f"session_{num_map.get(s.id, 0)}")
    header.append("total_rate")
    writer.writerow(header)

    n_sess = len(sessions_ordered)
    for st in students:
        row = [st.name, st.email]
        attended = 0
        for s in sessions_ordered:
            if (st.id, s.id) in present_pairs:
                row.append("1")
                attended += 1
            else:
                row.append("")
        rate = (attended / n_sess * 100.0) if n_sess > 0 else 0.0
        row.append(f"{round(rate, 2)}%")
        writer.writerow(row)

    output.seek(0)
    safe_name = course.code.replace(" ", "_")
    filename = f"course_{safe_name}_attendance.csv"
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={
            "Content-Disposition": f"attachment; filename*=UTF-8''{filename}",
        },
    )


def _start_session_with_qr(db: Session, course: Course) -> SessionModel:
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
    return session


@router.post("/{course_id}/sessions", response_model=SessionResponse)
def start_course_session(course_id: int, db: Session = Depends(get_db)):
    course = db.query(Course).filter(Course.id == course_id).first()
    if not course:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Course not found")

    created = _start_session_with_qr(db, course)
    session = (
        db.query(SessionModel)
        .options(joinedload(SessionModel.course))
        .filter(SessionModel.id == created.id)
        .first()
    )
    assert session is not None and session.course is not None
    return SessionResponse(
        id=session.id,
        course_name=session.course.name,
        instructor=session.course.instructor_name,
        started_at=session.started_at,
        is_active=session.is_active,
    )


@router.delete("/{course_id}")
def delete_course(course_id: int, db: Session = Depends(get_db)):
    course = db.query(Course).filter(Course.id == course_id).first()
    if not course:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Course not found")

    # Check for active sessions
    active_session = (
        db.query(SessionModel)
        .filter(SessionModel.course_id == course_id, SessionModel.is_active)
        .first()
    )
    if active_session:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot delete a course with an active session. End the session first.",
        )

    db.delete(course)
    db.commit()
    return {"message": "Course deleted successfully"}
