"""Defect detection.

Uses the trained YOLO weights when they can be loaded. If they cannot (missing file, torch blocked
by Windows, wrong package versions...) the app keeps working: no automatic detections, the inspector
can draw defects manually, and the reason is reported in the result instead of crashing.
"""
import os
from PIL import Image

WEIGHTS = os.getenv("YOLO_WEIGHTS", "weights/defects.pt")
LOW_CONF = float(os.getenv("LOW_CONF", "0.5"))  # FR-11: below this confidence -> human review required
CONF = float(os.getenv("YOLO_CONF", "0.25"))    # detection threshold, tune with ml/evaluate.py
IMGSZ = int(os.getenv("YOLO_IMGSZ", "640"))
_model = None
_error = None   # why the model is unavailable; decided once, not retried on every request


def _load():
    global _model, _error
    if _model is None and _error is None:
        if not os.path.exists(WEIGHTS):
            _error = f"weights file not found at {WEIGHTS}"
        else:
            try:
                from ultralytics import YOLO
                _model = YOLO(WEIGHTS)
            except Exception as e:
                _error = f"{type(e).__name__}: {str(e)[:160]}"
                print("AI model could not be loaded:", e)
    return _model


# ---- FR-07: preliminary visual score (rule-based, documented) -------------------------------------
# Start at 100 and subtract PENALTY points per defect, never going below 0.
#   * Before review (AI result):  penalty = PENALTY x the model's confidence for that defect.
#   * After review (human-confirmed findings): every remaining defect counts fully, penalty = PENALTY,
#     because an inspector has accepted it (a manually drawn defect is treated the same way).
# The score is an estimate for triage, not a certified textile-quality measurement.
PENALTY = 10
SCORE_RULE = (f"100 minus {PENALTY} points per defect (AI result: weighted by confidence; "
              f"reviewed result: full weight), minimum 0.")


def ai_score(dets: list) -> float:
    return max(0.0, round(100 - sum(PENALTY * d["confidence"] for d in dets), 1))


def reviewed_score(dets: list) -> float:
    return max(0.0, round(100 - PENALTY * len(dets), 1))


def colors_of(path: str) -> list:
    try:
        from color import dominant_colors
        return dominant_colors(path)
    except Exception as e:                       # colours are extra information; never fail the scan for them
        print("Colour estimation failed:", e)
        return []


def analyze(path: str) -> dict:
    w, h = Image.open(path).size          # raises for unreadable images (real input error)
    model = _load()
    dets, error = [], _error
    if model:
        try:
            r = model(path, conf=CONF, imgsz=IMGSZ, verbose=False)[0]
            for b in r.boxes:
                dets.append({
                    "class": r.names[int(b.cls)],
                    "confidence": round(float(b.conf), 3),
                    "box": [round(v, 1) for v in b.xyxy[0].tolist()],
                })
        except Exception as e:
            dets, error = [], f"{type(e).__name__}: {str(e)[:160]}"
            print("AI inference failed:", e)
    ok = bool(model) and error is None
    score = ai_score(dets)                                                    # FR-07
    needs_review = (not ok) or any(d["confidence"] < LOW_CONF for d in dets)  # FR-11
    return {"width": w, "height": h, "detections": dets, "model_loaded": ok, "model_error": error,
            "quality_score": score, "needs_review": needs_review, "review_threshold": LOW_CONF,
            "colors": colors_of(path)}                                        # FR-06
