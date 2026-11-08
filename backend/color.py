"""FR-06: dominant fabric colours, estimated with OpenCV k-means.

The image is shrunk first (speed), its pixels are grouped into K colour clusters, and the clusters are
returned largest-first with their share of the image. This is an estimate: lighting and camera
white-balance change how a colour looks, so it is not a colour-matching measurement.
"""
import numpy as np

K = 3            # how many dominant colours to report
SAMPLE = 120     # longest side (px) used for clustering


def dominant_colors(path: str, k: int = K) -> list[dict]:
    import cv2                                   # imported here so a missing OpenCV cannot stop the app
    img = cv2.imread(path)                       # BGR, alpha dropped
    if img is None:
        return []
    scale = SAMPLE / max(img.shape[:2])
    if scale < 1:
        img = cv2.resize(img, None, fx=scale, fy=scale, interpolation=cv2.INTER_AREA)
    pixels = img.reshape(-1, 3).astype(np.float32)
    k = max(1, min(k, len(pixels)))
    cv2.setRNGSeed(0)                            # same image -> same answer
    criteria = (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 20, 1.0)
    _, labels, centers = cv2.kmeans(pixels, k, None, criteria, 3, cv2.KMEANS_PP_CENTERS)
    counts = np.bincount(labels.flatten(), minlength=k)
    out = []
    for i in np.argsort(-counts):
        b, g, r = (int(round(v)) for v in centers[i])
        out.append({"hex": f"#{r:02x}{g:02x}{b:02x}", "percent": round(float(100 * counts[i] / counts.sum()), 1)})
    return out
