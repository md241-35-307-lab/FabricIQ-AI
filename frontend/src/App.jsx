import { useEffect, useRef, useState } from "react";
import { api, setToken } from "./api.js";

const ROLES = {
  inspector: ["Quality Inspector", "Upload fabric, review AI-detected defects, save inspection records."],
  manager: ["Production Manager", "Monitor defect statistics and review inspection reports."],
  designer: ["Fabric Designer", "Browse reviewed fabric analysis to support design planning."],
};
const NAV = {
  inspector: [["inspect", "Inspect"], ["history", "History"], ["dashboard", "Dashboard"]],
  manager: [["dashboard", "Dashboard"], ["history", "History"]],
  designer: [["history", "Fabric gallery"], ["dashboard", "Dashboard"]],
  admin: [["dashboard", "Dashboard"], ["history", "History"], ["users", "Users"]],
};
const home = (role) => (role === "inspector" ? "/inspect" : "/dashboard");
const strength = (p) => [p.length >= 8, /[A-Z]/.test(p), /\d/.test(p), /[^A-Za-z0-9]/.test(p)].filter(Boolean).length;

function Auth({ mode, go, onLogin, notify }) {
  const [f, setF] = useState({ name: "", email: "", password: "", confirm: "", role: "inspector" });
  const [show, setShow] = useState(false);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const reg = mode === "register";

  async function submit(e) {
    e.preventDefault();
    setMsg("");
    if (reg && f.password !== f.confirm) return setMsg("Passwords do not match.");
    setBusy(true);
    try {
      if (reg) {
        const r = await api("/auth/register", { method: "POST", json: { name: f.name, email: f.email, password: f.password, role: f.role } });
        notify(r.status === "pending" ? "Account created. An admin must approve your role before you can log in." : "Account created. You can log in now.");
        go("/login");
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
      <p className="sub">{reg ? "Create your account" : "Log in to continue"}</p>
      <form onSubmit={submit}>
        {reg && (
          <>
            <fieldset className="roles"><legend>I am a…</legend>
              {Object.entries(ROLES).map(([k, [t, d]]) => (
                <label key={k} className={f.role === k ? "card on" : "card"}>
                  <input type="radio" name="role" checked={f.role === k} onChange={() => setF({ ...f, role: k })} />
                  <b>{t}</b><span>{d}</span>
                </label>
              ))}
            </fieldset>
            {f.role !== "inspector" && <p className="note">This role needs admin approval before you can log in.</p>}
            <label>Full name<input value={f.name} onChange={set("name")} required minLength={2} /></label>
          </>
        )}
        <label>Email<input type="email" value={f.email} onChange={set("email")} required /></label>
        <label>Password
          <span className="pw"><input type={show ? "text" : "password"} value={f.password} onChange={set("password")} required />
            <button type="button" className="ghost" onClick={() => setShow(!show)}>{show ? "Hide" : "Show"}</button></span>
        </label>
        {reg && (
          <>
            <div className="meter">{[1, 2, 3, 4].map((n) => <i key={n} className={strength(f.password) >= n ? `s${strength(f.password)}` : ""} />)}</div>
            <small>8+ characters with letters and numbers. Capitals and symbols make it stronger.</small>
            <label>Confirm password<input type={show ? "text" : "password"} value={f.confirm} onChange={set("confirm")} required /></label>
          </>
        )}
        {msg && <p className="msg" role="alert">{msg}</p>}
        <button disabled={busy}>{busy ? "Please wait…" : reg ? "Create account" : "Log in"}</button>
      </form>
      <button className="link" onClick={() => { go(reg ? "/login" : "/register"); setMsg(""); }}>
        {reg ? "Have an account? Log in" : "Need an account? Register"}
      </button>
    </main>
  );
}

function Frame({ src, dets, w, h, hover, setHover }) {
  return (
    <div className="frame">
      <img src={src} alt="Fabric" />
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

function Camera({ onCapture, onClose }) {
  const v = useRef();
  useEffect(() => {
    let s;
    navigator.mediaDevices?.getUserMedia({ video: true })
      .then((st) => { s = st; v.current.srcObject = st; })
      .catch(() => onClose("Camera access was denied or no camera was found."));
    return () => s?.getTracks().forEach((t) => t.stop());
  }, []);
  const snap = () => {
    const c = document.createElement("canvas");
    c.width = v.current.videoWidth; c.height = v.current.videoHeight;
    c.getContext("2d").drawImage(v.current, 0, 0);
    c.toBlob((b) => onCapture(new File([b], "capture.jpg", { type: "image/jpeg" })), "image/jpeg", 0.92);
  };
  return (
    <div className="cam"><video ref={v} autoPlay playsInline muted />
      <div><button onClick={snap}>Capture</button> <button className="ghost" onClick={() => onClose()}>Cancel</button></div></div>
  );
}

function Inspect({ notify, onSaved }) {
  const [res, setRes] = useState(null);
  const [dets, setDets] = useState([]);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [cam, setCam] = useState(false);
  const [drag, setDrag] = useState(false);
  const [hover, setHover] = useState(null);

  async function run(file) {
    if (!file) return;
    setBusy(true); setCam(false);
    const form = new FormData(); form.append("file", file);
    try {
      const r = await api("/inspections/analyze", { method: "POST", form });
      setRes(r); setDets(r.ai_results.detections); setNotes("");
    } catch (err) { notify(err.message, "err"); }
    setBusy(false);
  }
  async function save() {
    const changed = JSON.stringify(dets) !== JSON.stringify(res.ai_results.detections);
    try {
      setRes(await api(`/inspections/${res.id}/review`, { method: "PUT", json: { decision: changed ? "corrected" : "confirmed", detections: dets, notes } }));
      notify("Saved to the inspection record."); onSaved();
    } catch (err) { notify(err.message, "err"); }
  }

  const a = res?.ai_results;
  const pending = res?.status === "pending";
  const classes = [...new Set(["Hole", "Knot", "Stain", ...dets.map((d) => d.class)])];
  return (
    <section>
      <h2>New inspection</h2>
      {cam ? <Camera onCapture={run} onClose={(m) => { setCam(false); m && notify(m, "err"); }} /> : (
        <label className={drag ? "drop on" : "drop"} onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
          onDrop={(e) => { e.preventDefault(); setDrag(false); run(e.dataTransfer.files[0]); }}>
          <input type="file" accept="image/jpeg,image/png" hidden onChange={(e) => run(e.target.files[0])} disabled={busy} />
          {busy ? <span className="spin" /> : <>Drag a fabric image here, or click to choose<small>JPG or PNG, up to 5 MB</small></>}
        </label>
      )}
      {!cam && <button className="ghost" onClick={() => setCam(true)}>Use live camera</button>}
      {res && (
        <div className="result">
          <Frame src={res.image} dets={dets} w={a.width} h={a.height} hover={hover} setHover={setHover} />
          <div>
            <p className="score">{res.quality_score}<small> / 100 visual score (estimate)</small></p>
            {!a.model_loaded && <p className="note">No trained model is loaded, so nothing was detected.</p>}
            {res.needs_review && <p className="note">Human review required.</p>}
            <ul className="dets">
              {dets.map((d, i) => (
                <li key={i} className={hover === i ? "hot" : ""} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
                  {pending ? <select value={d.class} onChange={(e) => setDets(dets.map((x, j) => (j === i ? { ...x, class: e.target.value } : x)))}>
                    {classes.map((c) => <option key={c}>{c}</option>)}</select> : <b>{d.class}</b>}
                  <em>{Math.round(d.confidence * 100)}%</em>
                  {pending && <button className="link" onClick={() => setDets(dets.filter((_, j) => j !== i))}>Remove</button>}
                </li>
              ))}
              {!dets.length && <li>No defects listed.</li>}
            </ul>
            {pending && <button className="link" onClick={() => setDets(a.detections)}>Reset to AI result</button>}
            <label>Inspector notes<textarea value={notes} onChange={(e) => setNotes(e.target.value)} disabled={!pending} /></label>
            {pending ? <button onClick={save}>Confirm and save</button> : <span className={`chip ${res.status}`}>{res.status}</span>}
          </div>
        </div>
      )}
    </section>
  );
}

function Dashboard({ refreshKey }) {
  const [s, setS] = useState(null);
  useEffect(() => { api("/inspections/stats").then(setS).catch(() => {}); }, [refreshKey]);
  if (!s) return <p>Loading…</p>;
  const max = Math.max(1, ...Object.values(s.defects_by_class));
  return (
    <section>
      <h2>Dashboard</h2>
      <div className="cards">
        <div className="stat"><b>{s.total}</b>Inspections</div>
        <div className="stat"><b>{s.avg_score ?? "–"}</b>Average score</div>
        {Object.entries(s.by_status).map(([k, v]) => <div key={k} className="stat"><b>{v}</b><span className={`chip ${k}`}>{k}</span></div>)}
      </div>
      <h3>Defects by type</h3>
      {Object.entries(s.defects_by_class).map(([k, v]) => (
        <div className="bar" key={k}><span>{k}</span><i style={{ width: `${(v / max) * 100}%` }} /><b>{v}</b></div>
      ))}
      {!Object.keys(s.defects_by_class).length && <p>No defects recorded yet.</p>}
    </section>
  );
}

function History({ refreshKey, role, notify, onChange }) {
  const [rows, setRows] = useState([]);
  const [q, setQ] = useState("");
  const [st, setSt] = useState("all");
  const [open, setOpen] = useState(null);
  const [report, setReport] = useState(null);
  const [hover, setHover] = useState(null);
  const [edit, setEdit] = useState(null);

  useEffect(() => { api("/inspections").then(setRows).catch(() => {}); }, [refreshKey]);
  useEffect(() => {
    setReport(null); setEdit(null);
    if (open && open.status !== "pending") api(`/inspections/${open.id}/report`).then(setReport).catch(() => {});
    const esc = (e) => e.key === "Escape" && setOpen(null);
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [open]);

  async function remove() {
    if (!window.confirm(`Delete inspection #${open.id}? This cannot be undone.`)) return;
    try { await api(`/inspections/${open.id}`, { method: "DELETE" }); notify("Inspection deleted."); setOpen(null); onChange(); }
    catch (e) { notify(e.message, "err"); }
  }
  async function saveEdit() {
    const changed = JSON.stringify(edit.dets) !== JSON.stringify(open.ai_results.detections);
    try {
      const r = await api(`/inspections/${open.id}/review`, { method: "PUT", json: { decision: changed ? "corrected" : "confirmed", detections: edit.dets, notes: edit.notes } });
      setOpen(r); notify("Inspection updated."); onChange();
    } catch (e) { notify(e.message, "err"); }
  }
  const classes = ["Hole", "Knot", "Stain", ...(edit ? edit.dets.map((d) => d.class) : [])];

  const shown = rows.filter((r) => (st === "all" || r.status === st) && `${r.id} ${r.inspector}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <section>
      <h2>{role === "designer" ? "Fabric gallery" : "History"}</h2>
      <div className="filters">
        <input placeholder="Search by ID or inspector" value={q} onChange={(e) => setQ(e.target.value)} />
        <select value={st} onChange={(e) => setSt(e.target.value)}>
          {["all", "pending", "confirmed", "corrected"].map((x) => <option key={x}>{x}</option>)}</select>
      </div>
      <div className="grid">
        {shown.map((r) => (
          <button key={r.id} className="tile" onClick={() => setOpen(r)}>
            <img src={r.image} alt="" />
            <span><b>#{r.id}</b> · score {r.quality_score}<span className={`chip ${r.status}`}>{r.status}</span></span>
            <small>{r.inspector} · {new Date(r.created_at + "Z").toLocaleDateString()}</small>
          </button>
        ))}
      </div>
      {!shown.length && <p>Nothing to show yet.</p>}
      {open && (
        <div className="modal" onClick={() => setOpen(null)}>
          <div className="panel" onClick={(e) => e.stopPropagation()}>
            <Frame src={open.image} dets={edit ? edit.dets : open.reviewed_results ?? open.ai_results.detections} w={open.ai_results.width} h={open.ai_results.height} hover={hover} setHover={setHover} />
            <h3>Inspection #{open.id} <span className={`chip ${open.status}`}>{open.status}</span></h3>
            <p>Inspector: {open.inspector} · Score: {open.quality_score}</p>
            {report ? <><p>Notes: {report.notes || "none"}</p><small>{report.disclaimer}</small></> : open.status === "pending" && <p>Not reviewed yet.</p>}
            {edit ? (
              <>
                <ul className="dets">
                  {edit.dets.map((d, i) => (
                    <li key={i}>
                      <select value={d.class} onChange={(e) => setEdit({ ...edit, dets: edit.dets.map((x, j) => (j === i ? { ...x, class: e.target.value } : x)) })}>
                        {[...new Set(classes)].map((c) => <option key={c}>{c}</option>)}</select>
                      <em>{Math.round(d.confidence * 100)}%</em>
                      <button className="link" onClick={() => setEdit({ ...edit, dets: edit.dets.filter((_, j) => j !== i) })}>Remove</button>
                    </li>
                  ))}
                  {!edit.dets.length && <li>No defects listed.</li>}
                </ul>
                <label>Notes<textarea value={edit.notes} onChange={(e) => setEdit({ ...edit, notes: e.target.value })} /></label>
                <div><button onClick={saveEdit}>Save changes</button> <button className="ghost" onClick={() => setEdit(null)}>Cancel</button></div>
              </>
            ) : (
              <div>
                <button onClick={() => window.print()} disabled={!report}>Print report</button>{" "}
                {role === "inspector" && <button className="ghost" onClick={() => setEdit({ dets: open.reviewed_results ?? open.ai_results.detections, notes: open.notes || "" })}>Edit</button>}{" "}
                {(role === "inspector" || role === "admin") && <button className="danger" onClick={remove}>Delete</button>}{" "}
                <button className="ghost" onClick={() => setOpen(null)}>Close</button>
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

function Users({ me, notify }) {
  const [rows, setRows] = useState([]);
  const load = () => api("/admin/users").then(setRows).catch((e) => notify(e.message, "err"));
  useEffect(() => { load(); }, []);
  const patch = async (u, body) => {
    try { await api(`/admin/users/${u.id}`, { method: "PATCH", json: body }); notify(`Updated ${u.name}.`); load(); }
    catch (e) { notify(e.message, "err"); }
  };
  return (
    <section>
      <h2>Users</h2>
      <table>
        <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th></th></tr></thead>
        <tbody>
          {rows.map((u) => (
            <tr key={u.id}><td>{u.name}</td><td>{u.email}</td>
              <td><select value={u.role} disabled={u.id === me.id} onChange={(e) => patch(u, { role: e.target.value })}>
                {["inspector", "manager", "designer", "admin"].map((r) => <option key={r}>{r}</option>)}</select></td>
              <td><span className={`chip ${u.status}`}>{u.status}</span></td>
              <td>{u.id !== me.id && (u.status === "pending" ? <button onClick={() => patch(u, { status: "active" })}>Approve</button>
                : u.status === "active" ? <button className="ghost" onClick={() => patch(u, { status: "disabled" })}>Disable</button>
                : <button onClick={() => patch(u, { status: "active" })}>Enable</button>)}</td></tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

export default function App() {
  const [user, setUser] = useState(() => JSON.parse(sessionStorage.getItem("user") || "null"));
  const [path, setPath] = useState(window.location.pathname);
  const [key, setKey] = useState(0);
  const [toasts, setToasts] = useState([]);

  const notify = (text, kind = "ok") => {
    const id = Math.random();
    setToasts((t) => [...t, { id, text, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4500);
  };
  const go = (to, replace = false) => { window.history[replace ? "replaceState" : "pushState"]({}, "", to); setPath(to); };
  const logout = () => { setToken(null); sessionStorage.removeItem("user"); setUser(null); go("/login"); };

  useEffect(() => {
    const onPop = () => setPath(window.location.pathname);
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const page = path.slice(1);
  const allowed = user ? NAV[user.role].map((n) => n[0]) : [];
  useEffect(() => {
    if (!user && path !== "/login" && path !== "/register") go("/login", true);
    else if (user && !allowed.includes(page)) go(home(user.role), true);
  }, [user, path]);

  const toastBox = <div className="toasts" aria-live="polite">{toasts.map((t) => <p key={t.id} className={`toast ${t.kind}`}>{t.text}</p>)}</div>;
  if (!user) {
    return <>{toastBox}<Auth mode={path === "/register" ? "register" : "login"} go={go} notify={notify}
      onLogin={(u) => { sessionStorage.setItem("user", JSON.stringify(u)); setUser(u); go(home(u.role)); }} /></>;
  }
  return (
    <div className="shell">
      {toastBox}
      <aside>
        <strong>FabricIQ</strong>
        <nav>{NAV[user.role].map(([k, label]) => <button key={k} className={page === k ? "on" : ""} onClick={() => go("/" + k)}>{label}</button>)}</nav>
        <div className="me"><b>{user.name}</b><small>{user.role}</small><button className="link" onClick={logout}>Log out</button></div>
      </aside>
      <main>
        {page === "inspect" && <Inspect notify={notify} onSaved={() => setKey(key + 1)} />}
        {page === "history" && <History refreshKey={key} role={user.role} notify={notify} onChange={() => setKey(key + 1)} />}
        {page === "dashboard" && <Dashboard refreshKey={key} />}
        {page === "users" && <Users me={user} notify={notify} />}
      </main>
    </div>
  );
}
