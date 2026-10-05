import { useEffect, useState } from "react";

const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

async function api(path, { method = "GET", body, token } = {}) {
  const res = await fetch(`/api${path}`, {
    method,
    headers: { "Content-Type": "application/json", ...(token && { Authorization: `Bearer ${token}` }) },
    body: body && JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Something went wrong.");
  return data;
}

export default function App() {
  const [auth, setAuth] = useState(() => JSON.parse(localStorage.getItem("auth") || "null"));
  const [events, setEvents] = useState([]);
  const [month, setMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [selected, setSelected] = useState(iso(new Date()));
  const [error, setError] = useState("");

  const load = () => api("/events").then(setEvents).catch((e) => setError(e.message));
  useEffect(() => { load(); }, []);

  const setSession = (s) => { setAuth(s); s ? localStorage.setItem("auth", JSON.stringify(s)) : localStorage.removeItem("auth"); };

  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const cells = [...Array(first.getDay()).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => iso(new Date(month.getFullYear(), month.getMonth(), i + 1)))];
  const byDate = events.reduce((m, e) => ((m[e.date] ||= []).push(e), m), {});
  const dayEvents = (byDate[selected] || []).sort((a, b) => a.time.localeCompare(b.time));
  const shift = (n) => setMonth(new Date(month.getFullYear(), month.getMonth() + n, 1));

  return (
    <div className="app">
      <header>
        <h1>{month.toLocaleString("default", { month: "long", year: "numeric" })}</h1>
        <div className="nav">
          <button onClick={() => shift(-1)} aria-label="Previous month">‹</button>
          <button onClick={() => { const n = new Date(); setMonth(new Date(n.getFullYear(), n.getMonth(), 1)); setSelected(iso(n)); }}>Today</button>
          <button onClick={() => shift(1)} aria-label="Next month">›</button>
        </div>
      </header>

      <main>
        <section className="grid" aria-label="Calendar">
          {DAYS.map((d) => <div key={d} className="dow">{d}</div>)}
          {cells.map((d, i) => d ? (
            <button key={d} className={`cell ${d === selected ? "sel" : ""} ${d === iso(new Date()) ? "today" : ""}`} onClick={() => setSelected(d)}>
              <span className="num">{+d.slice(8)}</span>
              {(byDate[d] || []).slice(0, 2).map((e) => <span key={e.id} className="chip">{e.title}</span>)}
              {(byDate[d] || []).length > 2 && <span className="more">+{byDate[d].length - 2} more</span>}
            </button>
          ) : <div key={`b${i}`} />)}
        </section>

        <aside>
          <h2>{new Date(selected + "T00:00").toLocaleDateString("default", { weekday: "long", month: "long", day: "numeric" })}</h2>
          {error && <p className="error">{error}</p>}
          {dayEvents.length === 0 && <p className="muted">No events on this day.</p>}
          <ul>
            {dayEvents.map((e) => (
              <li key={e.id}>
                <strong>{e.time && <time>{e.time} </time>}{e.title}</strong>
                {e.notes && <p>{e.notes}</p>}
                <small>Added by {e.author}</small>
                {auth && e.author === auth.name && (
                  <button className="link" onClick={() => api(`/events/${e.id}`, { method: "DELETE", token: auth.token }).then(load).catch((x) => setError(x.message))}>Delete</button>
                )}
              </li>
            ))}
          </ul>
          {auth ? <AddEvent date={selected} token={auth.token} onAdded={load} onError={setError} /> : <p className="muted">Log in to add events.</p>}
          <Account auth={auth} setSession={setSession} />
        </aside>
      </main>
    </div>
  );
}

function AddEvent({ date, token, onAdded, onError }) {
  const [f, setF] = useState({ title: "", time: "", notes: "" });
  const submit = async (e) => {
    e.preventDefault(); onError("");
    try { await api("/events", { method: "POST", token, body: { ...f, date } }); setF({ title: "", time: "", notes: "" }); onAdded(); }
    catch (err) { onError(err.message); }
  };
  return (
    <form onSubmit={submit}>
      <h3>Add an event</h3>
      <input placeholder="Title" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} required />
      <input type="time" value={f.time} onChange={(e) => setF({ ...f, time: e.target.value })} />
      <textarea placeholder="Notes (optional)" value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} />
      <button className="primary">Add event</button>
    </form>
  );
}

function Account({ auth, setSession }) {
  const [mode, setMode] = useState(null);
  const [f, setF] = useState({ username: "", password: "" });
  const [err, setErr] = useState("");
  if (auth) return <p className="account">Signed in as <b>{auth.name}</b> <button className="link" onClick={() => setSession(null)}>Log out</button></p>;
  const submit = async (e) => {
    e.preventDefault(); setErr("");
    try { const r = await api(`/${mode}`, { method: "POST", body: f }); setSession({ token: r.token, name: r.name }); }
    catch (x) { setErr(x.message); }
  };
  if (!mode) return <p className="account"><button className="primary" onClick={() => setMode("login")}>Log in</button> <button className="link" onClick={() => setMode("register")}>Create account</button></p>;
  return (
    <form onSubmit={submit} className="account">
      <h3>{mode === "login" ? "Log in" : "Create account"}</h3>
      <input placeholder="Username" value={f.username} onChange={(e) => setF({ ...f, username: e.target.value })} required />
      <input type="password" placeholder="Password (6+ characters)" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} required />
      {err && <p className="error">{err}</p>}
      <button className="primary">{mode === "login" ? "Log in" : "Create account"}</button>
      <button type="button" className="link" onClick={() => setMode(mode === "login" ? "register" : "login")}>{mode === "login" ? "Need an account?" : "Have an account?"}</button>
    </form>
  );
}
