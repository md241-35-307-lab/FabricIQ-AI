from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, EmailStr, Field, field_validator
from sqlalchemy.orm import Session
from database import get_db
from models import User
import auth

router = APIRouter(prefix="/auth", tags=["auth"])


class RegisterIn(BaseModel):
    name: str = Field(min_length=2, max_length=100)
    email: EmailStr
    password: str

    @field_validator("password")
    @classmethod
    def strong(cls, v):
        return auth.validate_password(v)


class LoginIn(BaseModel):
    email: EmailStr
    password: str


@router.post("/register", status_code=201)
def register(body: RegisterIn, db: Session = Depends(get_db)):
    email = body.email.lower()
    if db.query(User).filter_by(email=email).first():
        raise HTTPException(409, "An account with this email already exists.")
    user = User(name=body.name.strip(), email=email, password_hash=auth.hash_password(body.password))
    db.add(user); db.commit(); db.refresh(user)
    return {"id": user.id, "email": user.email}


@router.post("/login")
def login(body: LoginIn, db: Session = Depends(get_db)):
    user = db.query(User).filter_by(email=body.email.lower()).first()
    if not user or not auth.verify_password(body.password, user.password_hash):
        raise HTTPException(401, "Incorrect email or password.")
    return {"token": auth.create_token(user),
            "user": {"id": user.id, "name": user.name, "role": user.role}}
