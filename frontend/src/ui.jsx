import { useEffect, useState } from "react";
import { Icon } from "./icons.jsx";

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

export function Frame({ src, dets, w, h, hover, setHover, scanning }) {
  return (
    <div className="frame">
      <img src={src} alt="Fabric sample under inspection" />
      {scanning && <span className="scanline" />}
      {dets.map((d, i) => {
        const [x1, y1, x2, y2] = d.box;
        return (
          <span key={i} className={hover === i ? "box hot" : "box"} onMouseEnter={() => setHover?.(i)} onMouseLeave={() => setHover?.(null)}
            style={{ left: `${(x1 / w) * 100}%`, top: `${(y1 / h) * 100}%`, width: `${((x2 - x1) / w) * 100}%`, height: `${((y2 - y1) / h) * 100}%` }}>
            <em>{d.class} {Math.round(d.confidence * 100)}%</em>
          </span>
        );
      })}
    </div>
  );
}

export function DetList({ dets, onChange, editable, hover, setHover }) {
  const cls = [...new Set(["Hole", "Knot", "Stain", ...dets.map((d) => d.class)])];
  return (
    <ul className="dets">
      {dets.map((d, i) => (
        <li key={i} className={hover === i ? "hot" : ""} onMouseEnter={() => setHover?.(i)} onMouseLeave={() => setHover?.(null)}>
          <span className="idx">{i + 1}</span>
          {editable
            ? <select value={d.class} onChange={(e) => onChange(dets.map((x, j) => (j === i ? { ...x, class: e.target.value } : x)))}>{cls.map((c) => <option key={c}>{c}</option>)}</select>
            : <b>{d.class}</b>}
          <span className="conf"><i style={{ width: `${Math.round(d.confidence * 100)}%` }} /></span>
          <em>{Math.round(d.confidence * 100)}%</em>
          {editable && <button type="button" className="icon-btn sm" aria-label="Remove defect" onClick={() => onChange(dets.filter((_, j) => j !== i))}><Icon n="x" size={16} /></button>}
        </li>
      ))}
      {!dets.length && <li className="empty">No defects listed.</li>}
    </ul>
  );
}
