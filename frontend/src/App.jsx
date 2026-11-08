import { useEffect, useRef, useState } from "react";
import { api, setToken } from "./api.js";
import { Icon, Logo } from "./icons.jsx";
import { ThemeToggle, ScoreRing, Frame, DetList, DrawTools, Chip, ago, useClassList } from "./ui.jsx";

const ROLES = {
  inspector: ["Quality Inspector", "Upload fabric, review AI-detected defects, save inspection records."],
  manager: ["Production Manager", "Monitor defect statistics and review inspection reports."],
  designer: ["Fabric Designer", "Browse reviewed fabric analysis to support design planning."],
};
const ROLE_LABEL = { ...Object.fromEntries(Object.entries(ROLES).map(([k, v]) => [k, v[0]])), admin: "Administrator" };
const PERMS = {
  inspector: ["Upload images or capture with a live camera", "Review and correct AI findings", "Edit or delete your own inspections"],
  manager: ["View all inspections and reports", "Monitor defect statistics", "Read-only access"],
  designer: ["Browse reviewed fabric analysis", "View dashboard statistics", "Read-only access"],
  admin: ["Approve, disable and re-role users", "View and delete any inspection", "Full read access"],
};
const NAV = {
  inspector: [["inspect", "Workspace", "scan"], ["history", "History", "history"], ["dashboard", "Dashboard", "dashboard"]],
  manager: [["dashboard", "Dashboard", "dashboard"], ["history", "History", "history"]],
  designer: [["history", "Fabric gallery", "layers"], ["dashboard", "Dashboard", "dashboard"]],
  admin: [["dashboard", "Dashboard", "dashboard"], ["history", "History", "history"], ["users", "Users", "users"]],
};
const TITLES = { inspect: "Inspection workspace", history: "Inspection history", dashboard: "Dashboard", users: "User management", profile: "Profile" };
const home = (role) => (role === "inspector" ? "/inspect" : "/dashboard");
const strength = (p) => [p.length >= 8, /[A-Z]/.test(p), /\d/.test(p), /[^A-Za-z0-9]/.test(p)].filter(Boolean).length;
const initials = (n) => n.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();

/* ---------- Auth ---------- */
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
        onLogin(r.user, f.email);
      }
    } catch (err) { setMsg(err.message); }
    setBusy(false);
  }

  return (
    <div className="auth-wrap">
      <section className="brand">
        <div className="brand-top"><Logo /><span>FabricIQ</span></div>
        <div className="vframe" aria-hidden="true"><i className="b1" /><i className="b2" /><i className="b3" /><span className="scanline" /></div>
        <h2>See every thread.<br />Trust every inspection.</h2>
        <p>AI-assisted fabric inspection with human review built in.</p>
      </section>
      <section className="formside">
        <div className="ftop"><ThemeToggle /></div>
        <form onSubmit={submit}>
          <h1>{reg ? "Create your account" : "Welcome back"}</h1>
          <p className="sub">{reg ? "Choose the role that matches your work." : "Log in to your inspection workspace."}</p>
          {reg && (
            <>
              <fieldset className="roles"><legend>I am a…</legend>
                {Object.entries(ROLES).map(([k, [t, d]]) => (
                  <label key={k} className={f.role === k ? "rcard on" : "rcard"}>
                    <input type="radio" name="role" checked={f.role === k} onChange={() => setF({ ...f, role: k })} />
                    <b>{t}</b><span>{d}</span>
                  </label>
                ))}
              </fieldset>
              {f.role !== "inspector" && <p className="note">This role needs admin approval before you can log in.</p>}
              <label>Full name<input value={f.name} onChange={set("name")} required minLength={2} autoComplete="name" /></label>
            </>
          )}
          <label>Email<input type="email" value={f.email} onChange={set("email")} required autoComplete="email" /></label>
          <label>Password
            <span className="pw"><input type={show ? "text" : "password"} value={f.password} onChange={set("password")} required autoComplete={reg ? "new-password" : "current-password"} />
              <button type="button" className="btn ghost sm" onClick={() => setShow(!show)}>{show ? "Hide" : "Show"}</button></span>
          </label>
          {reg && (
            <>
              <div className="meter">{[1, 2, 3, 4].map((n) => <i key={n} className={strength(f.password) >= n ? `s${strength(f.password)}` : ""} />)}</div>
              <small className="hint">8+ characters with letters and numbers. Capitals and symbols make it stronger.</small>
              <label>Confirm password<input type={show ? "text" : "password"} value={f.confirm} onChange={set("confirm")} required autoComplete="new-password" /></label>
            </>
          )}
          {msg && <p className="msg" role="alert">{msg}</p>}
          <button className="btn wide" disabled={busy}>{busy ? "Please wait…" : reg ? "Create account" : "Log in"}</button>
          <button type="button" className="lnk" onClick={() => { go(reg ? "/login" : "/register"); setMsg(""); }}>
            {reg ? "Have an account? Log in" : "Need an account? Register"}
          </button>
        </form>
      </section>
    </div>
  );
}

