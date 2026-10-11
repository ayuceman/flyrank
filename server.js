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
  return {
    id: row.id,
    title: row.title,
    done: row.done === 1,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

// Parse the :id route param. Returns null for anything that isn't a positive integer.
function parseId(raw) {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

// Prepared statements are compiled once and reused — faster and safe from SQL injection.
const COLS = "id, title, done, created_at, updated_at";
const stmts = {
  byId: db.prepare(`SELECT ${COLS} FROM tasks WHERE id = ?`),
  insert: db.prepare(`
    INSERT INTO tasks (title, done, created_at, updated_at)
    VALUES (?, ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  `),
  update: db.prepare(
    "UPDATE tasks SET title = ?, done = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?"
  ),
  remove: db.prepare("DELETE FROM tasks WHERE id = ?"),
  stats: db.prepare(`
    SELECT COUNT(*)                                   AS total,
           COALESCE(SUM(done = 1), 0)                 AS done,
           COALESCE(SUM(done = 0), 0)                 AS pending
    FROM tasks
  `),
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

// GET /tasks — every task in the database.
// Optional extras (all done in SQL, not JavaScript):
//   ?search=milk   -> WHERE title LIKE '%milk%'
//   ?done=true     -> WHERE done = 1   (or ?done=false)
//   ?sort=title    -> ORDER BY title   (default: ORDER BY id)
app.get("/tasks", (req, res) => {
  const where = [];
  const params = [];

  if (typeof req.query.search === "string" && req.query.search.trim() !== "") {
    where.push("title LIKE ?");
    params.push(`%${req.query.search.trim()}%`);
  }

  if (req.query.done !== undefined) {
    if (req.query.done !== "true" && req.query.done !== "false") {
      return res.status(400).json({ error: "done must be true or false" });
    }
    where.push("done = ?");
    params.push(req.query.done === "true" ? 1 : 0);
  }

  let orderBy = "id";
  if (req.query.sort !== undefined) {
    if (req.query.sort !== "title" && req.query.sort !== "id") {
      return res.status(400).json({ error: "sort must be title or id" });
    }
    orderBy = req.query.sort === "title" ? "title COLLATE NOCASE" : "id";
  }

  const sql =
    `SELECT ${COLS} FROM tasks` +
    (where.length ? ` WHERE ${where.join(" AND ")}` : "") +
    ` ORDER BY ${orderBy}`;

  const rows = db.prepare(sql).all(...params);
  res.json(rows.map(toTask));
});

// GET /stats — counts computed by SQL's COUNT()/SUM(), not in JavaScript
app.get("/stats", (req, res) => {
  res.json(stmts.stats.get());
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

// ---------------------------------------------------------------------------
// Stage 3 — Update and delete
// ---------------------------------------------------------------------------

// PUT /tasks/:id — update title and/or done; 404 unknown id, 400 invalid body
app.put("/tasks/:id", (req, res) => {
  const id = parseId(req.params.id);
  const existing = id === null ? undefined : stmts.byId.get(id);
  if (!existing) return res.status(404).json({ error: "Task not found" });

  const error = validateBody(req.body, { partial: true });
  if (error) return res.status(400).json({ error });

  const title = req.body.title !== undefined ? req.body.title.trim() : existing.title;
  const done = req.body.done !== undefined ? (req.body.done ? 1 : 0) : existing.done;

  stmts.update.run(title, done, id);
  res.json(toTask(stmts.byId.get(id)));
});

// DELETE /tasks/:id — remove the row; 404 if it never existed
app.delete("/tasks/:id", (req, res) => {
  const id = parseId(req.params.id);
  const result = id === null ? { changes: 0 } : stmts.remove.run(id);
  if (result.changes === 0) return res.status(404).json({ error: "Task not found" });
  res.status(204).send();
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
