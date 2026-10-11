// db.js — Stage 0: create the SQLite database and the tasks table.
//
// SQLite stores the whole database in a single file (tasks.db) that lives
// next to this file. There is no separate database server to install or run:
// better-sqlite3 opens the file directly, and creates it if it does not exist.

const path = require("path");
const Database = require("better-sqlite3");

// Allow tests (or deployments) to point at a different file, e.g. ":memory:".
const DB_PATH = process.env.DB_PATH || path.join(__dirname, "tasks.db");

const db = new Database(DB_PATH);

// WAL mode gives better concurrent read performance and is safe for a single
// Node process. Purely an optimisation — the API works without it.
db.pragma("journal_mode = WAL");

// 1) Create the table if it doesn't already exist.
//    SQLite has no BOOLEAN type; the convention is INTEGER 0 / 1.
db.exec(`
  CREATE TABLE IF NOT EXISTS tasks (
    id    INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT    NOT NULL,
    done  INTEGER NOT NULL DEFAULT 0 CHECK (done IN (0, 1))
  )
`);

// 2) Insert three example tasks — but ONLY if the table is empty.
//    Restarting the server many times must not duplicate the seed rows.
const { count } = db.prepare("SELECT COUNT(*) AS count FROM tasks").get();

if (count === 0) {
  const insert = db.prepare("INSERT INTO tasks (title, done) VALUES (?, ?)");
  const seed = db.transaction((rows) => {
    for (const [title, done] of rows) insert.run(title, done);
  });
  seed([
    ["Learn SQL basics", 1],
    ["Connect the CRUD API to SQLite", 0],
    ["Write the README for Week 3", 0],
  ]);
  console.log("tasks.db was empty — inserted 3 example tasks");
} else {
  console.log(`tasks.db already has ${count} task(s) — skipping seed`);
}

module.exports = db;
