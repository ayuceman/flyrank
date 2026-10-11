# v4 — layer added: constraints

## Prompt

```
Build me a REST API for tasks with create, list, get one, update and delete, where the data survives a server restart.

Context: I'm on Node 22 with Express 4 and Postgres (the `pg` package), no ORM. I already have docker-compose running Postgres and a DATABASE_URL env var. The table already exists:
tasks(id SERIAL PRIMARY KEY, title TEXT NOT NULL, done BOOLEAN NOT NULL DEFAULT false, created_at TIMESTAMPTZ DEFAULT now(), updated_at TIMESTAMPTZ DEFAULT now()).
This is for a FlyRank internship assignment where the API shape must match an earlier in-memory version: same URLs, same JSON fields (id, title, done, created_at, updated_at).

Output format: give me only (1) a file tree, (2) each file in full in its own code block with the path as the first line, (3) a curl smoke test. No prose before, between or after the files.

Constraints:
- CommonJS (require), not ESM. My existing files use require.
- Routes: POST /tasks, GET /tasks, GET /tasks/:id, PUT /tasks/:id, DELETE /tasks/:id. No PATCH, no extra routes except GET /health.
- PUT is a partial update: title and/or done, at least one required.
- Parameterised SQL only ($1, $2). Never build SQL from strings.
- Unknown or non-numeric id -> 404 with exactly {"error":"Task not found"}. Never 400 for a bad id.
- Invalid body -> 400 with {"error":"<message naming the field>"}.
- DELETE returns 204 with no body.
- Keep it to three files: server.js, db.js, routes/tasks.js. No package.json, I have one.
```

## Output (Claude, fresh session, 2026-10-11)

```
.
├── server.js
├── db.js
└── routes/
    └── tasks.js
```

```js
// server.js
const express = require('express');
const tasksRouter = require('./routes/tasks');
const { pool } = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// Malformed JSON body -> 400
app.use((err, req, res, next) => {
  if (err && err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Request body must be valid JSON' });
  }
  return next(err);
});

app.get('/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok' });
  } catch (err) {
    res.status(503).json({ status: 'error', error: 'Database unavailable' });
  }
});

app.use('/tasks', tasksRouter);

// Generic error handler
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});

module.exports = app;
```

```js
// db.js
const { Pool } = require('pg');

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL environment variable is not set');
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

pool.on('error', (err) => {
  console.error('Unexpected error on idle Postgres client', err);
});

function query(text, params) {
  return pool.query(text, params);
}

module.exports = { pool, query };
```

