// test/api.test.js — end-to-end checks for the Tasks API.
//
// Starts the server as a child process against a throw-away database file,
// runs every checkpoint from the assignment (including "data survives a
// restart"), then restarts the server and checks again.
//
//   npm test

const { spawn } = require("child_process");
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const PORT = 3999;
const BASE = `http://localhost:${PORT}`;
const DB_PATH = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "tasks-test-")), "tasks.db");

function startServer() {
  const child = spawn(process.execPath, [path.join(__dirname, "..", "server.js")], {
    env: { ...process.env, PORT, DB_PATH },
    stdio: ["ignore", "pipe", "inherit"],
  });
  return new Promise((resolve) => {
    child.stdout.on("data", (buf) => {
      if (buf.toString().includes("listening")) resolve(child);
    });
  });
}

function stopServer(child) {
  return new Promise((resolve) => {
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

let passed = 0;
async function check(name, fn) {
  await fn();
  passed++;
  console.log(`  ✓ ${name}`);
}

(async () => {
  let server = await startServer();
  console.log("Run 1 — fresh database");

  await check("seeds exactly three example tasks on first run", async () => {
    const r = await req("GET", "/tasks");
    assert.equal(r.status, 200);
    assert.equal(r.body.length, 3);
  });

  await check("GET /tasks/:id returns one task", async () => {
    const r = await req("GET", "/tasks/1");
    assert.equal(r.status, 200);
    assert.equal(r.body.id, 1);
    assert.equal(typeof r.body.done, "boolean");
  });

  await check("unknown id -> 404 { error: 'Task not found' }", async () => {
    const r = await req("GET", "/tasks/999");
    assert.equal(r.status, 404);
    assert.deepEqual(r.body, { error: "Task not found" });
  });

  await check("POST without title -> 400", async () => {
    const r = await req("POST", "/tasks", {});
    assert.equal(r.status, 400);
    assert.ok(r.body.error);
  });

  await check("POST with malformed JSON -> 400", async () => {
    const r = await req("POST", "/tasks", "{not json");
    assert.equal(r.status, 400);
  });

  let created;
  await check("POST valid task -> 201 with the new row", async () => {
    const r = await req("POST", "/tasks", { title: "Buy milk" });
    assert.equal(r.status, 201);
    assert.equal(r.body.title, "Buy milk");
    assert.equal(r.body.done, false);
    assert.ok(r.body.created_at);
    created = r.body;
  });

  await check("PUT updates title and done", async () => {
    const r = await req("PUT", `/tasks/${created.id}`, { title: "Buy oat milk", done: true });
    assert.equal(r.status, 200);
    assert.equal(r.body.title, "Buy oat milk");
    assert.equal(r.body.done, true);
  });

  await check("PUT with wrong type -> 400", async () => {
    const r = await req("PUT", `/tasks/${created.id}`, { done: "yes" });
    assert.equal(r.status, 400);
  });

  await check("PUT unknown id -> 404", async () => {
    const r = await req("PUT", "/tasks/999", { done: true });
    assert.equal(r.status, 404);
  });

  await check("GET /tasks?search= filters with LIKE", async () => {
    const r = await req("GET", "/tasks?search=milk");
    assert.equal(r.body.length, 1);
    assert.equal(r.body[0].id, created.id);
  });

  await check("GET /tasks?done=true filters with WHERE", async () => {
    const r = await req("GET", "/tasks?done=true");
    assert.ok(r.body.every((t) => t.done === true));
    assert.ok(r.body.some((t) => t.id === created.id));
  });

  await check("GET /tasks?sort=title orders alphabetically", async () => {
    const r = await req("GET", "/tasks?sort=title");
    const titles = r.body.map((t) => t.title.toLowerCase());
    assert.deepEqual(titles, [...titles].sort());
  });

  await check("GET /stats counts via SQL", async () => {
    const r = await req("GET", "/stats");
    assert.equal(r.body.total, 4);
    assert.equal(r.body.done + r.body.pending, r.body.total);
  });

  await stopServer(server);
  server = await startServer();
  console.log("Run 2 — server restarted, same database file");

  await check("data survives a restart (4 tasks, seed not duplicated)", async () => {
    const r = await req("GET", "/tasks");
    assert.equal(r.body.length, 4);
  });

  await check("updated task persisted", async () => {
    const r = await req("GET", `/tasks/${created.id}`);
    assert.equal(r.body.title, "Buy oat milk");
    assert.equal(r.body.done, true);
  });

  await check("DELETE removes the row -> 204, then 404", async () => {
    const r1 = await req("DELETE", `/tasks/${created.id}`);
    assert.equal(r1.status, 204);
    const r2 = await req("DELETE", `/tasks/${created.id}`);
    assert.equal(r2.status, 404);
    const r3 = await req("GET", "/tasks");
    assert.equal(r3.body.length, 3);
  });

  await stopServer(server);
  fs.rmSync(path.dirname(DB_PATH), { recursive: true, force: true });
  console.log(`\n${passed} checks passed`);
})().catch((err) => {
  console.error("\n✗ test failed:", err.message);
  process.exit(1);
});
