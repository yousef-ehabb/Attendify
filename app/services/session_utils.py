"""Shared session helpers (course-scoped session numbering)."""

from sqlalchemy.orm import Session as DBSession

from app.models.models import Session as SessionModel


def session_numbers_for_course(db: DBSession, course_id: int) -> dict[int, int]:
    """Map session id -> 1-based session number within the course."""
    ordered = (
        db.query(SessionModel)
        .filter(SessionModel.course_id == course_id)
        .order_by(SessionModel.started_at.asc(), SessionModel.id.asc())
        .all()
    )
    return {s.id: i + 1 for i, s in enumerate(ordered)}
