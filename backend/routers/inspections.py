import os, tempfile, traceback, uuid
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
    """Who can see what: inspector = own, designer = confirmed/corrected only, manager/admin = all."""
    if user.role == "inspector":
        return q.filter(Inspection.user_id == user.id)
    if user.role == "designer":
        return q.filter(Inspection.status.in_(["confirmed", "corrected"]))
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


# FR-03/04/05/06/07/11 — inspectors only
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
    except Exception as e:
        traceback.print_exc()   # full error in the backend terminal
        os.remove(path)
        raise HTTPException(422, f"Detection failed: {type(e).__name__}: {e}")
    row = Inspection(user_id=user.id, image_path=path, ai_results=result,
                     quality_score=result["quality_score"], needs_review=int(result["needs_review"]))
    db.add(row); db.commit(); db.refresh(row)
    return _out(row, {user.id: user.name})


class ReviewIn(BaseModel):
    decision: Literal["confirmed", "corrected", "rejected"]
    detections: list[dict] = []
    notes: str | None = None


# FR-08 — only the inspector who owns the record: confirm, correct or reject the AI findings
@router.put("/{iid}/review")
def review(iid: int, body: ReviewIn, db: Session = Depends(get_db),
           user: User = Depends(require_roles("inspector"))):
    i = _get(db, user, iid)
    if body.decision == "rejected":
        # AI findings are not accepted: nothing is kept as a defect, and the AI score stays as it was
        i.status, i.reviewed_results = "rejected", []
    else:
        i.status, i.reviewed_results = body.decision, body.detections
        i.quality_score = ai.reviewed_score(body.detections)      # FR-07: recalculated from confirmed findings
    i.notes = body.notes
    i.reviewed_at = datetime.utcnow()
    db.commit(); db.refresh(i)
    return _out(i, {user.id: user.name})


# FR-12 — history, scoped by role
@router.get("")
def history(db: Session = Depends(get_db), user: User = Depends(current_user)):
    names = {u.id: u.name for u in db.query(User.id, User.name)}
    rows = _scope(db.query(Inspection), user).order_by(Inspection.created_at.desc()).limit(200)
    return [_out(i, names) for i in rows]


@router.get("/classes")
def classes(db: Session = Depends(get_db), user: User = Depends(current_user)):
    """Class names for the draw-box list: the model's own classes plus any class seen in saved results."""
    m = ai._load()
    names = [m.names[i] for i in sorted(m.names)] if m else []
    for i in db.query(Inspection).all():
        for d in (i.reviewed_results or i.ai_results.get("detections", [])):
            if d["class"] not in names:
                names.append(d["class"])
    return {"classes": names}


@router.get("/stats")
def stats(db: Session = Depends(get_db), user: User = Depends(current_user)):
    """FR-12: number of inspections and counts of *confirmed* defect categories.

    Only reviewed (confirmed/corrected) records feed the defect counts and the average score;
    pending and rejected records are counted in by_status but their AI findings are not."""
    rows = _scope(db.query(Inspection), user).all()
    counts, by_status = {}, {"pending": 0, "confirmed": 0, "corrected": 0, "rejected": 0}
    reviewed = [r for r in rows if r.status in ("confirmed", "corrected")]
    for r in rows:
        by_status[r.status] = by_status.get(r.status, 0) + 1
    for r in reviewed:
        for d in (r.reviewed_results or []):
            counts[d["class"]] = counts.get(d["class"], 0) + 1
    avg = round(sum(r.quality_score for r in reviewed) / len(reviewed), 1) if reviewed else None
    return {"total": len(rows), "reviewed": len(reviewed), "avg_score": avg,
            "defects_by_class": counts, "by_status": by_status}


# FR-10 — report from saved data
@router.get("/{iid}/report")
def report(iid: int, db: Session = Depends(get_db), user: User = Depends(current_user)):
    i = _get(db, user, iid)
    if i.status == "pending":
        raise HTTPException(409, "Review and save this inspection before generating a report.")
    owner = db.get(User, i.user_id)
    a = i.ai_results or {}
    return {"inspection_id": i.id, "inspector": owner.name, "date": i.created_at.isoformat(),
            "reviewed_at": i.reviewed_at.isoformat() if i.reviewed_at else None, "decision": i.status,
            "image": f"/uploads/{os.path.basename(i.image_path)}", "width": a.get("width"), "height": a.get("height"),
            "quality_score": i.quality_score, "score_rule": ai.SCORE_RULE, "colors": a.get("colors", []),
            "defects": i.reviewed_results, "notes": i.notes,
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


# Real-time camera preview: detect only, nothing is saved to the database
@router.post("/predict")
def predict(file: UploadFile = File(...), user: User = Depends(require_roles("inspector"))):
    if file.content_type not in ALLOWED:
        raise HTTPException(415, "Only JPG or PNG images are supported.")
    data = file.file.read()
    if len(data) > MAX_BYTES:
        raise HTTPException(413, "Image is larger than 5 MB.")
    with tempfile.NamedTemporaryFile(delete=False, suffix=ALLOWED[file.content_type]) as f:
        f.write(data)
    try:
        r = ai.analyze(f.name)
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(422, f"Detection failed: {type(e).__name__}: {e}")
    finally:
        os.remove(f.name)
    return {"width": r["width"], "height": r["height"], "detections": r["detections"],
            "model_loaded": r["model_loaded"], "model_error": r["model_error"]}
