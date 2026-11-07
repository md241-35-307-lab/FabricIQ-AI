import os, uuid
from datetime import datetime
from typing import Literal
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from pydantic import BaseModel
from sqlalchemy.orm import Session
from database import get_db
from models import Inspection, User
from auth import current_user, require_roles
import ai

router = APIRouter(prefix="/inspections", tags=["inspections"])
UPLOAD_DIR = "uploads"
ALLOWED = {"image/jpeg": ".jpg", "image/png": ".png"}
MAX_BYTES = 5 * 1024 * 1024  # NFR-03
os.makedirs(UPLOAD_DIR, exist_ok=True)


def _scope(q, user: User):
    """Who can see what: inspector = own, designer = reviewed only, manager/admin = all."""
    if user.role == "inspector":
        return q.filter(Inspection.user_id == user.id)
    if user.role == "designer":
        return q.filter(Inspection.status != "pending")
    return q


def _get(db, user, iid) -> Inspection:
    i = _scope(db.query(Inspection), user).filter(Inspection.id == iid).first()
    if not i:
        raise HTTPException(404, "Inspection not found.")
    return i


def _out(i: Inspection, names=None):
    return {"id": i.id, "image": f"/uploads/{os.path.basename(i.image_path)}", "ai_results": i.ai_results,
            "quality_score": i.quality_score, "needs_review": bool(i.needs_review), "status": i.status,
            "reviewed_results": i.reviewed_results, "notes": i.notes, "created_at": i.created_at.isoformat(),
            "inspector": (names or {}).get(i.user_id)}


# FR-03/04/05/07/14 — inspectors only
@router.post("/analyze", status_code=201)
async def analyze(file: UploadFile = File(...), db: Session = Depends(get_db),
                  user: User = Depends(require_roles("inspector"))):
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
    return _out(row, {user.id: user.name})


class ReviewIn(BaseModel):
    decision: Literal["confirmed", "corrected"]
    detections: list[dict]
    notes: str | None = None


# FR-08/11 — only the inspector who owns the record
@router.put("/{iid}/review")
def review(iid: int, body: ReviewIn, db: Session = Depends(get_db),
           user: User = Depends(require_roles("inspector"))):
    i = _get(db, user, iid)
    i.status, i.reviewed_results, i.notes = body.decision, body.detections, body.notes
    i.reviewed_at = datetime.utcnow()
    db.commit(); db.refresh(i)
    return _out(i, {user.id: user.name})


# FR-12 — history, scoped by role
@router.get("")
def history(db: Session = Depends(get_db), user: User = Depends(current_user)):
    names = {u.id: u.name for u in db.query(User.id, User.name)}
    rows = _scope(db.query(Inspection), user).order_by(Inspection.created_at.desc()).limit(200)
    return [_out(i, names) for i in rows]


@router.get("/stats")
def stats(db: Session = Depends(get_db), user: User = Depends(current_user)):
    rows = _scope(db.query(Inspection), user).all()
    counts, by_status = {}, {"pending": 0, "confirmed": 0, "corrected": 0}
    for r in rows:
        by_status[r.status] = by_status.get(r.status, 0) + 1
        for d in (r.reviewed_results if r.reviewed_results is not None else r.ai_results["detections"]):
            counts[d["class"]] = counts.get(d["class"], 0) + 1
    avg = round(sum(r.quality_score for r in rows) / len(rows), 1) if rows else None
    return {"total": len(rows), "avg_score": avg, "defects_by_class": counts, "by_status": by_status}


# FR-13 — report from saved data
@router.get("/{iid}/report")
def report(iid: int, db: Session = Depends(get_db), user: User = Depends(current_user)):
    i = _get(db, user, iid)
    if i.status == "pending":
        raise HTTPException(409, "Review and save this inspection before generating a report.")
    owner = db.get(User, i.user_id)
    return {"inspection_id": i.id, "inspector": owner.name, "date": i.created_at.isoformat(),
            "reviewed_at": i.reviewed_at.isoformat(), "decision": i.status,
            "quality_score": i.quality_score, "defects": i.reviewed_results, "notes": i.notes,
            "disclaimer": "AI output is a visual estimate and requires human judgment."}


# Delete — inspector (own records) or admin (any record)
@router.delete("/{iid}")
def delete(iid: int, db: Session = Depends(get_db), user: User = Depends(require_roles("inspector", "admin"))):
    i = _get(db, user, iid)
    path = i.image_path
    db.delete(i); db.commit()
    if os.path.exists(path):
        os.remove(path)
    return {"deleted": iid}
