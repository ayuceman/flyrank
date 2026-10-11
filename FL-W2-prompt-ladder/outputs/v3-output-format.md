# v3 — layer added: a specified output format

## Prompt

```
Build me a REST API for tasks with create, list, get one, update and delete, where the data survives a server restart.

Context: I'm on Node 22 with Express 4 and Postgres (the `pg` package), no ORM. I already have docker-compose running Postgres and a DATABASE_URL env var. The table already exists:
tasks(id SERIAL PRIMARY KEY, title TEXT NOT NULL, done BOOLEAN NOT NULL DEFAULT false, created_at TIMESTAMPTZ DEFAULT now(), updated_at TIMESTAMPTZ DEFAULT now()).
This is for a FlyRank internship assignment where the API shape must match an earlier in-memory version: same URLs, same JSON fields (id, title, done, created_at, updated_at).

Output format: give me only (1) a file tree, (2) each file in full in its own code block with the path as the first line, (3) a curl smoke test. No prose before, between or after the files.
```

## Output (Claude, fresh session, 2026-10-11)

```
tasks-api/
├── package.json
├── src/
│   ├── server.js
│   ├── app.js
│   ├── db.js
│   └── routes/
│       └── tasks.js
└── smoke.sh
```

```json
// package.json
{
  "name": "tasks-api",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "main": "src/server.js",
  "scripts": {
    "start": "node src/server.js",
    "dev": "node --watch src/server.js"
  },
  "engines": {
    "node": ">=22"
  },
  "dependencies": {
    "express": "^4.19.2",
    "pg": "^8.12.0"
  }
}
```

```js
// src/server.js
import { app } from "./app.js";
import { pool } from "./db.js";

const PORT = Number(process.env.PORT) || 3000;

const server = app.listen(PORT, () => {
  console.log(`tasks-api listening on http://localhost:${PORT}`);
});

async function shutdown(signal) {
  console.log(`${signal} received, shutting down`);
  server.close(async () => {
    await pool.end();
    process.exit(0);
  });
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
```

```js
// src/app.js
import express from "express";
import { tasksRouter } from "./routes/tasks.js";

export const app = express();

app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.use("/tasks", tasksRouter);

app.use((_req, res) => {
  res.status(404).json({ error: "Not found" });
});

app.use((err, _req, res, _next) => {
  if (err.type === "entity.parse.failed") {
    return res.status(400).json({ error: "Invalid JSON body" });
  }
  console.error(err);
  res.status(500).json({ error: "Internal server error" });
});
```

```js
// src/db.js
import pg from "pg";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set");
}

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

pool.on("error", (err) => {
  console.error("Unexpected error on idle Postgres client", err);
});

export const query = (text, params) => pool.query(text, params);
```

```js
// src/routes/tasks.js
import { Router } from "express";
import { query } from "../db.js";

export const tasksRouter = Router();

const COLUMNS = "id, title, done, created_at, updated_at";

function parseId(raw) {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function validateTitle(title, { required }) {
  if (title === undefined) {
    return required ? "title is required" : null;
  }
  if (typeof title !== "string" || title.trim().length === 0) {
    return "title must be a non-empty string";
  }
  return null;
}

function validateDone(done) {
  if (done === undefined) return null;
  if (typeof done !== "boolean") return "done must be a boolean";
  return null;
}

// Create
tasksRouter.post("/", async (req, res, next) => {
  try {
    const { title, done } = req.body ?? {};

    const titleError = validateTitle(title, { required: true });
    if (titleError) return res.status(400).json({ error: titleError });

    const doneError = validateDone(done);
    if (doneError) return res.status(400).json({ error: doneError });

    const { rows } = await query(
      `INSERT INTO tasks (title, done)
       VALUES ($1, $2)
       RETURNING ${COLUMNS}`,
      [title.trim(), done ?? false]
    );

    res.status(201).json(rows[0]);
  } catch (err) {
    next(err);
  }
});

// List
tasksRouter.get("/", async (_req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT ${COLUMNS} FROM tasks ORDER BY id ASC`
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// Get one
tasksRouter.get("/:id", async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    if (id === null) return res.status(400).json({ error: "Invalid id" });

    const { rows } = await query(
      `SELECT ${COLUMNS} FROM tasks WHERE id = $1`,
      [id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: "Task not found" });
    }

    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

// Update (partial: title and/or done)
tasksRouter.put("/:id", updateTask);
tasksRouter.patch("/:id", updateTask);

async function updateTask(req, res, next) {
  try {
    const id = parseId(req.params.id);
    if (id === null) return res.status(400).json({ error: "Invalid id" });

    const { title, done } = req.body ?? {};

    const titleError = validateTitle(title, { required: false });
    if (titleError) return res.status(400).json({ error: titleError });

    const doneError = validateDone(done);
    if (doneError) return res.status(400).json({ error: doneError });

    if (title === undefined && done === undefined) {
      return res
        .status(400)
        .json({ error: "Provide at least one of: title, done" });
    }

    const { rows } = await query(
      `UPDATE tasks
       SET title      = COALESCE($2, title),
           done       = COALESCE($3, done),
           updated_at = now()
       WHERE id = $1
       RETURNING ${COLUMNS}`,
      [id, title === undefined ? null : title.trim(), done ?? null]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: "Task not found" });
    }

    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
}

// Delete
tasksRouter.delete("/:id", async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    if (id === null) return res.status(400).json({ error: "Invalid id" });

    const { rowCount } = await query(`DELETE FROM tasks WHERE id = $1`, [id]);
    if (rowCount === 0) {
      return res.status(404).json({ error: "Task not found" });
    }

    res.status(204).end();
  } catch (err) {
    next(err);
  }
});
```

```bash
# smoke.sh
#!/usr/bin/env bash
set -euo pipefail

BASE="${BASE:-http://localhost:3000}"

echo "== health"
curl -s "$BASE/health"; echo

echo "== create"
CREATED=$(curl -s -X POST "$BASE/tasks" \
  -H "Content-Type: application/json" \
  -d '{"title":"Write FlyRank assignment"}')
echo "$CREATED"
ID=$(echo "$CREATED" | node -pe 'JSON.parse(require("fs").readFileSync(0,"utf8")).id')

echo "== create (validation error, expect 400)"
curl -s -X POST "$BASE/tasks" -H "Content-Type: application/json" -d '{}'; echo

echo "== list"
curl -s "$BASE/tasks"; echo

echo "== get one"
curl -s "$BASE/tasks/$ID"; echo

echo "== update"
curl -s -X PUT "$BASE/tasks/$ID" \
  -H "Content-Type: application/json" \
  -d '{"done":true,"title":"Write FlyRank assignment (done)"}'; echo

echo "== restart the server now, then press Enter to verify persistence"
read -r

echo "== get one after restart"
curl -s "$BASE/tasks/$ID"; echo

echo "== delete (expect 204)"
curl -s -o /dev/null -w "%{http_code}\n" -X DELETE "$BASE/tasks/$ID"

echo "== get deleted (expect 404)"
curl -s "$BASE/tasks/$ID"; echo
```
