"""Defect detection. Uses trained YOLO weights if present; otherwise reports model_loaded=False
(it never invents detections)."""
import os
from PIL import Image

WEIGHTS = os.getenv("YOLO_WEIGHTS", "weights/defects.pt")
LOW_CONF = 0.5
_model = None


def _load():
    global _model
    if _model is None and os.path.exists(WEIGHTS):
        from ultralytics import YOLO
        _model = YOLO(WEIGHTS)
    return _model


def analyze(path: str) -> dict:
    w, h = Image.open(path).size
    model = _load()
    dets = []
    if model:
        r = model(path, verbose=False)[0]
        for b in r.boxes:
            dets.append({
                "class": r.names[int(b.cls)],
                "confidence": round(float(b.conf), 3),
                "box": [round(v, 1) for v in b.xyxy[0].tolist()],
            })
    # transparent rule-based score (documented in report): -10 per defect weighted by confidence
    score = max(0.0, round(100 - sum(10 * d["confidence"] for d in dets), 1))
    needs_review = (not model) or any(d["confidence"] < LOW_CONF for d in dets)
    return {"width": w, "height": h, "detections": dets, "model_loaded": bool(model),
            "quality_score": score, "needs_review": needs_review}
