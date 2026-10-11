// End-to-end tests. Boots the server as a child process, hits it over HTTP,
// then kills and restarts it and checks the data is still there.
//
//   npm test            -> uses DATABASE_URL from .env (postgres)
//   npm run test:memory -> in-memory store (restart test is expected to lose data)
//
// Against Postgres it wipes the tasks table first, so don't run it on data you care about.

require("dotenv").config({ quiet: true });
const { spawn } = require("child_process");
const assert = require("assert");
const path = require("path");

const PORT = 3999;
const BASE = `http://localhost:${PORT}`;
const USING_MEMORY = process.env.REPOSITORY === "memory" || !process.env.DATABASE_URL;

function startServer() {
  const child = spawn(process.execPath, [path.join(__dirname, "..", "src", "index.js")], {
    env: { ...process.env, PORT },
    stdio: ["ignore", "pipe", "inherit"],
  });
  return new Promise((resolve, reject) => {
    child.stdout.on("data", (buf) => {
      if (buf.toString().includes("listening")) resolve(child);
    });
    child.on("exit", (code) => reject(new Error(`server exited with ${code}`)));
  });
}

function stopServer(child) {
  return new Promise((resolve) => {
    child.removeAllListeners("exit");
    child.on("exit", resolve);
    child.kill();
  });
}

async function req(method, url, body) {
  const res = await fetch(BASE + url, {
    method,
    headers: body !== undefined ? { "Content-Type": "application/json" } : {},
    body: body !== undefined ? (typeof body === "string" ? body : JSON.stringify(body)) : undefined,
  });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}

async function wipe() {
  if (USING_MEMORY) return;
  const { Pool } = require("pg");
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  await pool.query("CREATE TABLE IF NOT EXISTS tasks (id SERIAL PRIMARY KEY, title TEXT NOT NULL, done BOOLEAN NOT NULL DEFAULT false, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now())");
  await pool.query("TRUNCATE tasks RESTART IDENTITY");
  await pool.end();
}

let passed = 0;
async function check(name, fn) {
  await fn();
  passed++;
  console.log(`  ok  ${name}`);
}

(async () => {
  console.log(`store: ${USING_MEMORY ? "memory" : "postgres"}`);
  await wipe();
  let server = await startServer();

  await check("GET /health reports the database", async () => {
    const r = await req("GET", "/health");
    assert.equal(r.status, 200);
    assert.ok(String(r.body.database).startsWith("ok"));
  });

  await check("starts empty", async () => {
    const r = await req("GET", "/tasks");
    assert.equal(r.status, 200);
    assert.deepEqual(r.body, []);
  });

  await check("POST without title -> 400", async () => {
    const r = await req("POST", "/tasks", {});
    assert.equal(r.status, 400);
  });

  await check("POST bad json -> 400", async () => {
    const r = await req("POST", "/tasks", "{nope");
    assert.equal(r.status, 400);
  });

  const made = [];
  await check("POST creates tasks -> 201", async () => {
    for (const [title, done] of [["Write the compose file", true], ["Buy milk", false], ["Prove persistence", false]]) {
      const r = await req("POST", "/tasks", { title, done });
      assert.equal(r.status, 201);
      assert.equal(r.body.title, title);
      assert.equal(r.body.done, done);
      assert.ok(r.body.created_at);
      made.push(r.body);
    }
  });

  await check("GET /tasks/:id", async () => {
    const r = await req("GET", `/tasks/${made[1].id}`);
    assert.equal(r.status, 200);
    assert.equal(r.body.title, "Buy milk");
  });

  await check("unknown id -> 404", async () => {
    for (const u of ["/tasks/9999", "/tasks/abc"]) {
      const r = await req("GET", u);
      assert.equal(r.status, 404);
      assert.deepEqual(r.body, { error: "Task not found" });
    }
  });

  await check("PUT updates only the fields sent", async () => {
    const r = await req("PUT", `/tasks/${made[1].id}`, { done: true });
    assert.equal(r.status, 200);
    assert.equal(r.body.done, true);
    assert.equal(r.body.title, "Buy milk");
    assert.ok(r.body.updated_at >= r.body.created_at);
  });

  await check("PUT wrong type -> 400, unknown id -> 404", async () => {
    assert.equal((await req("PUT", `/tasks/${made[1].id}`, { done: "yes" })).status, 400);
    assert.equal((await req("PUT", "/tasks/9999", { done: true })).status, 404);
  });

  await check("?search= ?done= ?sort=", async () => {
    assert.equal((await req("GET", "/tasks?search=MILK")).body.length, 1);
    assert.equal((await req("GET", "/tasks?done=false")).body.length, 1);
    const titles = (await req("GET", "/tasks?sort=title")).body.map((t) => t.title.toLowerCase());
    assert.deepEqual(titles, [...titles].sort());
    assert.equal((await req("GET", "/tasks?done=maybe")).status, 400);
  });

  await check("GET /stats", async () => {
    const r = await req("GET", "/stats");
    assert.deepEqual(r.body, { total: 3, done: 2, pending: 1 });
  });

  await stopServer(server);
  server = await startServer();
  console.log("-- app restarted --");

  if (USING_MEMORY) {
    await check("memory store loses data on restart (expected)", async () => {
      assert.deepEqual((await req("GET", "/tasks")).body, []);
    });
  } else {
    await check("rows survive an app restart", async () => {
      const r = await req("GET", "/tasks");
      assert.equal(r.body.length, 3);
      const t = r.body.find((t) => t.id === made[1].id);
      assert.equal(t.done, true);
    });

    await check("DELETE -> 204, then 404", async () => {
      assert.equal((await req("DELETE", `/tasks/${made[0].id}`)).status, 204);
      assert.equal((await req("DELETE", `/tasks/${made[0].id}`)).status, 404);
      assert.equal((await req("GET", "/tasks")).body.length, 2);
    });
  }

  await stopServer(server);
  console.log(`\n${passed} checks passed`);
})().catch((err) => {
  console.error("\nFAILED:", err.message);
  process.exit(1);
});
