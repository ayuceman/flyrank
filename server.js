// server.js — Tasks CRUD API (Week 3: now backed by SQLite instead of an array)
const express = require("express");
const db = require("./db"); // opening db.js creates tasks.db + seeds it on first run

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

app.get("/", (req, res) => {
  res.json({ message: "Tasks API — Week 3, backed by SQLite" });
});

app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// SQLite stores booleans as 0/1. Convert to real true/false for the client so
// the JSON looks exactly like it did when tasks lived in an array.
function toTask(row) {
  return { id: row.id, title: row.title, done: row.done === 1 };
}

// Parse the :id route param. Returns null for anything that isn't a positive integer.
function parseId(raw) {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

// Prepared statements are compiled once and reused — faster and safe from SQL injection.
const stmts = {
  all: db.prepare("SELECT id, title, done FROM tasks ORDER BY id"),
  byId: db.prepare("SELECT id, title, done FROM tasks WHERE id = ?"),
  insert: db.prepare("INSERT INTO tasks (title, done) VALUES (?, ?)"),
};

// Validate a request body. Returns an error message, or null if valid.
// `partial` = true for PUT, where fields are optional but must be the right type.
function validateBody(body, { partial = false } = {}) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return "Request body must be a JSON object";
  }
  const hasTitle = body.title !== undefined;
  const hasDone = body.done !== undefined;

  if (!partial && !hasTitle) return "title is required";
  if (hasTitle && (typeof body.title !== "string" || body.title.trim() === "")) {
    return "title must be a non-empty string";
  }
  if (hasDone && typeof body.done !== "boolean") return "done must be a boolean";
  if (partial && !hasTitle && !hasDone) return "Provide at least one of: title, done";
  return null;
}

// ---------------------------------------------------------------------------
// Stage 1 — Read
// ---------------------------------------------------------------------------

// GET /tasks — every task in the database
app.get("/tasks", (req, res) => {
  const rows = stmts.all.all();
  res.json(rows.map(toTask));
});

// GET /tasks/:id — one task, or 404
app.get("/tasks/:id", (req, res) => {
  const id = parseId(req.params.id);
  const row = id === null ? undefined : stmts.byId.get(id);
  if (!row) return res.status(404).json({ error: "Task not found" });
  res.json(toTask(row));
});

// ---------------------------------------------------------------------------
// Stage 2 — Create
// ---------------------------------------------------------------------------

// POST /tasks — insert a row; 400 on invalid body, 201 with the new task
app.post("/tasks", (req, res) => {
  const error = validateBody(req.body);
  if (error) return res.status(400).json({ error });

  const title = req.body.title.trim();
  const done = req.body.done === true ? 1 : 0;

  const result = stmts.insert.run(title, done);
  const row = stmts.byId.get(result.lastInsertRowid);
  res.status(201).json(toTask(row));
});

// Malformed JSON bodies -> 400 with a JSON error (instead of Express's HTML page)
app.use((err, req, res, next) => {
  if (err.type === "entity.parse.failed") {
    return res.status(400).json({ error: "Invalid JSON body" });
  }
  next(err);
});

app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});

module.exports = app;
