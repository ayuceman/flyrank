// Postgres repository. Same methods as memory.js, backed by a pg Pool.
const fs = require("fs");
const path = require("path");
const { Pool } = require("pg");

const SCHEMA_FILE = path.join(__dirname, "..", "..", "db", "init", "001_tasks.sql");
const COLS = "id, title, done, created_at, updated_at";

function createPostgresRepository(connectionString) {
  const pool = new Pool({ connectionString });

  return {
    // run the schema file so the table exists even if the container was
    // started with an old volume or I'm pointing at a non-docker postgres
    async init() {
      const sql = fs.readFileSync(SCHEMA_FILE, "utf8");
      await pool.query(sql);
    },

    async list({ search, done, sort } = {}) {
      const where = [];
      const params = [];
      if (search) {
        params.push(`%${search}%`);
        where.push(`title ILIKE $${params.length}`);
      }
      if (done !== undefined) {
        params.push(done);
        where.push(`done = $${params.length}`);
      }
      const orderBy = sort === "title" ? "lower(title), id" : "id";
      const sql =
        `SELECT ${COLS} FROM tasks` +
        (where.length ? ` WHERE ${where.join(" AND ")}` : "") +
        ` ORDER BY ${orderBy}`;
      const { rows } = await pool.query(sql, params);
      return rows;
    },

    async get(id) {
      const { rows } = await pool.query(`SELECT ${COLS} FROM tasks WHERE id = $1`, [id]);
      return rows[0] || null;
    },

    async create({ title, done }) {
      const { rows } = await pool.query(
        `INSERT INTO tasks (title, done) VALUES ($1, $2) RETURNING ${COLS}`,
        [title, done]
      );
      return rows[0];
    },

    async update(id, { title, done }) {
      // COALESCE keeps the old value for any field that wasn't sent
      const { rows } = await pool.query(
        `UPDATE tasks
            SET title = COALESCE($2, title),
                done = COALESCE($3, done),
                updated_at = now()
          WHERE id = $1
          RETURNING ${COLS}`,
        [id, title ?? null, done ?? null]
      );
      return rows[0] || null;
    },

    async remove(id) {
      const { rowCount } = await pool.query("DELETE FROM tasks WHERE id = $1", [id]);
      return rowCount > 0;
    },

    async stats() {
      const { rows } = await pool.query(`
        SELECT COUNT(*)::int                          AS total,
               COUNT(*) FILTER (WHERE done)::int      AS done,
               COUNT(*) FILTER (WHERE NOT done)::int  AS pending
          FROM tasks
      `);
      return rows[0];
    },

    async healthcheck() {
      await pool.query("SELECT 1");
      return "ok (postgres)";
    },

    async close() {
      await pool.end();
    },
  };
}

module.exports = { createPostgresRepository };
