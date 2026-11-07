from typing import Literal
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from database import get_db
from models import User
from auth import require_roles

router = APIRouter(prefix="/admin", tags=["admin"])


class UserPatch(BaseModel):
    role: Literal["inspector", "manager", "designer", "admin"] | None = None
    status: Literal["active", "pending", "disabled"] | None = None


def _row(u: User):
    return {"id": u.id, "name": u.name, "email": u.email, "role": u.role,
            "status": u.status, "created_at": u.created_at.isoformat()}


@router.get("/users")
def users(db: Session = Depends(get_db), admin: User = Depends(require_roles("admin"))):
    return [_row(u) for u in db.query(User).order_by(User.status.desc(), User.created_at.desc())]


@router.patch("/users/{uid}")
def update_user(uid: int, body: UserPatch, db: Session = Depends(get_db),
                admin: User = Depends(require_roles("admin"))):
    if uid == admin.id:
        raise HTTPException(400, "You cannot change your own role or status.")
    u = db.get(User, uid)
    if not u:
        raise HTTPException(404, "User not found.")
    if body.role: u.role = body.role
    if body.status: u.status = body.status
    db.commit(); db.refresh(u)
    return _row(u)
