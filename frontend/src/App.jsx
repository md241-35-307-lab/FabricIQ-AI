import { useEffect, useState } from "react";
import { api, setToken } from "./api.js";

function Auth({ onLogin, mode, go }) {
  const [f, setF] = useState({ name: "", email: "", password: "" });
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  async function submit(e) {
    e.preventDefault();
    setMsg(""); setBusy(true);
    try {
      if (mode === "register") {
        await api("/auth/register", { method: "POST", json: f });
        go("/login");
        setMsg("Account created. Log in to continue.");
      } else {
        const r = await api("/auth/login", { method: "POST", json: { email: f.email, password: f.password } });
        setToken(r.token);
        onLogin(r.user);
      }
    } catch (err) { setMsg(err.message); }
    setBusy(false);
  }

  return (
    <main className="auth">
      <h1>FabricIQ</h1>
      <p className="sub">Inspect fabric, review defects, keep the record.</p>
      <form onSubmit={submit}>
        {mode === "register" && <label>Full name<input value={f.name} onChange={set("name")} required minLength={2} /></label>}
        <label>Email<input type="email" value={f.email} onChange={set("email")} required /></label>
        <label>Password<input type="password" value={f.password} onChange={set("password")} required minLength={mode === "register" ? 8 : 1} /></label>
        {mode === "register" && <small>At least 8 characters, with letters and numbers.</small>}
        {msg && <p className="msg" role="alert">{msg}</p>}
        <button disabled={busy}>{busy ? "Please wait…" : mode === "login" ? "Log in" : "Create account"}</button>
      </form>
      <button className="link" onClick={() => { go(mode === "login" ? "/register" : "/login"); setMsg(""); }}>
        {mode === "login" ? "Need an account? Register" : "Have an account? Log in"}
      </button>
    </main>
  );
}

function Inspect({ onSaved }) {
  const [res, setRes] = useState(null);
  const [dets, setDets] = useState([]);
  const [notes, setNotes] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  async function upload(e) {
    const file = e.target.files[0];
    if (!file) return;
    setMsg(""); setBusy(true);
    const form = new FormData(); form.append("file", file);
    try {
      const r = await api("/inspections/analyze", { method: "POST", form });
      setRes(r); setDets(r.ai_results.detections); setNotes("");
    } catch (err) { setMsg(err.message); }
    setBusy(false);
  }

  async function save() {
    const changed = JSON.stringify(dets) !== JSON.stringify(res.ai_results.detections);
    try {
      const r = await api(`/inspections/${res.id}/review`, { method: "PUT", json: { decision: changed ? "corrected" : "confirmed", detections: dets, notes } });
      setRes(r); setMsg("Saved to the inspection record."); onSaved();
    } catch (err) { setMsg(err.message); }
  }

  const a = res?.ai_results;
  return (
    <section>
      <h2>New inspection</h2>
      <input type="file" accept="image/jpeg,image/png" onChange={upload} disabled={busy} />
      {busy && <p>Analyzing…</p>}
      {msg && <p className="msg" role="status">{msg}</p>}
      {res && (
        <div className="result">
          <div className="frame">
            <img src={res.image} alt="Uploaded fabric" />
            {dets.map((d, i) => {
              const [x1, y1, x2, y2] = d.box;
              return <span key={i} className="box" title={d.class}
                style={{ left: `${(x1 / a.width) * 100}%`, top: `${(y1 / a.height) * 100}%`, width: `${((x2 - x1) / a.width) * 100}%`, height: `${((y2 - y1) / a.height) * 100}%` }} />;
            })}
          </div>
          <div>
            <p className="score">{res.quality_score}<small> / 100 visual score (estimate)</small></p>
            {!a.model_loaded && <p className="msg">No trained model is loaded, so no defects were detected. Add weights to backend/weights/.</p>}
            {res.needs_review && <p className="msg">Human review required.</p>}
            <ul className="dets">
              {dets.map((d, i) => (
                <li key={i}>{d.class} <em>{Math.round(d.confidence * 100)}%</em>
                  {res.status === "pending" && <button className="link" onClick={() => setDets(dets.filter((_, j) => j !== i))}>Remove</button>}
                </li>
              ))}
              {!dets.length && <li>No defects listed.</li>}
            </ul>
            <label>Inspector notes<textarea value={notes} onChange={(e) => setNotes(e.target.value)} disabled={res.status !== "pending"} /></label>
            {res.status === "pending" ? <button onClick={save}>Confirm and save</button> : <p>Status: {res.status}</p>}
          </div>
        </div>
      )}
    </section>
  );
}

