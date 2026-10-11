# v2 — layer added: real context

## Prompt

```
Build me a REST API for tasks with create, list, get one, update and delete, where the data survives a server restart.

Context: I'm on Node 22 with Express 4 and Postgres (the `pg` package), no ORM. I already have docker-compose running Postgres and a DATABASE_URL env var. The table already exists:
tasks(id SERIAL PRIMARY KEY, title TEXT NOT NULL, done BOOLEAN NOT NULL DEFAULT false, created_at TIMESTAMPTZ DEFAULT now(), updated_at TIMESTAMPTZ DEFAULT now()).
This is for a FlyRank internship assignment where the API shape must match an earlier in-memory version: same URLs, same JSON fields (id, title, done, created_at, updated_at).
```

## Output (Claude, fresh session, 2026-10-11)

Here's a complete, drop-in implementation. Three files: `db.js` (pool), `routes/tasks.js` (CRUD), and `server.js` (app). Persistence is handled by Postgres, so data survives restarts automatically.

## `db.js`

```js
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

pool.on('error', (err) => {
  console.error('Unexpected idle client error', err);
});

module.exports = { pool };
```

## `routes/tasks.js`

```js
const express = require('express');
const { pool } = require('../db');

const router = express.Router();

// Columns returned on every response, so the JSON shape matches the in-memory version.
const COLS = 'id, title, done, created_at, updated_at';

function parseId(raw) {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

// POST /tasks  -> 201 { id, title, done, created_at, updated_at }
router.post('/', async (req, res, next) => {
  try {
    const { title, done } = req.body ?? {};
    if (typeof title !== 'string' || title.trim() === '') {
      return res.status(400).json({ error: 'title is required and must be a non-empty string' });
    }
    if (done !== undefined && typeof done !== 'boolean') {
      return res.status(400).json({ error: 'done must be a boolean' });
    }

    const { rows } = await pool.query(
      `INSERT INTO tasks (title, done)
       VALUES ($1, COALESCE($2, false))
       RETURNING ${COLS}`,
      [title.trim(), done ?? null]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    next(err);
  }
});

// GET /tasks -> 200 [ ...tasks ]
router.get('/', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT ${COLS} FROM tasks ORDER BY id ASC`
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// GET /tasks/:id -> 200 task | 404
router.get('/:id', async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    if (id === null) return res.status(400).json({ error: 'invalid id' });

    const { rows } = await pool.query(
      `SELECT ${COLS} FROM tasks WHERE id = $1`,
      [id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'task not found' });
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

// PUT /tasks/:id (partial update: title and/or done) -> 200 task | 404
async function updateTask(req, res, next) {
  try {
    const id = parseId(req.params.id);
    if (id === null) return res.status(400).json({ error: 'invalid id' });

    const { title, done } = req.body ?? {};
    if (title !== undefined && (typeof title !== 'string' || title.trim() === '')) {
      return res.status(400).json({ error: 'title must be a non-empty string' });
    }
    if (done !== undefined && typeof done !== 'boolean') {
      return res.status(400).json({ error: 'done must be a boolean' });
    }
    if (title === undefined && done === undefined) {
      return res.status(400).json({ error: 'provide title and/or done' });
    }

    // COALESCE keeps the existing value when a field is omitted.
    const { rows } = await pool.query(
      `UPDATE tasks
         SET title = COALESCE($2, title),
             done  = COALESCE($3, done),
             updated_at = now()
       WHERE id = $1
       RETURNING ${COLS}`,
      [id, title === undefined ? null : title.trim(), done === undefined ? null : done]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'task not found' });
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
}
router.put('/:id', updateTask);
router.patch('/:id', updateTask);

// DELETE /tasks/:id -> 204 | 404
router.delete('/:id', async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    if (id === null) return res.status(400).json({ error: 'invalid id' });

    const { rowCount } = await pool.query('DELETE FROM tasks WHERE id = $1', [id]);
    if (rowCount === 0) return res.status(404).json({ error: 'task not found' });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

module.exports = router;
```

## `server.js`

```js
const express = require('express');
const tasksRouter = require('./routes/tasks');
const { pool } = require('./db');

const app = express();
app.use(express.json());

app.get('/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok' });
  } catch {
    res.status(503).json({ status: 'db unavailable' });
  }
});

app.use('/tasks', tasksRouter);

// 404 for unknown routes
app.use((req, res) => res.status(404).json({ error: 'not found' }));

// Malformed JSON bodies and anything thrown by a route land here.
app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'invalid JSON body' });
  }
  console.error(err);
  res.status(500).json({ error: 'internal server error' });
});

const PORT = process.env.PORT || 3000;
const server = app.listen(PORT, () => console.log(`listening on :${PORT}`));

// Graceful shutdown so the pool closes cleanly on docker stop / Ctrl-C.
for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    server.close(() => pool.end().then(() => process.exit(0)));
  });
}
```

## Run

```bash
npm i express pg
DATABASE_URL=postgres://user:pass@localhost:5432/dbname node server.js
```

## Quick smoke test

```bash
curl -s -X POST localhost:3000/tasks -H 'content-type: application/json' -d '{"title":"first"}'
curl -s localhost:3000/tasks
curl -s localhost:3000/tasks/1
curl -s -X PUT localhost:3000/tasks/1 -H 'content-type: application/json' -d '{"done":true}'
curl -s -X DELETE localhost:3000/tasks/1 -i
# restart the server, then:
curl -s localhost:3000/tasks   # rows are still there
```

## Notes on matching the in-memory version

- **Response shape**: every route uses `RETURNING id, title, done, created_at, updated_at` (or the same `SELECT` list), so the JSON keys are exactly the five you listed. `pg` returns `TIMESTAMPTZ` as JS `Date` objects, which `res.json` serializes as ISO 8601 strings (e.g. `"2026-10-11T09:30:00.000Z"`). If your in-memory version used a different timestamp format, that's the one place to adjust.
- **Status codes**: 201 on create, 200 on list/get/update, 204 on delete, 404 for a missing id, 400 for bad input. If the old version returned 200 on create or a body on delete, change those two lines.
- **Update semantics**: `PUT` and `PATCH` both do a partial update via `COALESCE`, which is the usual behaviour of the simple in-memory versions these assignments start from. If your original `PUT` required the full object, drop the `COALESCE` and make `title` mandatory.
- **Parameterized queries only** (`$1`, `$2`), so no SQL injection surface.
- `updated_at` is set explicitly in the `UPDATE`; the column's `DEFAULT now()` only applies on insert.
