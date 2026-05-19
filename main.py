import os
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from app.api.attendance import router as attendance_router
from app.api.courses import router as courses_router
from app.api.sessions import router as sessions_router
from app.api.students import router as students_router
from app.core.config import settings
from app.db.database import Base, engine
import app.models.models  # noqa: F401


BASE_DIR = Path(__file__).resolve().parent
FRONTEND_DIST_DIR = BASE_DIR / "frontend" / "dist"
FRONTEND_ASSETS_DIR = FRONTEND_DIST_DIR / "assets"


@asynccontextmanager
async def lifespan(application: FastAPI):
    """Startup: create data dir + DB tables. Shutdown: nothing needed yet."""
    os.makedirs("data", exist_ok=True)
    Base.metadata.create_all(bind=engine)
    yield


app = FastAPI(title="Attendify", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[origin.strip() for origin in settings.ALLOWED_ORIGINS.split(",")],
    allow_credentials=True,
    allow_methods=["GET", "POST", "DELETE"],
    allow_headers=["Content-Type", "Authorization"],
)



if FRONTEND_ASSETS_DIR.exists():
    app.mount("/assets", StaticFiles(directory=FRONTEND_ASSETS_DIR), name="frontend-assets")

app.include_router(students_router, prefix="/api")
app.include_router(sessions_router, prefix="/api")
app.include_router(courses_router, prefix="/api")
app.include_router(attendance_router, prefix="/api")


@app.get("/api/health")
def health_check():
    return {"status": "ok"}



@app.get("/{full_path:path}")
def frontend_application(full_path: str):
    index_file = FRONTEND_DIST_DIR / "index.html"

    if index_file.exists():
        return FileResponse(index_file)

    if full_path in {"", "/"}:
        return JSONResponse({"status": "ok"})

    return JSONResponse({"detail": "Not Found"}, status_code=404)
