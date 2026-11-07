"""Create (or promote) an admin. Run once:  python create_admin.py
Password is typed at the prompt, so no credentials live in the code."""
import getpass
from database import SessionLocal, Base, engine
from models import User
import auth

Base.metadata.create_all(engine)
name = input("Admin name: ").strip()
email = input("Admin email: ").strip().lower()
pw = auth.validate_password(getpass.getpass("Password (8+ chars, letters and numbers): "))
db = SessionLocal()
u = db.query(User).filter_by(email=email).first()
if u:
    u.role, u.status = "admin", "active"
else:
    db.add(User(name=name, email=email, password_hash=auth.hash_password(pw), role="admin", status="active"))
db.commit()
print("Admin ready:", email)
