# FabricIQ AI

## Setup
**Database:** `CREATE DATABASE fabriciq CHARACTER SET utf8mb4;`

**Backend**
```
cd backend
python -m venv venv && source venv/bin/activate   # Windows: venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env        # fill in DATABASE_URL and a long random JWT_SECRET
uvicorn main:app --reload   # tables are created on first start; docs at /docs
```
**Frontend**
```
cd frontend && npm install && npm run dev   # http://localhost:5173
```
Place trained YOLO weights at `backend/weights/defects.pt` (and `pip install ultralytics`).
Without weights the app runs, but reports that no model is loaded and detects nothing.

## FR coverage
FR-01 register/login · FR-03/04/05/07/14 analyze · FR-08/11 review + save · FR-12 history/stats · FR-13 report

## Roles and access
Register as **inspector** (active immediately), **manager** or **designer** (need admin approval). Admins cannot self-register.

**Existing database?** Run once: `ALTER TABLE users ADD COLUMN status VARCHAR(20) NOT NULL DEFAULT 'active';`

**Create the first admin:** `cd backend && python create_admin.py` (password is typed at the prompt).

| Role | Can do |
|---|---|
| inspector | upload / camera, review and save own inspections, own history and dashboard |
| manager | read-only: all inspections, reports, dashboard |
| designer | read-only: reviewed inspections (fabric gallery), dashboard |
| admin | approve, disable and re-role users, plus all read access |
