-- Schema for the tasks API.
-- The Postgres container runs this automatically the first time the volume is
-- created (docker-entrypoint-initdb.d). The app also runs it on startup, and
-- everything in here is safe to run twice.

CREATE TABLE IF NOT EXISTS tasks (
  id         SERIAL PRIMARY KEY,
  title      TEXT        NOT NULL,
  done       BOOLEAN     NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
