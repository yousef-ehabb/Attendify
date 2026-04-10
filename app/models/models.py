from datetime import datetime, timezone

from sqlalchemy import (
    Column,
    Integer,
    String,
    LargeBinary,
    Boolean,
    DateTime,
    ForeignKey,
    UniqueConstraint,
    Index,
)
from sqlalchemy.orm import relationship

from app.db.database import Base


class Student(Base):
    __tablename__ = "students"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String, nullable=False)
    email = Column(String, unique=True, nullable=False, index=True)
    face_encoding = Column(LargeBinary, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    attendances = relationship("Attendance", back_populates="student")

    def __repr__(self):
        return f"<Student(id={self.id}, name='{self.name}', email='{self.email}')>"


class Session(Base):
    __tablename__ = "sessions"

    id = Column(Integer, primary_key=True, autoincrement=True)
    course_name = Column(String, nullable=False)
    instructor = Column(String, nullable=False)
    started_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    is_active = Column(Boolean, default=True)

    qr_tokens = relationship("QRToken", back_populates="session")
    attendances = relationship("Attendance", back_populates="session")

    def __repr__(self):
        return f"<Session(id={self.id}, course='{self.course_name}', active={self.is_active})>"


class QRToken(Base):
    __tablename__ = "qr_tokens"

    id = Column(Integer, primary_key=True, autoincrement=True)
    session_id = Column(Integer, ForeignKey("sessions.id"), nullable=False, index=True)
    token = Column(String, unique=True, nullable=False, index=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    expires_at = Column(DateTime, nullable=False)

    session = relationship("Session", back_populates="qr_tokens")

    def __repr__(self):
        return f"<QRToken(id={self.id}, session_id={self.session_id}, expires={self.expires_at})>"


class Attendance(Base):
    __tablename__ = "attendance"
    __table_args__ = (
        UniqueConstraint("session_id", "student_id", name="uq_session_student"),
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    session_id = Column(Integer, ForeignKey("sessions.id", ondelete="CASCADE"), nullable=False)
    student_id = Column(Integer, ForeignKey("students.id", ondelete="CASCADE"), nullable=False)
    verified_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    session = relationship("Session", back_populates="attendances")
    student = relationship("Student", back_populates="attendances")

    def __repr__(self):
        return f"<Attendance(id={self.id}, session={self.session_id}, student={self.student_id})>"
