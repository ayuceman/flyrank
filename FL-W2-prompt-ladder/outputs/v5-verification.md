# v5 — layer added: verification requirements

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

Verification: the smoke test must be self-checking, not a list of curls for me to eyeball: for every request assert the expected status code and exit non-zero on the first mismatch, including the bad-id 404s, the 400s, and a check that a created task is still there after I restart the server (prompt me to restart, then re-check). After the files, add a short table with one row per constraint above and the file:line that satisfies it. If any constraint can't be met, say so in that table instead of silently skipping it.
```

## Output (Claude, fresh session, 2026-10-11)

```
.
├── server.js
├── db.js
├── routes/
│   └── tasks.js
└── smoke.sh        (the curl smoke test; not part of the app)
```

```js
// db.js
const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

module.exports = {
  query: (text, params) => pool.query(text, params),
  pool,
};
```

```js
// server.js
const express = require('express');
const tasksRouter = require('./routes/tasks');
const db = require('./db');

const app = express();
app.use(express.json());

app.get('/health', async (req, res) => {
  try {
    await db.query('SELECT 1');
    res.json({ status: 'ok' });
  } catch (err) {
    res.status(503).json({ status: 'error', error: 'database unreachable' });
  }
});

app.use('/tasks', tasksRouter);

// Malformed JSON body -> 400; anything else -> 500
app.use((err, req, res, next) => {
  if (err && err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'body must be valid JSON' });
  }
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Listening on ${PORT}`));
```

```js
// routes/tasks.js
const express = require('express');
const db = require('../db');

const router = express.Router();

const NOT_FOUND = { error: 'Task not found' };

// Unknown or non-numeric id -> null (caller answers 404, never 400)
function parseId(raw) {
  if (!/^\d+$/.test(raw)) return null;
  const n = Number(raw);
  return n > 2147483647 ? null : n; // SERIAL is int4; avoid a DB range error
}

function validateTitle(title) {
  if (typeof title !== 'string' || title.trim() === '') {
    return 'title must be a non-empty string';
  }
  return null;
}

function validateDone(done) {
  if (typeof done !== 'boolean') return 'done must be a boolean';
  return null;
}

// POST /tasks
router.post('/', async (req, res, next) => {
  try {
    const body = req.body || {};
    const titleErr = validateTitle(body.title);
    if (titleErr) return res.status(400).json({ error: titleErr });
    if (body.done !== undefined) {
      const doneErr = validateDone(body.done);
      if (doneErr) return res.status(400).json({ error: doneErr });
    }
    const { rows } = await db.query(
      'INSERT INTO tasks (title, done) VALUES ($1, $2) RETURNING *',
      [body.title.trim(), body.done === undefined ? false : body.done]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    next(err);
  }
});

// GET /tasks
router.get('/', async (req, res, next) => {
  try {
    const { rows } = await db.query('SELECT * FROM tasks ORDER BY id');
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// GET /tasks/:id
router.get('/:id', async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    if (id === null) return res.status(404).json(NOT_FOUND);
    const { rows } = await db.query('SELECT * FROM tasks WHERE id = $1', [id]);
    if (rows.length === 0) return res.status(404).json(NOT_FOUND);
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

// PUT /tasks/:id  (partial: title and/or done, at least one required)
router.put('/:id', async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    if (id === null) return res.status(404).json(NOT_FOUND);
    const body = req.body || {};
    const hasTitle = body.title !== undefined;
    const hasDone = body.done !== undefined;
    if (!hasTitle && !hasDone) {
      return res.status(400).json({ error: 'title or done is required' });
    }
    if (hasTitle) {
      const titleErr = validateTitle(body.title);
      if (titleErr) return res.status(400).json({ error: titleErr });
    }
    if (hasDone) {
      const doneErr = validateDone(body.done);
      if (doneErr) return res.status(400).json({ error: doneErr });
    }
    // COALESCE keeps the current value for any field not supplied
    const { rows } = await db.query(
      `UPDATE tasks
         SET title = COALESCE($1, title),
             done = COALESCE($2, done),
             updated_at = now()
       WHERE id = $3
       RETURNING *`,
      [hasTitle ? body.title.trim() : null, hasDone ? body.done : null, id]
    );
    if (rows.length === 0) return res.status(404).json(NOT_FOUND);
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

// DELETE /tasks/:id
router.delete('/:id', async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    if (id === null) return res.status(404).json(NOT_FOUND);
    const { rowCount } = await db.query('DELETE FROM tasks WHERE id = $1', [id]);
    if (rowCount === 0) return res.status(404).json(NOT_FOUND);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

module.exports = router;
```

