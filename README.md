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