/* ---------- Workspace ---------- */
function Camera({ onCapture, onClose }) {
  const v = useRef();
  const [facing, setFacing] = useState("environment");
  const [live, setLive] = useState(false);
  const [dets, setDets] = useState([]);
  const [dim, setDim] = useState({ w: 1, h: 1 });
  const [info, setInfo] = useState("");
  const [err, setErr] = useState("");

  useEffect(() => {
    let s, dead = false;
    navigator.mediaDevices?.getUserMedia({ video: { facingMode: { ideal: facing } } })
      .then((st) => { if (dead) return st.getTracks().forEach((t) => t.stop()); s = st; v.current.srcObject = st; })
      .catch(() => onClose("Camera access was denied or no camera was found. On a phone, open the site over HTTPS."));
    return () => { dead = true; s?.getTracks().forEach((t) => t.stop()); };
  }, [facing]);

  // live detection: send a small frame, wait for the answer, then send the next one
  useEffect(() => {
    if (!live) { setDets([]); setInfo(""); return; }
    let stop = false;
    setErr("");
    const tick = async () => {
      const vid = v.current;
      if (stop) return;
      if (vid && vid.videoWidth) {
        const sc = Math.min(1, 640 / vid.videoWidth);
        const c = document.createElement("canvas");
        c.width = vid.videoWidth * sc; c.height = vid.videoHeight * sc;
        c.getContext("2d").drawImage(vid, 0, 0, c.width, c.height);
        const blob = await new Promise((r) => c.toBlob(r, "image/jpeg", 0.8));
        const form = new FormData(); form.append("file", new File([blob], "frame.jpg", { type: "image/jpeg" }));
        const t0 = performance.now();
        try {
          const r = await api("/inspections/predict", { method: "POST", form });
          if (!r.model_loaded) { if (!stop) { setErr(`Live detect needs the AI model: ${r.model_error || "not loaded"}`); setLive(false); } return; }
          if (!stop) {
            setDets(r.detections); setDim({ w: r.width, h: r.height });
            setInfo(`${r.detections.length} defect(s) · ${Math.round(performance.now() - t0)} ms${r.model_loaded ? "" : " · no model loaded"}`);
          }
        } catch (e) { if (!stop) { setErr(e.message); setLive(false); } return; }
      }
      if (!stop) setTimeout(tick, 250);
    };
    tick();
    return () => { stop = true; };
  }, [live]);

  const snap = () => {
    const c = document.createElement("canvas");
    c.width = v.current.videoWidth; c.height = v.current.videoHeight;
    c.getContext("2d").drawImage(v.current, 0, 0);
    c.toBlob((b) => onCapture(new File([b], "capture.jpg", { type: "image/jpeg" })), "image/jpeg", 0.92);
  };
  return (
    <div className="cam">
      <div className="camview">
        <video ref={v} autoPlay playsInline muted />
        {live && info && <span className="live-info">{info}</span>}
        {err && <span className="live-info err">{err}</span>}
        {dets.map((d, i) => {
          const [x1, y1, x2, y2] = d.box;
          return <span key={i} className="box" style={{ left: `${(x1 / dim.w) * 100}%`, top: `${(y1 / dim.h) * 100}%`, width: `${((x2 - x1) / dim.w) * 100}%`, height: `${((y2 - y1) / dim.h) * 100}%` }}><em>{d.class} {Math.round(d.confidence * 100)}%</em></span>;
        })}
      </div>
      <div className="cam-bar">
        <button className="btn" onClick={snap}><Icon n="camera" />Capture and analyze</button>
        <button className={live ? "btn" : "btn ghost dark"} onClick={() => setLive(!live)}><Icon n="pulse" />{live ? "Live detect: on" : "Live detect"}</button>
        <button className="btn ghost dark" onClick={() => setFacing(facing === "environment" ? "user" : "environment")}>Flip camera</button>
        <button className="btn ghost dark" onClick={() => onClose()}>Cancel</button>
      </div>
    </div>
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
  const [draw, setDraw] = useState(false);
  const [newCls, setNewCls] = useState("");
  const list = useClassList(dets);
  const drawCls = list.includes(newCls) ? newCls : list[0];

  async function run(file) {
    if (!file) return;
    setBusy(true); setCam(false);
    const form = new FormData(); form.append("file", file);
    try {
      const r = await api("/inspections/analyze", { method: "POST", form });
      setRes(r); setDets(r.ai_results.detections); setNotes(""); setDraw(false);
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
  const reset = () => { setRes(null); setDets([]); setNotes(""); setDraw(false); };
  const a = res?.ai_results;
  const pending = res?.status === "pending";

  return (
    <div className="ws">
      <section className="stage">
        <div className="stage-bar">
          <label className="btn sm"><Icon n="upload" size={16} />Upload image
            <input type="file" accept="image/jpeg,image/png" hidden disabled={busy} onChange={(e) => { run(e.target.files[0]); e.target.value = ""; }} /></label>
          <button className="btn ghost dark sm" onClick={() => setCam(true)} disabled={busy || cam}><Icon n="camera" size={16} />Live camera</button>
          {res && <button className="btn ghost dark sm" onClick={reset}>New scan</button>}
          <span className="stage-meta">{res ? `#${res.id} · ${a.width}×${a.height}px` : "Ready"}</span>
        </div>
        <div className="canvas" onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
          onDrop={(e) => { e.preventDefault(); setDrag(false); run(e.dataTransfer.files[0]); }}>
          {cam ? <Camera onCapture={run} onClose={(m) => { setCam(false); m && notify(m, "err"); }} />
            : res ? <Frame src={res.image} dets={dets} w={a.width} h={a.height} hover={hover} setHover={setHover} scanning={busy}
              draw={pending && draw} onDraw={(box) => setDets([...dets, { class: drawCls, confidence: 1, manual: true, box }])} />
            : <div className={drag ? "drop on" : "drop"}>
                {busy ? <><span className="orb" /><b>Analyzing fabric…</b></> : <><Icon n="scan" size={44} /><b>Drop a fabric image here</b><small>JPG or PNG, up to 5 MB, or use the live camera</small></>}
              </div>}
        </div>
      </section>
      <aside className="panel">
        <h2>Findings</h2>
        {!res ? <p className="muted">Detected defects, the visual score and your review controls will appear here after a scan.</p> : (
          <>
            <div className="score-row"><ScoreRing value={res.quality_score} size={116} />
              <div><b>Visual score</b><small>AI estimate, not a lab measurement</small><Chip s={res.status} /></div></div>
            {!a.model_loaded && <p className="note"><Icon n="alert" size={16} /> Automatic detection is unavailable{a.model_error ? ` (${a.model_error})` : ""}. You can still draw defects manually and save.</p>}
            {res.needs_review && <p className="note"><Icon n="alert" size={16} /> Human review required.</p>}
            {pending && <DrawTools draw={draw} setDraw={setDraw} cls={drawCls} setCls={setNewCls} list={list} />}
            <DetList dets={dets} onChange={setDets} editable={pending} hover={hover} setHover={setHover} />
            {pending && <button className="lnk" onClick={() => setDets(a.detections)}>Reset to AI result</button>}
            <label>Inspector notes<textarea value={notes} onChange={(e) => setNotes(e.target.value)} disabled={!pending} placeholder="Add context for this inspection" /></label>
            {pending && <button className="btn wide" onClick={save}><Icon n="check" size={16} />Confirm and save</button>}
          </>
        )}
      </aside>
    </div>
  );
}

/* ---------- Dashboard ---------- */
function Dashboard({ refreshKey, go }) {
  const [s, setS] = useState(null);
  const [rows, setRows] = useState([]);
  useEffect(() => {
    Promise.all([api("/inspections/stats"), api("/inspections")]).then(([a, b]) => { setS(a); setRows(b); }).catch(() => {});
  }, [refreshKey]);
  if (!s) return <div className="skel" />;

  const st = s.by_status, done = st.confirmed + st.corrected, total = Math.max(1, s.total);
  const rate = done ? Math.round((st.corrected / done) * 100) : null;
  const max = Math.max(1, ...Object.values(s.defects_by_class));
  const scores = rows.slice(0, 14).reverse().map((r) => r.quality_score);
  const pts = scores.map((v, i) => `${scores.length > 1 ? (i / (scores.length - 1)) * 100 : 50},${38 - (v / 100) * 36}`).join(" ");
  let off = 0;
  const kpis = [["Inspections", s.total, "layers"], ["Average score", s.avg_score ?? "–", "pulse"], ["Awaiting review", st.pending, "alert"], ["Correction rate", rate == null ? "–" : `${rate}%`, "edit"]];

  return (
    <div className="dash">
      <div className="kpis">
        {kpis.map(([l, v, ic]) => (
          <button key={l} className="kpi" onClick={() => go("/history")}><Icon n={ic} /><b>{v}</b><span>{l}</span></button>
        ))}
      </div>
      <section className="card"><h3>Quality score</h3>
        <div className="center"><ScoreRing value={s.avg_score} size={140} /></div>
        <p className="muted tc">Average across {s.total} inspection{s.total === 1 ? "" : "s"}</p></section>
      <section className="card"><h3>Review status</h3>
        <div className="donut-row">
          <svg viewBox="0 0 36 36" className="donut" role="img" aria-label="Review status breakdown">
            <circle r="15.9155" cx="18" cy="18" className="trk" />
            {[["confirmed", st.confirmed], ["corrected", st.corrected], ["pending", st.pending]].map(([k, v]) => {
              const p = (v / total) * 100;
              const el = <circle key={k} r="15.9155" cx="18" cy="18" className={k} strokeDasharray={`${p} ${100 - p}`} strokeDashoffset={-off} />;
              off += p; return el;
            })}
          </svg>
          <ul className="legend">{Object.entries(st).map(([k, v]) => <li key={k}><i className={k} />{k}<b>{v}</b></li>)}</ul>
        </div></section>
      <section className="card"><h3>Defects by type</h3>
        {Object.entries(s.defects_by_class).map(([k, v]) => <div className="bar" key={k}><span>{k}</span><i style={{ width: `${(v / max) * 100}%` }} /><b>{v}</b></div>)}
        {!Object.keys(s.defects_by_class).length && <p className="muted">No defects recorded yet.</p>}</section>
      <section className="card wide2"><h3>Score trend <small>last {scores.length || 0} inspections</small></h3>
        {scores.length > 1 ? <svg viewBox="0 0 100 40" className="spark" preserveAspectRatio="none"><polyline points={pts} /></svg> : <p className="muted">Needs at least two inspections.</p>}</section>
      <section className="card wide2"><h3>Recent activity</h3>
        <ul className="feed">
          {rows.slice(0, 6).map((r) => (
            <li key={r.id}><img src={r.image} alt="" /><span><b>#{r.id}</b> by {r.inspector}<small>{ago(r.created_at)}</small></span><Chip s={r.status} /></li>
          ))}
        </ul>
        {!rows.length && <p className="muted">No activity yet.</p>}</section>
    </div>
  );
}

/* ---------- History ---------- */
function History({ refreshKey, role, notify, onChange }) {
  const [rows, setRows] = useState([]);
  const [q, setQ] = useState("");
  const [st, setSt] = useState("all");
  const [open, setOpen] = useState(null);
  const [report, setReport] = useState(null);
  const [hover, setHover] = useState(null);
  const [edit, setEdit] = useState(null);
  const [draw, setDraw] = useState(false);
  const [newCls, setNewCls] = useState("");

  useEffect(() => { api("/inspections").then(setRows).catch(() => {}); }, [refreshKey]);
  useEffect(() => {
    setReport(null); setEdit(null); setDraw(false);
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

  const shown = rows.filter((r) => (st === "all" || r.status === st) && `${r.id} ${r.inspector}`.toLowerCase().includes(q.toLowerCase()));
  const dets = open ? (edit ? edit.dets : open.reviewed_results ?? open.ai_results.detections) : [];
  const list = useClassList(dets);
  const drawCls = list.includes(newCls) ? newCls : list[0];
  return (
    <section>
      <div className="filters">
        <label className="search"><Icon n="search" size={18} /><input placeholder="Search by ID or inspector" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search inspections" /></label>
        <div className="seg">{["all", "pending", "confirmed", "corrected"].map((x) => <button key={x} className={st === x ? "on" : ""} onClick={() => setSt(x)}>{x}</button>)}</div>
      </div>
      <div className="grid">
        {shown.map((r) => (
          <button key={r.id} className="tile" onClick={() => setOpen(r)}>
            <img src={r.image} alt="" />
            <span className="tile-top"><b>#{r.id}</b><Chip s={r.status} /></span>
            <span className="tile-meta"><ScoreRing value={r.quality_score} size={38} /><small>{r.inspector}<br />{ago(r.created_at)}</small></span>
          </button>
        ))}
      </div>
      {!shown.length && <p className="muted">Nothing to show yet.</p>}
      {open && (
        <div className="scrim" onClick={() => setOpen(null)}>
          <div className="drawer" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={`Inspection ${open.id}`}>
            <div className="d-head"><h3>Inspection #{open.id}</h3><Chip s={open.status} />
              <button className="icon-btn" onClick={() => setOpen(null)} aria-label="Close"><Icon n="x" /></button></div>
            <Frame src={open.image} dets={dets} w={open.ai_results.width} h={open.ai_results.height} hover={hover} setHover={setHover}
              draw={!!edit && draw} onDraw={(box) => setEdit({ ...edit, dets: [...edit.dets, { class: drawCls, confidence: 1, manual: true, box }] })} />
            <div className="score-row"><ScoreRing value={open.quality_score} size={84} /><div><b>{open.inspector}</b><small>{new Date(open.created_at + "Z").toLocaleString()}</small></div></div>
            {edit && <DrawTools draw={draw} setDraw={setDraw} cls={drawCls} setCls={setNewCls} list={list} />}
            <DetList dets={dets} onChange={(d) => setEdit({ ...edit, dets: d })} editable={!!edit} hover={hover} setHover={setHover} />
            {edit ? (
              <>
                <label>Notes<textarea value={edit.notes} onChange={(e) => setEdit({ ...edit, notes: e.target.value })} /></label>
                <div className="actions"><button className="btn" onClick={saveEdit}>Save changes</button><button className="btn ghost" onClick={() => setEdit(null)}>Cancel</button></div>
              </>
            ) : (
              <>
                {report ? <p className="muted">Notes: {report.notes || "none"}<br /><small>{report.disclaimer}</small></p> : open.status === "pending" && <p className="muted">Not reviewed yet.</p>}
                <div className="actions">
                  <button className="btn" onClick={() => window.print()} disabled={!report}><Icon n="printer" size={16} />Print report</button>
                  {role === "inspector" && <button className="btn ghost" onClick={() => setEdit({ dets: open.reviewed_results ?? open.ai_results.detections, notes: open.notes || "" })}><Icon n="edit" size={16} />Edit</button>}
                  {(role === "inspector" || role === "admin") && <button className="btn danger" onClick={remove}><Icon n="trash" size={16} />Delete</button>}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

/* ---------- Users (admin) ---------- */
function Users({ me, notify }) {
  const [rows, setRows] = useState([]);
  const load = () => api("/admin/users").then((r) => setRows(Array.isArray(r) ? r : [])).catch((e) => notify(e.message, "err"));
  useEffect(() => { load(); }, []);
  const patch = async (u, body) => {
    try { await api(`/admin/users/${u.id}`, { method: "PATCH", json: body }); notify(`Updated ${u.name}.`); load(); }
    catch (e) { notify(e.message, "err"); }
  };
  const waiting = rows.filter((u) => u.status === "pending").length;
  return (
    <section>
      {waiting > 0 && <p className="note"><Icon n="alert" size={16} /> {waiting} account{waiting === 1 ? " is" : "s are"} waiting for approval.</p>}
      <div className="card tbl">
        <table>
          <thead><tr><th>User</th><th>Role</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {rows.map((u) => (
              <tr key={u.id}>
                <td><span className="who"><span className="avatar">{initials(u.name)}</span><span><b>{u.name}</b><small>{u.email}</small></span></span></td>
                <td><select value={u.role} disabled={u.id === me.id} onChange={(e) => patch(u, { role: e.target.value })}>
                  {["inspector", "manager", "designer", "admin"].map((r) => <option key={r}>{r}</option>)}</select></td>
                <td><Chip s={u.status} /></td>
                <td className="ra">{u.id !== me.id && (u.status === "pending" ? <button className="btn sm" onClick={() => patch(u, { status: "active" })}>Approve</button>
                  : u.status === "active" ? <button className="btn ghost sm" onClick={() => patch(u, { status: "disabled" })}>Disable</button>
                  : <button className="btn sm" onClick={() => patch(u, { status: "active" })}>Enable</button>)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/* ---------- Profile ---------- */
function Profile({ user, logout }) {
  const [s, setS] = useState(null);
  useEffect(() => { api("/inspections/stats").then(setS).catch(() => {}); }, []);
  return (
    <div className="profile">
      <section className="card idcard"><div className="avatar lg">{initials(user.name)}</div>
        <h2>{user.name}</h2><p className="muted">{user.email || "Signed in"}</p><span className="chip role">{ROLE_LABEL[user.role]}</span></section>
      <section className="card"><h3>Your access</h3>
        <ul className="perms">{PERMS[user.role].map((p) => <li key={p}><Icon n="check" size={16} />{p}</li>)}</ul></section>
      <section className="card"><h3>Your activity</h3>
        {s ? <div className="mini">{[["Inspections", s.total], ["Avg score", s.avg_score ?? "–"], ["Pending", s.by_status.pending]].map(([l, v]) => <div key={l}><b>{v}</b><span>{l}</span></div>)}</div> : <p className="muted">Loading…</p>}</section>
      <section className="card"><h3>Appearance</h3><p className="muted">Switch between light and dark mode. Your choice is remembered on this device.</p><ThemeToggle /></section>
      <button className="btn danger" onClick={logout}><Icon n="logout" size={16} />Log out</button>
    </div>
  );
}

/* ---------- Shell ---------- */
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
  const go = (to, replace = false) => { window.history[replace ? "replaceState" : "pushState"]({}, "", to); setPath(to); window.scrollTo(0, 0); };
  const logout = () => { setToken(null); sessionStorage.removeItem("user"); setUser(null); go("/login"); };

  useEffect(() => {
    const onPop = () => setPath(window.location.pathname);
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const page = path.slice(1);
  const allowed = user ? [...NAV[user.role].map((n) => n[0]), "profile"] : [];
  useEffect(() => {
    if (!user && path !== "/login" && path !== "/register") go("/login", true);
    else if (user && !allowed.includes(page)) go(home(user.role), true);
  }, [user, path]);

  const toastBox = <div className="toasts" aria-live="polite">{toasts.map((t) => <p key={t.id} className={`toast ${t.kind}`}>{t.text}</p>)}</div>;
  if (!user) {
    return <>{toastBox}<Auth mode={path === "/register" ? "register" : "login"} go={go} notify={notify}
      onLogin={(u, email) => { const full = { ...u, email }; sessionStorage.setItem("user", JSON.stringify(full)); setUser(full); go(home(u.role)); }} /></>;
  }
  const items = NAV[user.role];
  return (
    <div className="app">
      {toastBox}
      <aside className="rail">
        <div className="brand-top"><Logo /><span>FabricIQ</span></div>
        <nav>{items.map(([k, label, ic]) => <button key={k} className={page === k ? "on" : ""} onClick={() => go("/" + k)}><Icon n={ic} />{label}</button>)}</nav>
        <button className={page === "profile" ? "me on" : "me"} onClick={() => go("/profile")}>
          <span className="avatar">{initials(user.name)}</span><span><b>{user.name}</b><small>{ROLE_LABEL[user.role]}</small></span></button>
        <button className="lo" onClick={logout}><Icon n="logout" />Log out</button>
      </aside>
      <div className="main">
        <header className="top">
          <div><small>FabricIQ / {user.role}</small><h1>{TITLES[page]}</h1></div>
          <div className="tools"><ThemeToggle /><button className="avatar" onClick={() => go("/profile")} aria-label="Open profile">{initials(user.name)}</button></div>
        </header>
        <main className="page" key={page}>
          {page === "inspect" && <Inspect notify={notify} onSaved={() => setKey(key + 1)} />}
          {page === "history" && <History refreshKey={key} role={user.role} notify={notify} onChange={() => setKey(key + 1)} />}
          {page === "dashboard" && <Dashboard refreshKey={key} go={go} />}
          {page === "users" && <Users me={user} notify={notify} />}
          {page === "profile" && <Profile user={user} logout={logout} />}
        </main>
      </div>
      <nav className="tabs">{[...items, ["profile", "Profile", "user"]].map(([k, label, ic]) => <button key={k} className={page === k ? "on" : ""} onClick={() => go("/" + k)}><Icon n={ic} /><span>{label}</span></button>)}</nav>
    </div>
  );
}
