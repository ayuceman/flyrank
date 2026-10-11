# The Prompt Ladder — FlyRank AI Fluency, Week 2

**Task I picked:** "build me a tasks API" — the same thing I did for the Backend track (BE-02 / BE-04), so I actually know what a good answer looks like and can tell when the model is bluffing.

**How I ran it:** every version was pasted into a *fresh* Claude session (no history, no files attached), so each output only reflects the prompt in front of it. The full prompt and the complete, unedited output for every rung are in [`outputs/`](outputs/) — the excerpts below are just the bits worth pointing at.

| Rung | Layer added | Output file |
|---|---|---|
| v0 | nothing (lazy baseline) | [outputs/v0-baseline.md](outputs/v0-baseline.md) |
| v1 | a clearer goal | [outputs/v1-goal.md](outputs/v1-goal.md) |
| v2 | real context (stack, schema, why) | [outputs/v2-context.md](outputs/v2-context.md) |
| v3 | a specified output format | [outputs/v3-output-format.md](outputs/v3-output-format.md) |
| v4 | explicit constraints | [outputs/v4-constraints.md](outputs/v4-constraints.md) |
| v5 | verification requirements | [outputs/v5-verification.md](outputs/v5-verification.md) |

---

## v0 — the lazy baseline

**Prompt**

```
Build me an API for tasks
```

**What I got back:** a Python/FastAPI app with an in-memory dict, a `status` enum (`todo / in_progress / done`), `description`, `due_date`, filtering on the list route, and UUID string ids.

```python
class TaskCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=200)
    description: Optional[str] = Field(None, max_length=2000)
    status: TaskStatus = TaskStatus.todo
    due_date: Optional[datetime] = None
...
tasks: dict[str, Task] = {}
```

**Notes**

- *What changed in the prompt:* nothing — this is the five-word version I would have typed a month ago.
- *What improved:* n/a. To be fair, the code itself is fine and would run.
- *What still failed:* everything that mattered to me. Wrong language (I work in Node), no persistence at all (restart = data gone), and a whole set of invented fields I never asked for. None of that is the model's fault — I gave it nothing to go on, so it filled the gaps with the most popular guess.
- *What to try next:* say what "an API for tasks" actually has to do.

---

## v1 — a clearer goal

**Prompt**

```
Build me a REST API for tasks with create, list, get one, update and delete, where the data survives a server restart.
```

**What I got back:** Node + Express + `better-sqlite3`, writing to a `tasks.db` file. Six routes (it added PATCH), `PUT` is a full replace, and the table has `description` and `completed`.

```js
CREATE TABLE IF NOT EXISTS tasks (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  title       TEXT    NOT NULL,
  description TEXT    NOT NULL DEFAULT '',
  completed   INTEGER NOT NULL DEFAULT 0,
  ...
```

**Notes**

- *What changed in the prompt:* named the five operations and the one non-negotiable property (survives restart).
- *What improved:* persistence appeared immediately and correctly — the one sentence about restarts was enough. The route list matched what I asked for. It also added a "How persistence works" paragraph that was actually useful.
- *What still failed:* it switched to Node, which is what I wanted, but that was luck — nothing in my prompt said so, and the next run could just as easily have stayed in Python. It still invented fields (`description`, `completed` instead of `done`), added a PATCH route I didn't ask for, and made `PUT` a full replace, which doesn't match my existing in-memory API.
- *What to try next:* stop making the model guess my stack and my schema. Tell it.

---

## v2 — real context

**Prompt (added to v1)**

```
Context: I'm on Node 22 with Express 4 and Postgres (the `pg` package), no ORM. I already have
docker-compose running Postgres and a DATABASE_URL env var. The table already exists:
tasks(id SERIAL PRIMARY KEY, title TEXT NOT NULL, done BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMPTZ DEFAULT now(), updated_at TIMESTAMPTZ DEFAULT now()).
This is for a FlyRank internship assignment where the API shape must match an earlier in-memory
version: same URLs, same JSON fields (id, title, done, created_at, updated_at).
```