```bash
# smoke.sh
#!/usr/bin/env bash
# Self-checking smoke test. Exits non-zero on the first mismatch.
# Usage: node server.js &  then  bash smoke.sh   (BASE=http://host:port to override)
set -u
BASE="${BASE:-http://localhost:3000}"
JSON='Content-Type: application/json'
BODY=""

check() { # check <expected_status> <description> <curl args...>
  local expected="$1" desc="$2"; shift 2
  local tmp; tmp=$(mktemp)
  local status; status=$(curl -s -o "$tmp" -w '%{http_code}' "$@")
  BODY=$(cat "$tmp"); rm -f "$tmp"
  if [ "$status" != "$expected" ]; then
    echo "FAIL: $desc -- expected HTTP $expected, got $status; body: $BODY" >&2
    exit 1
  fi
  echo "ok   $expected  $desc"
}

expect_body() { # expect_body <exact_json> <description>
  if [ "$BODY" != "$1" ]; then
    echo "FAIL: $2 -- expected body $1, got $BODY" >&2; exit 1
  fi
}

field() { node -e 'const o=JSON.parse(process.argv[1]);process.stdout.write(String(o[process.argv[2]]))' "$BODY" "$1"; }

expect_field() { # expect_field <name> <value> <description>
  local got; got=$(field "$1")
  if [ "$got" != "$2" ]; then
    echo "FAIL: $3 -- expected $1=$2, got $1=$got" >&2; exit 1
  fi
}

wait_for_server() {
  for _ in $(seq 1 30); do
    curl -sf "$BASE/health" >/dev/null && return 0
    sleep 1
  done
  echo "FAIL: server not reachable at $BASE/health" >&2; exit 1
}

NF='{"error":"Task not found"}'

echo "== health"
wait_for_server
check 200 "GET /health" "$BASE/health"

echo "== create"
check 201 "POST /tasks valid" -X POST -H "$JSON" -d '{"title":"Smoke test task"}' "$BASE/tasks"
ID=$(field id)
for f in id title done created_at updated_at; do
  node -e 'const o=JSON.parse(process.argv[1]);process.exit(process.argv[2] in o?0:1)' "$BODY" "$f" \
    || { echo "FAIL: created task missing field $f: $BODY" >&2; exit 1; }
done
expect_field title "Smoke test task" "POST /tasks title echoed"
expect_field done  "false"           "POST /tasks done defaults to false"

check 400 "POST /tasks missing title" -X POST -H "$JSON" -d '{}' "$BASE/tasks"
expect_body '{"error":"title must be a non-empty string"}' "POST missing title message"
check 400 "POST /tasks empty title" -X POST -H "$JSON" -d '{"title":"   "}' "$BASE/tasks"
check 400 "POST /tasks non-boolean done" -X POST -H "$JSON" -d '{"title":"x","done":"yes"}' "$BASE/tasks"
expect_body '{"error":"done must be a boolean"}' "POST bad done message"
check 400 "POST /tasks malformed JSON" -X POST -H "$JSON" -d '{bad json' "$BASE/tasks"
expect_body '{"error":"body must be valid JSON"}' "POST malformed JSON message"

echo "== list"
check 200 "GET /tasks" "$BASE/tasks"
node -e 'const a=JSON.parse(process.argv[1]);process.exit(Array.isArray(a)&&a.some(t=>t.id===Number(process.argv[2]))?0:1)' "$BODY" "$ID" \
  || { echo "FAIL: GET /tasks does not contain task $ID" >&2; exit 1; }

echo "== get one"
check 200 "GET /tasks/$ID" "$BASE/tasks/$ID"
expect_field id "$ID" "GET /tasks/:id returns same id"
check 404 "GET /tasks/abc (non-numeric id)" "$BASE/tasks/abc"
expect_body "$NF" "GET bad id body"
check 404 "GET /tasks/999999999 (unknown id)" "$BASE/tasks/999999999"
expect_body "$NF" "GET unknown id body"
check 404 "GET /tasks/1.5 (non-integer id)" "$BASE/tasks/1.5"
expect_body "$NF" "GET float id body"

echo "== update"
check 400 "PUT /tasks/$ID empty body" -X PUT -H "$JSON" -d '{}' "$BASE/tasks/$ID"
expect_body '{"error":"title or done is required"}' "PUT empty body message"
check 400 "PUT /tasks/$ID non-boolean done" -X PUT -H "$JSON" -d '{"done":"yes"}' "$BASE/tasks/$ID"
check 400 "PUT /tasks/$ID empty title" -X PUT -H "$JSON" -d '{"title":""}' "$BASE/tasks/$ID"
check 200 "PUT /tasks/$ID done only" -X PUT -H "$JSON" -d '{"done":true}' "$BASE/tasks/$ID"
expect_field done  "true"            "PUT done applied"
expect_field title "Smoke test task" "PUT done left title unchanged"
check 200 "PUT /tasks/$ID title only" -X PUT -H "$JSON" -d '{"title":"Renamed"}' "$BASE/tasks/$ID"
expect_field title "Renamed" "PUT title applied"
expect_field done  "true"    "PUT title left done unchanged"
check 404 "PUT /tasks/abc (non-numeric id)" -X PUT -H "$JSON" -d '{"done":false}' "$BASE/tasks/abc"
expect_body "$NF" "PUT bad id body"
check 404 "PUT /tasks/999999999 (unknown id)" -X PUT -H "$JSON" -d '{"done":false}' "$BASE/tasks/999999999"
expect_body "$NF" "PUT unknown id body"

echo "== delete"
check 201 "POST /tasks (to delete)" -X POST -H "$JSON" -d '{"title":"Delete me"}' "$BASE/tasks"
DEL_ID=$(field id)
check 204 "DELETE /tasks/$DEL_ID" -X DELETE "$BASE/tasks/$DEL_ID"
[ -z "$BODY" ] || { echo "FAIL: DELETE returned a body: $BODY" >&2; exit 1; }
check 404 "GET /tasks/$DEL_ID after delete" "$BASE/tasks/$DEL_ID"
expect_body "$NF" "GET after delete body"
check 404 "DELETE /tasks/$DEL_ID again" -X DELETE "$BASE/tasks/$DEL_ID"
expect_body "$NF" "DELETE twice body"
check 404 "DELETE /tasks/abc (non-numeric id)" -X DELETE "$BASE/tasks/abc"
expect_body "$NF" "DELETE bad id body"

echo
echo ">>> Task $ID (title \"Renamed\", done true) is in the DB."
echo ">>> RESTART THE SERVER NOW (Ctrl-C it, then run: node server.js), then press Enter."
read -r _ < /dev/tty

echo "== persistence after restart"
wait_for_server
check 200 "GET /tasks/$ID after restart" "$BASE/tasks/$ID"
expect_field id    "$ID"      "task survived restart (id)"
expect_field title "Renamed"  "task survived restart (title)"
expect_field done  "true"     "task survived restart (done)"

echo "== cleanup"
check 204 "DELETE /tasks/$ID (cleanup)" -X DELETE "$BASE/tasks/$ID"

echo
echo "ALL CHECKS PASSED"
```

