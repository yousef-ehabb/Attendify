"""
Student management endpoints — Phase 1.

Covers:
  - POST /students/register    → create a student record
  - POST /students/{id}/enroll-face → upload 3-5 images, store averaged encoding
  - GET  /students/             → list all students (no face data exposed)
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session as DBSession, joinedload

from app.db.database import get_db
from app.models.models import Attendance, Student, Session as SessionModel
from app.schemas.schemas import (
    AddFaceRequest,
    AddFaceResponse,
    StudentCreate,
    StudentResponse,
    StudentRegisterResponse,
    FaceEnrollRequest,
    FaceEnrollResponse,
)
from app.services.face_utils import encode_faces, merge_face_encoding
from app.services.session_utils import session_numbers_for_course


router = APIRouter(prefix="/students", tags=["Students"])


@router.post("/bulk-wipe")
def bulk_delete_students(db: DBSession = Depends(get_db)):
    """Permanently delete ALL students and ALL attendance records."""
    from app.models.models import Attendance, Student
    
    try:
        # Delete all attendance records (child records)
        db.query(Attendance).delete()
        # Delete all students (parent records)
        db.query(Student).delete()
        
        db.commit()
        return {"message": "All students and attendance records deleted successfully"}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))


@router.post(
    "/register",
    response_model=StudentRegisterResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Register a new student",
)
def register_student(payload: StudentCreate, db: DBSession = Depends(get_db)):
    """
    Create a student record with name + email.
    Optional session_id + images (3–5) enrolls the face and marks attendance in one step.
    Otherwise face enrollment is a separate step via enroll-face.
    """
    existing = db.query(Student).filter(Student.email == payload.email).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"A student with email '{payload.email}' already exists",
        )

    face_encoding = None
    if payload.images:
        try:
            face_encoding = encode_faces(payload.images)
        except ValueError as e:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=str(e),
            )

    student = Student(name=payload.name.strip(), email=payload.email, face_encoding=face_encoding)
    db.add(student)
    db.flush()

    course_name = None
    session_number = None

    if payload.session_id is not None:
        sess = (
            db.query(SessionModel)
            .options(joinedload(SessionModel.course))
            .filter(SessionModel.id == payload.session_id)
            .first()
        )
        if not sess:
            db.rollback()
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")
        if not sess.is_active:
            db.rollback()
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Session is not active",
            )

        db.add(Attendance(session_id=payload.session_id, student_id=student.id))
        try:
            db.commit()
        except IntegrityError:
            db.rollback()
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Already marked for this session",
            )
        db.refresh(student)
        num_map = session_numbers_for_course(db, sess.course_id)
        session_number = num_map.get(sess.id)
        course_name = sess.course.name
    else:
        db.commit()
        db.refresh(student)

    return StudentRegisterResponse(
        id=student.id,
        name=student.name,
        email=student.email,
        has_face=student.face_encoding is not None,
        created_at=student.created_at,
        course_name=course_name,
        session_number=session_number,
    )


@router.post(
    "/{student_id}/enroll-face",
    response_model=FaceEnrollResponse,
    summary="Enroll a student's face",
)
def enroll_face(
    student_id: int,
    payload: FaceEnrollRequest,
    db: DBSession = Depends(get_db),
):
    """
    Accept 3-5 base64-encoded JPEG images, extract face encodings,
    average them into a single 128-d vector, and store as BLOB.

    Re-enrolling overwrites the previous encoding — useful if the
    student's appearance changes significantly.
    """
    student = db.query(Student).filter(Student.id == student_id).first()
    if not student:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Student with id {student_id} not found",
        )

    try:
        encoding_bytes = encode_faces(payload.images)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(e),
        )

    student.face_encoding = encoding_bytes
    db.commit()

    return FaceEnrollResponse(
        message="Face enrolled successfully",
        student_id=student.id,
    )


@router.post(
    "/{student_id}/add-face",
    response_model=AddFaceResponse,
    summary="Merge one new face image into the stored encoding",
)
def add_face(student_id: int, payload: AddFaceRequest, db: DBSession = Depends(get_db)):
    student = db.query(Student).filter(Student.id == student_id).first()
    if not student:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Student with id {student_id} not found",
        )
    if not student.face_encoding:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Student has no base face encoding; use enroll-face first",
        )
    try:
        student.face_encoding = merge_face_encoding(student.face_encoding, payload.image)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(e),
        )
    db.commit()
    return AddFaceResponse(message="Face encoding updated", student_id=student.id)


@router.get(
    "/",
    response_model=list[StudentResponse],
    summary="List all students",
)
def list_students(db: DBSession = Depends(get_db)):
    """
    Return all registered students.
    face_encoding is never exposed — only the has_face boolean
    indicates whether the student has completed enrollment.
    """
    students = db.query(Student).order_by(Student.created_at.desc()).all()

    return [
        StudentResponse(
            id=s.id,
            name=s.name,
            email=s.email,
            has_face=s.face_encoding is not None,
            created_at=s.created_at,
        )
        for s in students
    ]


@router.get(
    "/lookup",
    response_model=StudentResponse,
    summary="Lookup a student by email",
)
def lookup_student(email: str, db: DBSession = Depends(get_db)):
    """
    Return a single student by checking their email.
    Used by returning students to enter the flow without memorizing their DB ID.
    """
    student = db.query(Student).filter(Student.email == email).first()
    if not student:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Student with email '{email}' not found",
        )

    return StudentResponse(
        id=student.id,
        name=student.name,
        email=student.email,
        has_face=student.face_encoding is not None,
        created_at=student.created_at,
    )

@router.get(
    "/{student_id}",
    response_model=StudentResponse,
    summary="Get a student by ID",
)
def get_student(student_id: int, db: DBSession = Depends(get_db)):
    """
    Return a single student by ID.
    Used by students to verify their enrollment status.
    """
    student = db.query(Student).filter(Student.id == student_id).first()
    if not student:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Student with id {student_id} not found",
        )

    return StudentResponse(
        id=student.id,
        name=student.name,
        email=student.email,
        has_face=student.face_encoding is not None,
        created_at=student.created_at,
    )


@router.delete("/{student_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_student(student_id: int, db: DBSession = Depends(get_db)):
    """Permanently delete a student and all their data."""
    from app.models.models import Attendance
    
    student = db.query(Student).filter(Student.id == student_id).first()
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")
    
    # Manual cascade for environments where DB foreign keys aren't migrated
    db.query(Attendance).filter(Attendance.student_id == student_id).delete()
    
    db.delete(student)
    db.commit()
    return None


@router.post("/{student_id}/reset-face")
def reset_student_face(student_id: int, db: DBSession = Depends(get_db)):
    """Remove face biometric data but keep the student record."""
    student = db.query(Student).filter(Student.id == student_id).first()
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")
    student.face_encoding = None
    db.commit()
    return {"message": "Face data reset successfully"}

