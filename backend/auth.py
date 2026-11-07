import os, re
from datetime import datetime, timedelta, timezone
import bcrypt, jwt
from fastapi import Depends, HTTPException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from database import get_db
from models import User

SECRET = os.environ["JWT_SECRET"]          # never hardcoded
EXPIRE = int(os.getenv("JWT_EXPIRE_MINUTES", "120"))
bearer = HTTPBearer()


def hash_password(pw: str) -> str:
    return bcrypt.hashpw(pw.encode(), bcrypt.gensalt()).decode()


def verify_password(pw: str, hashed: str) -> bool:
    return bcrypt.checkpw(pw.encode(), hashed.encode())


def validate_password(pw: str):
    if len(pw) < 8 or not re.search(r"[A-Za-z]", pw) or not re.search(r"\d", pw):
        raise ValueError("Password must be 8+ characters with letters and numbers")
    return pw


def create_token(user: User) -> str:
    exp = datetime.now(timezone.utc) + timedelta(minutes=EXPIRE)
    return jwt.encode({"sub": str(user.id), "role": user.role, "exp": exp}, SECRET, algorithm="HS256")


def current_user(cred: HTTPAuthorizationCredentials = Depends(bearer), db: Session = Depends(get_db)) -> User:
    try:
        data = jwt.decode(cred.credentials, SECRET, algorithms=["HS256"])
    except jwt.PyJWTError:
        raise HTTPException(401, "Session expired. Please log in again.")
    user = db.get(User, int(data["sub"]))
    if not user:
        raise HTTPException(401, "Account not found.")
    if user.status != "active":
        raise HTTPException(403, "This account is not active.")
    return user


def require_roles(*roles):
    """Role-based access control: allow only the listed roles."""
    def dep(user: User = Depends(current_user)) -> User:
        if user.role not in roles:
            raise HTTPException(403, "Your role does not have permission for this action.")
        return user
    return dep
