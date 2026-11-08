import { useEffect, useRef, useState } from "react";
import { Icon } from "./icons.jsx";
import { api } from "./api.js";

let classCache = null;
// class names of the loaded model (+ any class already present on this image)
export function useClassList(dets = []) {
  const [base, setBase] = useState(classCache || []);
  useEffect(() => {
    if (!classCache) api("/inspections/classes").then((r) => { classCache = r.classes; setBase(r.classes); }).catch(() => {});
  }, []);
  return [...new Set([...(base.length ? base : ["Defect"]), ...dets.map((d) => d.class)])];
}

const read = () => document.documentElement.dataset.theme || "light";

export function ThemeToggle() {
  const [t, setT] = useState(read);
  useEffect(() => {
    const f = () => setT(read());
    window.addEventListener("themechange", f);
    return () => window.removeEventListener("themechange", f);
  }, []);
  const flip = () => {
    const n = t === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = n;
    try { localStorage.setItem("theme", n); } catch { /* ignore */ }
    window.dispatchEvent(new Event("themechange"));
  };
  return (
    <button type="button" className="icon-btn" onClick={flip} title="Toggle light / dark mode"
      aria-label={`Switch to ${t === "dark" ? "light" : "dark"} mode`}>
      <Icon n={t === "dark" ? "sun" : "moon"} />
    </button>
  );
}

export const ago = (iso) => {
  const m = Math.max(0, Math.round((Date.now() - new Date(iso + "Z")) / 60000));
  return m < 1 ? "just now" : m < 60 ? `${m}m ago` : m < 1440 ? `${Math.round(m / 60)}h ago` : `${Math.round(m / 1440)}d ago`;
};

export const Chip = ({ s }) => <span className={`chip ${s}`}>{s}</span>;

export function ScoreRing({ value, size = 120 }) {
  const v = value ?? 0, c = 2 * Math.PI * 42;
  const tone = value == null ? "" : v >= 80 ? "ok" : v >= 60 ? "warn" : "bad";
  return (
    <div className={`ring ${tone}`} style={{ width: size, height: size, fontSize: size * 0.28 }}>
      <svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="42" className="trk" />
        <circle cx="50" cy="50" r="42" className="val" strokeDasharray={`${(v / 100) * c} ${c}`} transform="rotate(-90 50 50)" /></svg>
      <b>{value ?? "–"}</b>
    </div>
  );
}

export function Frame({ src, dets, w, h, hover, setHover, scanning, draw, onDraw }) {
  const layer = useRef();
  const [rect, setRect] = useState(null);
  const pos = (e) => {
    const b = layer.current.getBoundingClientRect();
    return [Math.min(1, Math.max(0, (e.clientX - b.left) / b.width)), Math.min(1, Math.max(0, (e.clientY - b.top) / b.height))];
  };
  const down = (e) => { layer.current.setPointerCapture(e.pointerId); const [x, y] = pos(e); setRect({ x0: x, y0: y, x1: x, y1: y }); };
  const move = (e) => { if (rect) { const [x, y] = pos(e); setRect({ ...rect, x1: x, y1: y }); } };
  const up = () => {
    if (!rect) return;
    const [xa, xb] = [rect.x0, rect.x1].sort((a, b) => a - b), [ya, yb] = [rect.y0, rect.y1].sort((a, b) => a - b);
    setRect(null);
    if (xb - xa > 0.01 && yb - ya > 0.01) onDraw([+(xa * w).toFixed(1), +(ya * h).toFixed(1), +(xb * w).toFixed(1), +(yb * h).toFixed(1)]);
  };
  return (
    <div className="frame">
      <img src={src} alt="Fabric sample under inspection" draggable={false} />
      {draw && (
        <div ref={layer} className="draw-layer" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={() => setRect(null)}>
          {rect && <span className="draw-rect" style={{ left: `${Math.min(rect.x0, rect.x1) * 100}%`, top: `${Math.min(rect.y0, rect.y1) * 100}%`, width: `${Math.abs(rect.x1 - rect.x0) * 100}%`, height: `${Math.abs(rect.y1 - rect.y0) * 100}%` }} />}
        </div>
      )}
      {scanning && <span className="scanline" />}
      {dets.map((d, i) => {
        const [x1, y1, x2, y2] = d.box;
        return (
          <span key={i} className={`${hover === i ? "box hot" : "box"}${d.manual ? " manual" : ""}`} onMouseEnter={() => setHover?.(i)} onMouseLeave={() => setHover?.(null)}
            style={{ left: `${(x1 / w) * 100}%`, top: `${(y1 / h) * 100}%`, width: `${((x2 - x1) / w) * 100}%`, height: `${((y2 - y1) / h) * 100}%` }}>
            <em>{d.class} {d.manual ? "manual" : `${Math.round(d.confidence * 100)}%`}</em>
          </span>
        );
      })}
    </div>
  );
}

export function DetList({ dets, onChange, editable, hover, setHover }) {
  const cls = useClassList(dets);
  return (
    <ul className="dets">
      {dets.map((d, i) => (
        <li key={i} className={hover === i ? "hot" : ""} onMouseEnter={() => setHover?.(i)} onMouseLeave={() => setHover?.(null)}>
          <span className="idx">{i + 1}</span>
          {editable
            ? <select value={d.class} onChange={(e) => onChange(dets.map((x, j) => (j === i ? { ...x, class: e.target.value } : x)))}>{cls.map((c) => <option key={c}>{c}</option>)}</select>
            : <b>{d.class}</b>}
          {d.manual ? <em>manual</em> : <><span className="conf"><i style={{ width: `${Math.round(d.confidence * 100)}%` }} /></span>
          <em>{Math.round(d.confidence * 100)}%</em></>}
          {editable && <button type="button" className="icon-btn sm" aria-label="Remove defect" onClick={() => onChange(dets.filter((_, j) => j !== i))}><Icon n="x" size={16} /></button>}
        </li>
      ))}
      {!dets.length && <li className="empty">No defects listed.</li>}
    </ul>
  );
}

export function DrawTools({ draw, setDraw, cls, setCls, list: all }) {
  return (
    <div className="drawbar">
      <button type="button" className={draw ? "btn sm" : "btn ghost sm"} onClick={() => setDraw(!draw)}>{draw ? "Drawing: drag on image" : "Draw missed defect"}</button>
      <select value={cls} onChange={(e) => setCls(e.target.value)} aria-label="Class for new box">{all.map((c) => <option key={c}>{c}</option>)}</select>
    </div>
  );
}
