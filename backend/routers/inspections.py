import os, uuid
from datetime import datetime
from typing import Literal
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.orm import Session
from database import get_db
from models import Inspection, User
from auth import current_user
import ai

router = APIRouter(prefix="/inspections", tags=["inspections"])
UPLOAD_DIR = "uploads"
ALLOWED = {"image/jpeg": ".jpg", "image/png": ".png"}
MAX_BYTES = 5 * 1024 * 1024  # NFR-03
os.makedirs(UPLOAD_DIR, exist_ok=True)


def _out(i: Inspection):
    return {"id": i.id, "image": f"/uploads/{os.path.basename(i.image_path)}", "ai_results": i.ai_results,
            "quality_score": i.quality_score, "needs_review": bool(i.needs_review), "status": i.status,
            "reviewed_results": i.reviewed_results, "notes": i.notes,
            "created_at": i.created_at.isoformat(), "user_id": i.user_id}


def _owned(db, user: User, iid: int) -> Inspection:
    i = db.get(Inspection, iid)
    if not i or (i.user_id != user.id and user.role == "inspector"):
        raise HTTPException(404, "Inspection not found.")
    return i


# FR-03, FR-04, FR-05, FR-07, FR-14 — upload, analyze, store
@router.post("/analyze", status_code=201)
async def analyze(file: UploadFile = File(...), db: Session = Depends(get_db), user: User = Depends(current_user)):
    if file.content_type not in ALLOWED:
        raise HTTPException(415, "Only JPG or PNG images are supported.")
    data = await file.read()
    if len(data) > MAX_BYTES:
        raise HTTPException(413, "Image is larger than 5 MB.")
    path = os.path.join(UPLOAD_DIR, uuid.uuid4().hex + ALLOWED[file.content_type])
    with open(path, "wb") as f:
        f.write(data)
    try:
        result = ai.analyze(path)
    except Exception:
        os.remove(path)
        raise HTTPException(422, "Could not read this image. Try a different file.")
    row = Inspection(user_id=user.id, image_path=path, ai_results=result,
                     quality_score=result["quality_score"], needs_review=int(result["needs_review"]))
    db.add(row); db.commit(); db.refresh(row)
    return _out(row)


class ReviewIn(BaseModel):
    decision: Literal["confirmed", "corrected"]
    detections: list[dict]
    notes: str | None = None


# FR-08, FR-11 — human review saved to MySQL
@router.put("/{iid}/review")
def review(iid: int, body: ReviewIn, db: Session = Depends(get_db), user: User = Depends(current_user)):
    i = _owned(db, user, iid)
    i.status, i.reviewed_results, i.notes = body.decision, body.detections, body.notes
    i.reviewed_at = datetime.utcnow()
    db.commit(); db.refresh(i)
    return _out(i)


# FR-12 — history (inspectors see own; managers/admins see all)
@router.get("")
def history(db: Session = Depends(get_db), user: User = Depends(current_user)):
    q = db.query(Inspection)
    if user.role == "inspector":
        q = q.filter_by(user_id=user.id)
    return [_out(i) for i in q.order_by(Inspection.created_at.desc()).limit(100)]


@router.get("/stats")
def stats(db: Session = Depends(get_db), user: User = Depends(current_user)):
    q = db.query(Inspection)
    if user.role == "inspector":
        q = q.filter_by(user_id=user.id)
    rows = q.all()
    counts: dict = {}
    for r in rows:
        for d in (r.reviewed_results if r.reviewed_results is not None else r.ai_results["detections"]):
            counts[d["class"]] = counts.get(d["class"], 0) + 1
    avg = round(sum(r.quality_score for r in rows) / len(rows), 1) if rows else None
    return {"total": len(rows), "avg_score": avg, "defects_by_class": counts}


# FR-13 — structured report from saved data
@router.get("/{iid}/report")
def report(iid: int, db: Session = Depends(get_db), user: User = Depends(current_user)):
    i = _owned(db, user, iid)
    if i.status == "pending":
        raise HTTPException(409, "Review and save this inspection before generating a report.")
    inspector = db.get(User, i.user_id)
    return {"inspection_id": i.id, "inspector": inspector.name, "date": i.created_at.isoformat(),
            "reviewed_at": i.reviewed_at.isoformat(), "decision": i.status,
            "quality_score": i.quality_score, "defects": i.reviewed_results, "notes": i.notes,
            "disclaimer": "AI output is a visual estimate and requires human judgment."}
