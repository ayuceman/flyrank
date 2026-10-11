# A3 - Containerize your stack (BE-04)

Same tasks API as A2, but now the data lives in Postgres running in Docker, and
the whole thing (app + Postgres + Redis) starts with one command.

## Run it

You need Docker Desktop. Then:

```bash
cp .env.example .env
docker compose up --build
```

First start takes a minute because it pulls the postgres and redis images and
builds the app image. After that the API is on http://localhost:3000.

```bash
curl http://localhost:3000/health
# {"status":"ok","database":"ok (postgres)","redis":"ok"}

curl -X POST localhost:3000/tasks -H "Content-Type: application/json" -d '{"title":"Buy milk"}'
curl localhost:3000/tasks
```

`Ctrl+C` stops it. `docker compose down` removes the containers but keeps the
data (it's in a named volume). `docker compose down -v` deletes the data too.

### Without Docker

The app also runs straight on the host if you have Postgres locally. Point
`DATABASE_URL` in `.env` at it and `npm install && npm start`. If `DATABASE_URL`
is not set at all it falls back to the in-memory store, which is handy for
quick checks but obviously loses everything on restart.

## What's in the compose file

Three services:

- **db** - `postgres:16-alpine`. The data directory is mounted on a named volume
  (`pgdata`) so it survives the container being removed. `db/init/001_tasks.sql`
  is mounted into `docker-entrypoint-initdb.d`, so Postgres creates the `tasks`
  table itself the first time the volume is created.
- **redis** - `redis:7-alpine`. Not used for anything yet, it's the stretch goal
  and I'll want it for the auth assignment. The app pings it from `/health`.
- **app** - built from the `Dockerfile` in this folder. It waits for both
  healthchecks to pass before starting (`depends_on: condition: service_healthy`),
  and on top of that it retries the first database connection ten times, because
  "healthy" and "accepting connections from another container" are not always
  the same second.

Inside the compose network the app talks to `db:5432`, not `localhost:5432`.
That tripped me up at first. The compose file sets `DATABASE_URL` for the app
container explicitly, so the one in `.env` (localhost) is only used when I run
`npm start` on my machine.

## Config

Everything comes from `.env`, which is gitignored. `.env.example` is committed
and has the defaults that work out of the box with the compose file:

```
POSTGRES_USER=tasks
POSTGRES_PASSWORD=tasks
POSTGRES_DB=tasks
DATABASE_URL=postgres://tasks:tasks@localhost:5432/tasks
REDIS_URL=redis://localhost:6379
PORT=3000
```

## The repository swap (and what actually changed from A2)

Being honest about this one: in A2 I had the SQL inline in the route handlers.
There was no in-memory repository to "swap out" because I'd never separated the
two. So the first thing I did for A3 was pull the data access out into a
repository with a fixed set of methods:

```
list({ search, done, sort })   get(id)   create({ title, done })
update(id, { title, done })    remove(id)   stats()   healthcheck()
```

`src/repositories/memory.js` implements that with an array.
`src/repositories/postgres.js` implements it with `pg`. `src/index.js` picks one
based on whether `DATABASE_URL` is set, and `src/app.js` (all the routes) only
ever sees `repo`. It never imports `pg`.

So "service and routes unchanged" is true in the sense that matters: every
endpoint, status code, validation rule and response shape is identical to A2,
and switching from the array to Postgres is a one-line change in `index.js`.
The tests run against both stores with the same assertions. But the route file
itself is new code compared with A2, because A2 didn't have this layering yet.

A couple of Postgres-specific things that stayed inside the repository:
`done` is a real `BOOLEAN` now instead of SQLite's 0/1, timestamps are
`TIMESTAMPTZ`, search uses `ILIKE`, and `PUT` uses `COALESCE($2, title)` so I
can update one field without reading the row first.

## Proving persistence

What I did, in order:

1. `docker compose up --build`
2. Created two tasks with `POST /tasks`, marked one done with `PUT`.
3. `Ctrl+C`, then `docker compose down` - this removes the app and db containers.
4. `docker compose up` again (no `--build` needed).
5. `GET /tasks` - both tasks still there, the `done` flag still set, same ids.
6. For good measure, `docker compose down -v` and up again: table is empty. So
   the data really is living in the volume and nowhere else.

The same check is automated in `test/api.test.js`: it creates rows, kills the
server process, starts a new one against the same database and asserts the rows
are still there. With `REPOSITORY=memory` the same test asserts the opposite
(empty after restart), which is a nice way of showing the difference.

```bash
npm test             # against DATABASE_URL  -> 13 checks
npm run test:memory  # against the array     -> 12 checks
```

Note: `npm test` truncates the `tasks` table, so don't run it against data you
want to keep.

## Stretch: Redis

Added as a third service. The app connects on startup (if `REDIS_URL` is set)
and `/health` pings it. If Redis is down, `/health` returns 503 with
`"redis": "error: ..."` but the API keeps working, since nothing depends on it
yet.

## Stretch: one index, before and after

`scripts/explain.sql` creates a throwaway `tasks_big` table with 500k rows,
runs the same lookup with and without an index on `title`, and drops the table.
`npm run explain` runs it. Output from my run:

Before (no index) - Postgres has to read every row, and even parallelises it
across 2 workers to make it bearable:

```
Gather  (cost=1000.00..7771.27 rows=1 width=39) (actual time=20.470..24.616 rows=1 loops=1)
  Workers Planned: 2
  Workers Launched: 2
  ->  Parallel Seq Scan on tasks_big  (cost=0.00..6771.17 rows=1 width=39) (actual time=16.273..17.099 rows=0 loops=3)
        Filter: (title = 'task number 424242'::text)
        Rows Removed by Filter: 166666
Execution Time: 24.637 ms
```

After `CREATE INDEX tasks_big_title_idx ON tasks_big (title)`:

```
Index Scan using tasks_big_title_idx on tasks_big  (cost=0.42..8.44 rows=1 width=39) (actual time=0.055..0.056 rows=1 loops=1)
  Index Cond: (title = 'task number 424242'::text)
Execution Time: 0.068 ms
```

24.6 ms down to 0.07 ms, roughly 350x, and "Rows Removed by Filter: 166666"
per worker became a single index lookup. I didn't add the index to the real
`tasks` table because with a handful of rows Postgres would just ignore it and
seq scan anyway, which is kind of the lesson: indexes are for when the table is
big enough that the planner thinks they're worth it.

## Layout

```
.
├── docker-compose.yml       app + db (with volume) + redis
├── Dockerfile               node:22-alpine, npm ci, node src/index.js
├── .env.example             copy to .env
├── db/init/001_tasks.sql    schema, run by the postgres container on first init
├── src/
│   ├── index.js             loads .env, picks the repository, starts the server
│   ├── app.js               express routes - only talks to `repo`
│   └── repositories/
│       ├── memory.js
│       └── postgres.js
├── scripts/explain.sql      index before/after
└── test/api.test.js         e2e tests incl. restart
```
