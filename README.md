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

## FR coverage (numbers follow the approved SRS)

| FR | Where |
|---|---|
| FR-01 login, FR-02 roles | `backend/auth.py`, `routers/auth_routes.py`, `routers/admin.py` |
| FR-03 image input | upload / camera on the Workspace page, `POST /inspections/analyze` |
| FR-04 detection, FR-05 boxes + confidence | `backend/ai.py` (YOLO weights in `backend/weights/defects.pt`) |
| FR-06 dominant colours | `backend/color.py` (OpenCV k-means, 3 colours, stored in `ai_results.colors`) |
| FR-07 visual score | `backend/ai.py`: see the rule below |
| FR-08 confirm / correct / reject | `PUT /inspections/{id}/review` (`decision` = confirmed, corrected or rejected) |
| FR-09 history | `GET /inspections`, History page |
| FR-10 report | `GET /inspections/{id}/report`, "Open report" in History (printable) |
| FR-11 confidence warning | `LOW_CONF` in `.env` (default 0.5); flags the inspection and each low-confidence defect |
| FR-12 statistics | `GET /inspections/stats` (confirmed defect counts only) |

### Visual score rule (FR-07)

Start at 100, subtract 10 points per defect, minimum 0.

- AI result (before review): each defect counts 10 x its confidence.
- After the inspector confirms or corrects: every remaining defect counts the full 10, because a person accepted it (manually drawn defects too). The score is recalculated on save.
- A rejected inspection keeps the AI score for reference but is left out of the average and the defect counts.

The score is a triage estimate, not a certified textile-quality measurement.