```js
// routes/tasks.js
const express = require('express');
const { query } = require('../db');

const router = express.Router();

const NOT_FOUND = { error: 'Task not found' };
const COLUMNS = 'id, title, done, created_at, updated_at';

// Returns a positive integer id, or null if the param is not a valid id.
function parseId(raw) {
  if (typeof raw !== 'string' || !/^\d+$/.test(raw)) return null;
  const id = Number(raw);
  if (!Number.isSafeInteger(id) || id < 1 || id > 2147483647) return null;
  return id;
}

function validateTitle(title) {
  if (typeof title !== 'string') return 'title must be a string';
  if (title.trim().length === 0) return 'title must not be empty';
  return null;
}

// POST /tasks
router.post('/', async (req, res, next) => {
  try {
    const body = req.body;
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return res.status(400).json({ error: 'Request body must be a JSON object' });
    }

    if (body.title === undefined) {
      return res.status(400).json({ error: 'title is required' });
    }
    const titleError = validateTitle(body.title);
    if (titleError) {
      return res.status(400).json({ error: titleError });
    }

    let done = false;
    if (body.done !== undefined) {
      if (typeof body.done !== 'boolean') {
        return res.status(400).json({ error: 'done must be a boolean' });
      }
      done = body.done;
    }

    const result = await query(
      `INSERT INTO tasks (title, done) VALUES ($1, $2) RETURNING ${COLUMNS}`,
      [body.title.trim(), done]
    );
    return res.status(201).json(result.rows[0]);
  } catch (err) {
    return next(err);
  }
});

// GET /tasks
router.get('/', async (req, res, next) => {
  try {
    const result = await query(`SELECT ${COLUMNS} FROM tasks ORDER BY id ASC`);
    return res.json(result.rows);
  } catch (err) {
    return next(err);
  }
});

// GET /tasks/:id
router.get('/:id', async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    if (id === null) return res.status(404).json(NOT_FOUND);

    const result = await query(`SELECT ${COLUMNS} FROM tasks WHERE id = $1`, [id]);
    if (result.rowCount === 0) return res.status(404).json(NOT_FOUND);

    return res.json(result.rows[0]);
  } catch (err) {
    return next(err);
  }
});

// PUT /tasks/:id  (partial update: title and/or done)
router.put('/:id', async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    if (id === null) return res.status(404).json(NOT_FOUND);

    const body = req.body;
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return res.status(400).json({ error: 'Request body must be a JSON object' });
    }

    const hasTitle = body.title !== undefined;
    const hasDone = body.done !== undefined;

    if (!hasTitle && !hasDone) {
      return res.status(400).json({ error: 'At least one of title or done is required' });
    }

    if (hasTitle) {
      const titleError = validateTitle(body.title);
      if (titleError) return res.status(400).json({ error: titleError });
    }
    if (hasDone && typeof body.done !== 'boolean') {
      return res.status(400).json({ error: 'done must be a boolean' });
    }

    // Pass every value as a parameter; the SQL text itself is fixed.
    // COALESCE keeps the existing column value when the parameter is NULL.
    const result = await query(
      `UPDATE tasks
         SET title = COALESCE($2, title),
             done = COALESCE($3, done),
             updated_at = now()
       WHERE id = $1
       RETURNING ${COLUMNS}`,
      [id, hasTitle ? body.title.trim() : null, hasDone ? body.done : null]
    );

    if (result.rowCount === 0) return res.status(404).json(NOT_FOUND);
    return res.json(result.rows[0]);
  } catch (err) {
    return next(err);
  }
});

// DELETE /tasks/:id
router.delete('/:id', async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    if (id === null) return res.status(404).json(NOT_FOUND);

    const result = await query('DELETE FROM tasks WHERE id = $1', [id]);
    if (result.rowCount === 0) return res.status(404).json(NOT_FOUND);

    return res.status(204).send();
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
```

```bash
# smoke-test.sh
BASE=http://localhost:3000

# health
curl -s -i $BASE/health

# create
curl -s -i -X POST $BASE/tasks -H 'Content-Type: application/json' -d '{"title":"Write report"}'
curl -s -i -X POST $BASE/tasks -H 'Content-Type: application/json' -d '{"title":"Ship API","done":true}'

# invalid body -> 400
curl -s -i -X POST $BASE/tasks -H 'Content-Type: application/json' -d '{}'
curl -s -i -X POST $BASE/tasks -H 'Content-Type: application/json' -d '{"title":"x","done":"yes"}'

# list
curl -s -i $BASE/tasks

# get one (replace 1 with a real id from the list)
curl -s -i $BASE/tasks/1

# bad ids -> 404
curl -s -i $BASE/tasks/abc
curl -s -i $BASE/tasks/999999

# partial update
curl -s -i -X PUT $BASE/tasks/1 -H 'Content-Type: application/json' -d '{"done":true}'
curl -s -i -X PUT $BASE/tasks/1 -H 'Content-Type: application/json' -d '{"title":"Write final report"}'

# update with empty body -> 400
curl -s -i -X PUT $BASE/tasks/1 -H 'Content-Type: application/json' -d '{}'

# delete -> 204, then 404
curl -s -i -X DELETE $BASE/tasks/1
curl -s -i -X DELETE $BASE/tasks/1

# persistence: restart the server, then confirm remaining tasks still exist
curl -s -i $BASE/tasks
```