**What I got back:** three files (`db.js`, `routes/tasks.js`, `server.js`), every query parameterised, `RETURNING id, title, done, created_at, updated_at` so the JSON shape is exactly my five fields, `COALESCE` for partial updates, and — the part I didn't expect — a "Notes on matching the in-memory version" section:

> **Status codes**: 201 on create, 200 on list/get/update, 204 on delete, 404 for a missing id, 400 for bad input. If the old version returned 200 on create or a body on delete, change those two lines.
>
> **Update semantics**: `PUT` and `PATCH` both do a partial update via `COALESCE` … If your original `PUT` required the full object, drop the `COALESCE` and make `title` mandatory.

**Notes**

- *What changed in the prompt:* the stack, the existing schema, what already exists (docker-compose, env var), and *why* (must match an earlier version).
- *What improved:* this was the biggest single jump in the whole ladder. Correct language, correct database, correct field names, no invented columns, no `CREATE TABLE` because I said the table already exists. The "why" paragraph did real work: because it knew the shape had to match something, it listed the three places the shape could differ (timestamp format, status codes, PUT semantics) and told me what to change in each case. That's the model thinking about *my* problem instead of the generic one.
- *What still failed:* a non-numeric id (`GET /tasks/abc`) returns `400 invalid id`, while my in-memory version returns 404. It still added `PATCH` as an alias. And the output is long — prose, headings, a run section, notes — which is fine for reading once but annoying to paste into a repo.
- *What to try next:* control the shape of the answer so I can drop it straight into files.

---

## v3 — a specified output format

**Prompt (added to v2)**

```
Output format: give me only (1) a file tree, (2) each file in full in its own code block with the
path as the first line, (3) a curl smoke test. No prose before, between or after the files.
```

**What I got back:** exactly the format I asked for — tree, files, smoke script, zero prose. But look at the tree:

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

and the first line of `src/db.js`:

```js
import pg from "pg";
```

**Notes**

- *What changed in the prompt:* only the output format. The goal and context were identical to v2.
- *What improved:* the response is clean and copy-pasteable, and the smoke script is better than v2's (it captures the created id instead of hard-coding `1`, and it has a "restart the server now, press Enter" step for the persistence check).
- *What still failed — this is the rung that made things worse:* three regressions, and none of them were announced.
  1. The useful "notes on matching the in-memory version" section from v2 is gone. I told it "no prose", and it obeyed — the prose was where the judgement lived.
  2. It silently switched from CommonJS (`require`) to ESM (`import`) and added a `package.json` with `"type": "module"`. v2 used `require` with the *same context*. Nothing in my prompt caused this; locking the format just gave the model a chance to re-roll everything else.
  3. It introduced a `src/` layout and an extra `app.js`, so now it's five files instead of three, and a `package.json` I didn't want because I already have one.
  Also still: `400` on a bad id, and `PATCH` is still there.
- *What to try next:* the lesson here is that a format rule removes freedom in one place and the model spends it somewhere else. If I don't want to be surprised, I have to pin down the things I care about explicitly — module system, routes, file list, error codes.

---

## v4 — explicit constraints

**Prompt (added to v3)**

```
Constraints:
- CommonJS (require), not ESM. My existing files use require.
- Routes: POST /tasks, GET /tasks, GET /tasks/:id, PUT /tasks/:id, DELETE /tasks/:id.
  No PATCH, no extra routes except GET /health.
- PUT is a partial update: title and/or done, at least one required.
- Parameterised SQL only ($1, $2). Never build SQL from strings.
- Unknown or non-numeric id -> 404 with exactly {"error":"Task not found"}. Never 400 for a bad id.
- Invalid body -> 400 with {"error":"<message naming the field>"}.
- DELETE returns 204 with no body.
- Keep it to three files: server.js, db.js, routes/tasks.js. No package.json, I have one.
```