| Constraint | Satisfied at |
|---|---|
| Data survives server restart | `db.js:4` (Postgres via `DATABASE_URL`, no in-process state); verified by `smoke.sh` "persistence after restart" block |
| Same JSON fields (id, title, done, created_at, updated_at) | `routes/tasks.js:39`, `:51`, `:63`, `:97` (`RETURNING *` / `SELECT *` on the existing table) |
| CommonJS (`require`), not ESM | `db.js:2,6`; `server.js:2-4`; `routes/tasks.js:2-3,120` |
| Routes: POST /tasks, GET /tasks, GET /tasks/:id, PUT /tasks/:id, DELETE /tasks/:id; no PATCH; only extra is GET /health | `routes/tasks.js:29`, `:49`, `:59`, `:72`, `:108`; mounted `server.js:18`; health `server.js:9` |
| PUT is partial: title and/or done, at least one required | `routes/tasks.js:77-81` (require one), `:91-98` (`COALESCE` keeps unsupplied field) |
| Parameterised SQL only, never string-built | `routes/tasks.js:39`, `:51`, `:63`, `:92-98`, `:112` (all `$n`; no interpolation anywhere) |
| Unknown or non-numeric id -> 404 `{"error":"Task not found"}`, never 400 for a bad id | `routes/tasks.js:7` (exact body), `:10-14` (`parseId`), `:62/:64`, `:75/:100`, `:111/:113`. Note: a *bad id combined with an invalid body* on PUT returns 400 for the body (`:79-89` run before the DB lookup); a bad id with a valid body is always 404 |
| Invalid body -> 400 `{"error":"<message naming the field>"}` | `routes/tasks.js:16-26` (messages name `title` / `done`), used at `:33`, `:36`, `:80`, `:84`, `:88`; malformed JSON -> `server.js:21-24` (names `body`) |
| DELETE returns 204 with no body | `routes/tasks.js:114` |
| Three files only: server.js, db.js, routes/tasks.js; no package.json | File tree (`smoke.sh` is the requested test script, not part of the app; delete it if the submission must be exactly three files) |
| Smoke test self-checking: asserts every status, exits non-zero on first mismatch, covers bad-id 404s, 400s, and restart persistence with a prompt | `smoke.sh` `check()` / `expect_body()` / `expect_field()` exit 1 on mismatch; 404 bodies asserted exactly; restart prompt + `wait_for_server` + re-check |
