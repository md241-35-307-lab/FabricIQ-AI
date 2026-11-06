from datetime import datetime
from sqlalchemy import Column, Integer, String, Float, DateTime, ForeignKey, JSON, Text
from database import Base


class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True)
    name = Column(String(100), nullable=False)
    email = Column(String(255), unique=True, nullable=False, index=True)
    password_hash = Column(String(255), nullable=False)
    role = Column(String(20), nullable=False, default="inspector")  # inspector | manager | admin
    created_at = Column(DateTime, default=datetime.utcnow)


class Inspection(Base):
    __tablename__ = "inspections"
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    image_path = Column(String(255), nullable=False)
    ai_results = Column(JSON, nullable=False)        # raw model output
    quality_score = Column(Float, nullable=False)
    needs_review = Column(Integer, default=0)        # FR-14
    status = Column(String(20), default="pending")   # pending | confirmed | corrected
    reviewed_results = Column(JSON, nullable=True)   # FR-08
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    reviewed_at = Column(DateTime, nullable=True)