function History({ refreshKey }) {
  const [rows, setRows] = useState([]);
  const [stats, setStats] = useState(null);
  const [report, setReport] = useState(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    api("/inspections").then(setRows).catch((e) => setErr(e.message));
    api("/inspections/stats").then(setStats).catch(() => {});
  }, [refreshKey]);

  async function openReport(id) {
    try { setReport(await api(`/inspections/${id}/report`)); setErr(""); } catch (e) { setErr(e.message); }
  }

  return (
    <section>
      <h2>History</h2>
      {stats && <p className="stats">{stats.total} inspections · average score {stats.avg_score ?? "–"} · defects: {Object.entries(stats.defects_by_class).map(([k, v]) => `${k} ${v}`).join(", ") || "none"}</p>}
      {err && <p className="msg" role="alert">{err}</p>}
      <table>
        <thead><tr><th>Date</th><th>Score</th><th>Status</th><th></th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}><td>{new Date(r.created_at + "Z").toLocaleString()}</td><td>{r.quality_score}</td><td>{r.status}</td>
              <td><button className="link" onClick={() => openReport(r.id)}>Report</button></td></tr>
          ))}
          {!rows.length && <tr><td colSpan="4">No inspections yet. Upload a fabric image to start.</td></tr>}
        </tbody>
      </table>
      {report && (
        <article className="report">
          <h3>Inspection report #{report.inspection_id}</h3>
          <p>Inspector: {report.inspector} · Decision: {report.decision} · Score: {report.quality_score}</p>
          <ul>{report.defects.map((d, i) => <li key={i}>{d.class} ({Math.round(d.confidence * 100)}%)</li>)}</ul>
          <p>Notes: {report.notes || "none"}</p>
          <small>{report.disclaimer}</small><br />
          <button onClick={() => window.print()}>Print</button>
        </article>
      )}
    </section>
  );
}

export default function App() {
  const [user, setUser] = useState(() => JSON.parse(sessionStorage.getItem("user") || "null"));
  const [path, setPath] = useState(window.location.pathname);
  const [key, setKey] = useState(0);

  const go = (to, replace = false) => {
    window.history[replace ? "replaceState" : "pushState"]({}, "", to);
    setPath(to);
  };

  useEffect(() => {
    const onPop = () => setPath(window.location.pathname);
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  // route guards
  const page = path === "/history" ? "history" : path === "/inspect" ? "inspect" : null;
  useEffect(() => {
    if (!user && path !== "/login" && path !== "/register") go("/login", true);
    else if (user && !page) go("/inspect", true);
  }, [user, path]);

  if (!user) {
    return <Auth mode={path === "/register" ? "register" : "login"} go={go}
      onLogin={(u) => { sessionStorage.setItem("user", JSON.stringify(u)); setUser(u); go("/inspect"); }} />;
  }
  return (
    <>
      <header>
        <strong>FabricIQ</strong>
        <nav>
          <button className={page === "inspect" ? "on" : ""} onClick={() => go("/inspect")}>Inspect</button>
          <button className={page === "history" ? "on" : ""} onClick={() => go("/history")}>History</button>
        </nav>
        <span>{user.name} ({user.role}) <button className="link" onClick={() => { setToken(null); sessionStorage.removeItem("user"); setUser(null); go("/login"); }}>Log out</button></span>
      </header>
      <main>{page === "history" ? <History refreshKey={key} /> : <Inspect onSaved={() => setKey(key + 1)} />}</main>
    </>
  );
}
