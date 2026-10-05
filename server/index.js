import express from "express";
import cors from "cors";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import pg from "pg";
import crypto from "crypto";
import path from "path";
import { fileURLToPath } from "url";

const SECRET = process.env.JWT_SECRET;
if (!SECRET && process.env.NODE_ENV === "production") { console.error("Set JWT_SECRET."); process.exit(1); }
const secret = SECRET || "dev-only-secret";

// Local Postgres: DATABASE_URL=postgres://localhost/calendar  |  Hosted (Neon, Render, etc.): paste their URL
const url = process.env.DATABASE_URL || "postgres://localhost/calendar";
const local = /localhost|127\.0\.0\.1/.test(url);
const db = new pg.Pool({ connectionString: url, ssl: local ? false : { rejectUnauthorized: false } });

await db.query(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY, username TEXT NOT NULL, hash TEXT NOT NULL);
  CREATE UNIQUE INDEX IF NOT EXISTS users_username_idx ON users (lower(username));
  CREATE TABLE IF NOT EXISTS events (
    id TEXT PRIMARY KEY, title TEXT NOT NULL, date TEXT NOT NULL, time TEXT DEFAULT '', notes TEXT DEFAULT '',
    user_id TEXT NOT NULL REFERENCES users(id), author TEXT NOT NULL, created_at TIMESTAMPTZ DEFAULT now());
`);

const app = express();
app.use(cors());
app.use(express.json());

const sign = (u) => jwt.sign({ id: u.id, name: u.username }, secret, { expiresIn: "7d" });
const wrap = (fn) => (req, res) => fn(req, res).catch((e) => { console.error(e); res.status(500).json({ error: "Server error." }); });

function requireAuth(req, res, next) {
  const token = (req.headers.authorization || "").replace("Bearer ", "");
  try { req.user = jwt.verify(token, secret); next(); }
  catch { res.status(401).json({ error: "Log in to do that." }); }
}

app.post("/api/register", wrap(async (req, res) => {
  const { username, password } = req.body;
  if (!username?.trim() || !password || password.length < 6)
    return res.status(400).json({ error: "Enter a username and a password of 6+ characters." });
  const user = { id: crypto.randomUUID(), username: username.trim(), hash: await bcrypt.hash(password, 10) };
  try { await db.query("INSERT INTO users (id, username, hash) VALUES ($1,$2,$3)", [user.id, user.username, user.hash]); }
  catch (e) { if (e.code === "23505") return res.status(409).json({ error: "That username is taken." }); throw e; }
  res.json({ token: sign(user), name: user.username });
}));

app.post("/api/login", wrap(async (req, res) => {
  const { username = "", password = "" } = req.body;
  const { rows } = await db.query("SELECT * FROM users WHERE lower(username) = lower($1)", [username.trim()]);
  const user = rows[0];
  if (!user || !(await bcrypt.compare(password, user.hash)))
    return res.status(401).json({ error: "Wrong username or password." });
  res.json({ token: sign(user), name: user.username });
}));

// Public: anyone can read events
app.get("/api/events", wrap(async (req, res) => {
  const { rows } = await db.query("SELECT id, title, date, time, notes, author FROM events ORDER BY date, time");
  res.json(rows);
}));

// Logged-in users only
app.post("/api/events", requireAuth, wrap(async (req, res) => {
  const { title, date, time = "", notes = "" } = req.body;
  if (!title?.trim() || !/^\d{4}-\d{2}-\d{2}$/.test(date || ""))
    return res.status(400).json({ error: "An event needs a title and a date." });
  const { rows } = await db.query(
    "INSERT INTO events (id, title, date, time, notes, user_id, author) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id, title, date, time, notes, author",
    [crypto.randomUUID(), title.trim(), date, time, notes, req.user.id, req.user.name]);
  res.json(rows[0]);
}));

app.delete("/api/events/:id", requireAuth, wrap(async (req, res) => {
  const { rows } = await db.query("SELECT user_id FROM events WHERE id = $1", [req.params.id]);
  if (!rows[0]) return res.status(404).json({ error: "Event not found." });
  if (rows[0].user_id !== req.user.id) return res.status(403).json({ error: "You can only delete your own events." });
  await db.query("DELETE FROM events WHERE id = $1", [req.params.id]);
  res.json({ ok: true });
}));

// Serve the built React site in production
const dist = path.join(path.dirname(fileURLToPath(import.meta.url)), "../client/dist");
app.use(express.static(dist));
app.get("*", (req, res) => res.sendFile(path.join(dist, "index.html")));

app.listen(process.env.PORT || 4000, () => console.log("Server running"));