**What I got back:** three files, `require` everywhere, five routes plus `/health`, no PATCH, and a `parseId` that's stricter than anything I wrote myself:

```js
const NOT_FOUND = { error: 'Task not found' };

function parseId(raw) {
  if (typeof raw !== 'string' || !/^\d+$/.test(raw)) return null;
  const id = Number(raw);
  if (!Number.isSafeInteger(id) || id < 1 || id > 2147483647) return null;
  return id;
}
...
if (id === null) return res.status(404).json(NOT_FOUND);
```

**Notes**

- *What changed in the prompt:* eight one-line rules. Each one was written against something a previous rung got wrong (ESM → v3, PATCH → v1/v2/v3, 400 on bad id → v2/v3, extra files → v3).
- *What improved:* every single constraint was met. I checked them one by one. The bad-id handling is better than my own BE-04 code — it even caps the id at the Postgres `INT` maximum so a huge number doesn't throw a DB error. The error messages all name the field (`title is required`, `done must be a boolean`).
- *What still failed:* I asked for a smoke test and got a list of curls — the kind where the comment says `# bad ids -> 404` and I'm supposed to eyeball the output and agree. It also went back to hard-coding `/tasks/1` with a comment "replace 1 with a real id", which v3's script had already solved. So the code is right, but *I* have no proof of that beyond reading it.
- *What to try next:* make the model prove its own claims.

---

## v5 — verification requirements

**Prompt (added to v4)**

```
Verification: the smoke test must be self-checking, not a list of curls for me to eyeball: for
every request assert the expected status code and exit non-zero on the first mismatch, including
the bad-id 404s, the 400s, and a check that a created task is still there after I restart the
server (prompt me to restart, then re-check). After the files, add a short table with one row per
constraint above and the file:line that satisfies it. If any constraint can't be met, say so in
that table instead of silently skipping it.
```

**What I got back:** the same three files, plus a `smoke.sh` with `check <status> <desc> <curl args>`, `expect_body` and `expect_field` helpers that `exit 1` on the first mismatch, a `wait_for_server` loop around the restart prompt, and a constraint table. About fifty assertions, including the exact 404 body for `abc`, `999999`, `1.5`, and the three-field re-check after restart:

```bash
check 404 "GET /tasks/abc (non-numeric id)" "$BASE/tasks/abc"
expect_body "$NF" "GET bad id body"
check 404 "GET /tasks/1.5 (non-integer id)" "$BASE/tasks/1.5"
expect_body "$NF" "GET float id body"
...
echo ">>> RESTART THE SERVER NOW (Ctrl-C it, then run: node server.js), then press Enter."
read -r _ < /dev/tty

echo "== persistence after restart"
wait_for_server
check 200 "GET /tasks/$ID after restart" "$BASE/tasks/$ID"
expect_field title "Renamed"  "task survived restart (title)"
```

And the table row I want to talk about:

> | Unknown or non-numeric id -> 404 … never 400 for a bad id | `routes/tasks.js:7`, `:10-14` (`parseId`) … **Note: a *bad id combined with an invalid body* on PUT returns 400 for the body (`:79-89` run before the DB lookup)**; a bad id with a valid body is always 404 |

**Notes**

- *What changed in the prompt:* I asked for the test to fail loudly instead of printing, for a constraint → file:line map, and for honesty if something couldn't be done.
- *What improved:* the smoke test is now something I'd actually keep in a repo. The restart check is real (it waits for `/health` to come back, then asserts the id, title and done value of the task created earlier). The table made reviewing the code take two minutes instead of ten, and the "say so instead of silently skipping" clause produced a useful admission: it flagged that `smoke.sh` is a fourth file and told me to delete it if the submission has to be exactly three.
- *What still failed:* the table contains a mistake about its own code. It claims that on `PUT`, a bad id plus an invalid body returns 400 "because body validation runs before the DB lookup". But in the file it wrote, `parseId` is the *first* line of the handler and returns 404 before the body is ever looked at — so a bad id is always 404, which is what I asked for. The code is right; the explanation of the code is wrong. If I'd trusted the table without reading the handler I'd have "fixed" something that wasn't broken. Smaller one: it went back to `RETURNING *` / `SELECT *` (v2–v4 all listed the columns explicitly), which is fine today but means any column I add later leaks into the API.
- *What to try next:* verification requirements made the model *produce* evidence, but I still have to *check* the evidence. The next layer would be to actually run the smoke test and paste the output back, so the model is correcting against reality instead of against its own description.

