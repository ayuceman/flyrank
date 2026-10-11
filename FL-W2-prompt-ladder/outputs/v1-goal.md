# v1 — layer added: a clearer goal

## Prompt

```
Build me a REST API for tasks with create, list, get one, update and delete, where the data survives a server restart.
```

## Output (Claude, fresh session, 2026-10-11)

Here's a complete, self-contained Tasks REST API in Node.js using Express and SQLite. The data is stored in a `tasks.db` file on disk, so it persists across restarts.

## Setup

```bash
mkdir tasks-api && cd tasks-api
npm init -y
npm install express better-sqlite3
```

## `server.js`

```js
const express = require("express");
const Database = require("better-sqlite3");
const path = require("path");

const app = express();
app.use(express.json());

// --- Database (file on disk => survives restarts) ---
const db = new Database(path.join(__dirname, "tasks.db"));
db.pragma("journal_mode = WAL");
db.exec(`
  CREATE TABLE IF NOT EXISTS tasks (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    title       TEXT    NOT NULL,
    description TEXT    NOT NULL DEFAULT '',
    completed   INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
    updated_at  TEXT    NOT NULL DEFAULT (datetime('now'))
  )
`);

const stmts = {
  insert: db.prepare(
    "INSERT INTO tasks (title, description, completed) VALUES (?, ?, ?)"
  ),
  all: db.prepare("SELECT * FROM tasks ORDER BY id"),
  byId: db.prepare("SELECT * FROM tasks WHERE id = ?"),
  update: db.prepare(`
    UPDATE tasks
    SET title = ?, description = ?, completed = ?, updated_at = datetime('now')
    WHERE id = ?
  `),
  delete: db.prepare("DELETE FROM tasks WHERE id = ?"),
};

const toTask = (row) => row && { ...row, completed: Boolean(row.completed) };

// --- Validation helper ---
function validate(body, { partial = false } = {}) {
  const errors = [];
  if (!partial || body.title !== undefined) {
    if (typeof body.title !== "string" || body.title.trim() === "")
      errors.push("title must be a non-empty string");
  }
  if (body.description !== undefined && typeof body.description !== "string")
    errors.push("description must be a string");
  if (body.completed !== undefined && typeof body.completed !== "boolean")
    errors.push("completed must be a boolean");
  return errors;
}

// --- Routes ---

// Create
app.post("/tasks", (req, res) => {
  const errors = validate(req.body);
  if (errors.length) return res.status(400).json({ errors });

  const { title, description = "", completed = false } = req.body;
  const { lastInsertRowid } = stmts.insert.run(title.trim(), description, completed ? 1 : 0);
  res.status(201).json(toTask(stmts.byId.get(lastInsertRowid)));
});

// List
app.get("/tasks", (req, res) => {
  res.json(stmts.all.all().map(toTask));
});

// Get one
app.get("/tasks/:id", (req, res) => {
  const task = stmts.byId.get(req.params.id);
  if (!task) return res.status(404).json({ error: "Task not found" });
  res.json(toTask(task));
});

// Update (PUT = full replace, PATCH = partial)
function update(partial) {
  return (req, res) => {
    const existing = stmts.byId.get(req.params.id);
    if (!existing) return res.status(404).json({ error: "Task not found" });

    const errors = validate(req.body, { partial });
    if (errors.length) return res.status(400).json({ errors });

    const merged = partial
      ? { ...toTask(existing), ...req.body }
      : { description: "", completed: false, ...req.body };

    stmts.update.run(
      merged.title.trim(),
      merged.description,
      merged.completed ? 1 : 0,
      existing.id
    );
    res.json(toTask(stmts.byId.get(existing.id)));
  };
}
app.put("/tasks/:id", update(false));
app.patch("/tasks/:id", update(true));

// Delete
app.delete("/tasks/:id", (req, res) => {
  const { changes } = stmts.delete.run(req.params.id);
  if (!changes) return res.status(404).json({ error: "Task not found" });
  res.status(204).end();
});

// 404 + error handlers
app.use((req, res) => res.status(404).json({ error: "Route not found" }));
app.use((err, req, res, next) => {
  if (err.type === "entity.parse.failed")
    return res.status(400).json({ error: "Invalid JSON body" });
  console.error(err);
  res.status(500).json({ error: "Internal server error" });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Tasks API listening on http://localhost:${PORT}`));
```

## Run it

```bash
node server.js
```

## Endpoints

| Method | Path | Description | Success |
|---|---|---|---|
| `POST` | `/tasks` | Create a task | `201` + task |
| `GET` | `/tasks` | List all tasks | `200` + array |
| `GET` | `/tasks/:id` | Get one task | `200` + task |
| `PUT` | `/tasks/:id` | Replace a task (title required) | `200` + task |
| `PATCH` | `/tasks/:id` | Partially update a task | `200` + task |
| `DELETE` | `/tasks/:id` | Delete a task | `204` |

Errors: `400` for invalid input/JSON, `404` for unknown task.

## Try it

```bash
# create
curl -X POST localhost:3000/tasks -H "Content-Type: application/json" \
  -d '{"title":"Buy milk","description":"2 litres"}'

# list
curl localhost:3000/tasks

# get one
curl localhost:3000/tasks/1

# partial update
curl -X PATCH localhost:3000/tasks/1 -H "Content-Type: application/json" \
  -d '{"completed":true}'

# delete
curl -X DELETE localhost:3000/tasks/1 -i
```

## How persistence works

`better-sqlite3` writes to `tasks.db` next to `server.js`. Every insert/update/delete is committed to that file immediately, so if you stop the server (`Ctrl+C`) and start it again, `GET /tasks` returns exactly what you had. `CREATE TABLE IF NOT EXISTS` means the schema is created on first run and left alone afterwards. WAL mode gives better concurrent read performance and crash safety.

If you later want to move to Postgres or MySQL, only the `db`/`stmts` section needs to change; the routes stay the same.