---

## What I learned

**Context was the biggest win, by a long way.** v1 → v2 fixed more problems than every other rung combined, and it wasn't the schema that did it — it was the one sentence explaining *why* ("must match an earlier in-memory version"). The model used that to anticipate the three places the two APIs could drift, which is exactly what a good colleague would do. Facts tell the model what to build; the reason tells it what to worry about.

**A format rule is not a quality rule.** v3 is the rung I'd show someone who thinks "better prompt = longer prompt". Adding the output-format layer made the answer *look* more professional while it quietly dropped the most useful part of v2 and changed the module system. Locking one thing down doesn't freeze the rest; the model re-rolls everything you didn't mention.

**Constraints only stick when they're specific, and they're cheapest when they come from a previous failure.** Every line in my v4 list was a reaction to something I'd just seen go wrong. Writing constraints in advance, from imagination, I would have missed half of them.

**"Verify it" means "show me evidence", not "be correct".** v5's smoke test was excellent and its constraint table contained a false statement. Both came from the same prompt. Verification layers raise the floor and make review faster, but they don't replace reading the code.

**The outputs got shorter as the prompt got longer.** v0's response was the longest and least useful; v5's is tight and mostly right. The effort moved from my side of the review to my side of the prompt, which is the trade I want.

---

## The final prompt (reusable)

This is what I'd hand to someone who has never seen my project. Replace the `<...>` parts.

```
Build me a REST API for <resource> with create, list, get one, update and delete, where the data
survives a server restart.

Context: I'm on <runtime + version> with <framework> and <database + client library>, no ORM.
<What already exists: docker-compose, env vars, migrations.> The table already exists:
<table name>(<columns with types and defaults>).
<Why this matters / what it has to be compatible with — e.g. "the API shape must match an earlier
version: same URLs, same JSON fields (<list them>)".>

Output format: give me only (1) a file tree, (2) each file in full in its own code block with the
path as the first line, (3) a smoke test script. No prose before, between or after the files.

Constraints:
- <module system / language flavour>, e.g. CommonJS (require), not ESM.
- Routes: <exact list>. No others except GET /health.
- <update semantics>, e.g. PUT is a partial update: <fields>, at least one required.
- Parameterised SQL only. Never build SQL from strings.
- Unknown or non-numeric id -> 404 with exactly {"error":"<Resource> not found"}. Never 400 for a bad id.
- Invalid body -> 400 with {"error":"<message naming the field>"}.
- DELETE returns 204 with no body.
- Keep it to <N> files: <list>. No package.json, I have one.
- Select and return columns explicitly; never SELECT * or RETURNING *.

Verification: the smoke test must be self-checking, not a list of curls for me to eyeball: for every
request assert the expected status code (and exact body for the error cases) and exit non-zero on
the first mismatch, including the bad-id 404s, the 400s, and a check that a created record is still
there after I restart the server (prompt me to restart, then re-check). After the files, add a short
table with one row per constraint above and the file:line that satisfies it. If any constraint can't
be met, say so in that table instead of silently skipping it. Do not describe behaviour in the table
that the code doesn't actually have — if unsure, quote the line.
```

The two lines that aren't in v5 — "select columns explicitly" and "don't describe behaviour the code doesn't have" — are the two things v5 got wrong. That's the ladder working the way it's supposed to: the next prompt is built out of the last output's mistakes.
