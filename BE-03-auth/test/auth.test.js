// End-to-end tests. Starts test/fake-supabase.js (a stand-in for the Supabase
// Auth endpoints) and the real server pointed at it, then walks through every
// checkpoint from the assignment.
//
//   npm test
//
// To run the same checks against a real Supabase project instead, set
// SUPABASE_URL and SUPABASE_KEY in the environment and REAL=1. Signup will
// create a throwaway user there, so use a project you don't mind polluting.

const { spawn } = require("child_process");
const assert = require("assert");
const path = require("path");
const { createFakeSupabase } = require("./fake-supabase");

const REAL = process.env.REAL === "1";
const FAKE_PORT = 54399;
const PORT = 3199;
const BASE = `http://localhost:${PORT}`;

function startServer(env) {
  const child = spawn(process.execPath, [path.join(__dirname, "..", "src", "index.js")], {
    env: { ...process.env, ...env, PORT },
    stdio: ["ignore", "pipe", "inherit"],
  });
  return new Promise((resolve, reject) => {
    child.stdout.on("data", (buf) => {
      if (buf.toString().includes("connected to Supabase")) resolve(child);
    });
    child.on("exit", (code) => reject(new Error(`server exited with ${code}`)));
  });
}

async function req(method, url, { body, token } = {}) {
  const headers = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (token !== undefined) headers["Authorization"] = token;
  const res = await fetch(BASE + url, {
    method,
    headers,
    body: body !== undefined ? (typeof body === "string" ? body : JSON.stringify(body)) : undefined,
  });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null, text };
}

let passed = 0;
async function check(name, fn) {
  await fn();
  passed++;
  console.log(`  ok  ${name}`);
}

(async () => {
  let fake = null;
  let env;
  if (REAL) {
    env = { SUPABASE_URL: process.env.SUPABASE_URL, SUPABASE_KEY: process.env.SUPABASE_KEY };
    console.log("running against real Supabase:", env.SUPABASE_URL);
  } else {
    fake = createFakeSupabase().listen(FAKE_PORT);
    env = { SUPABASE_URL: `http://localhost:${FAKE_PORT}`, SUPABASE_KEY: "fake-anon-key" };
    console.log("running against test/fake-supabase.js");
  }

  const server = await startServer(env);
  const email = `test-${Date.now()}@example.com`;
  const password = "a-decent-password-123";

  await check("GET /public/info -> 200 without a token", async () => {
    const r = await req("GET", "/public/info");
    assert.equal(r.status, 200);
    assert.equal(r.body.message, "Welcome stranger! This info is public.");
  });

  await check("POST /auth/signup without password -> 400", async () => {
    assert.equal((await req("POST", "/auth/signup", { body: { email } })).status, 400);
    assert.equal((await req("POST", "/auth/signup", { body: {} })).status, 400);
    assert.equal((await req("POST", "/auth/signup", { body: "{bad" })).status, 400);
  });

  await check("POST /auth/signup -> 201", async () => {
    const r = await req("POST", "/auth/signup", { body: { email, password } });
    assert.equal(r.status, 201, r.text);
    assert.equal(r.body.user.email, email);
  });

  await check("POST /auth/signup same email again -> 400", async () => {
    const r = await req("POST", "/auth/signup", { body: { email, password } });
    // real supabase sometimes answers 200 with an obfuscated user for existing
    // emails (anti-enumeration), so only insist on 400 against the fake
    if (!REAL) assert.equal(r.status, 400);
  });

  await check("POST /auth/login with empty fields -> 400", async () => {
    assert.equal((await req("POST", "/auth/login", { body: { email: "", password: "" } })).status, 400);
  });

  await check("POST /auth/login wrong password -> 401 Invalid login credentials", async () => {
    const r = await req("POST", "/auth/login", { body: { email, password: "wrong" } });
    assert.equal(r.status, 401);
    assert.deepEqual(r.body, { error: "Invalid login credentials" });
  });

  let token;
  await check("POST /auth/login -> 200 with access_token", async () => {
    const r = await req("POST", "/auth/login", { body: { email, password } });
    assert.equal(r.status, 200, r.text);
    assert.ok(r.body.access_token);
    assert.ok(r.body.refresh_token);
    token = r.body.access_token;
  });

  await check("GET /protected/profile without header -> 401 Access token required", async () => {
    const r = await req("GET", "/protected/profile");
    assert.equal(r.status, 401);
    assert.deepEqual(r.body, { error: "Access token required" });
  });

  await check("malformed Authorization headers -> 401 Access token required", async () => {
    for (const bad of ["Bearer", "Bearer ", "Basic abc", token, `Bearer ${token} extra`]) {
      const r = await req("GET", "/protected/profile", { token: bad });
      assert.equal(r.status, 401, `header "${bad}" gave ${r.status}`);
      assert.deepEqual(r.body, { error: "Access token required" });
    }
  });

  await check("tampered token -> 401 Invalid or expired token", async () => {
    const r = await req("GET", "/protected/profile", { token: `Bearer ${token}x` });
    assert.equal(r.status, 401);
    assert.deepEqual(r.body, { error: "Invalid or expired token" });
  });

  await check("GET /protected/profile with token -> 200 and my email", async () => {
    const r = await req("GET", "/protected/profile", { token: `Bearer ${token}` });
    assert.equal(r.status, 200, r.text);
    assert.equal(r.body.user.email, email);
  });

  await check("GET /protected/dashboard with token -> 200 (middleware reused)", async () => {
    const r = await req("GET", "/protected/dashboard", { token: `Bearer ${token}` });
    assert.equal(r.status, 200);
    assert.equal((await req("GET", "/protected/dashboard")).status, 401);
  });

  await check("GET /docs serves Swagger UI, /openapi.json has bearerAuth", async () => {
    const html = await (await fetch(`${BASE}/docs/`)).text();
    assert.ok(html.includes("swagger-ui"));
    const spec = (await req("GET", "/openapi.json")).body;
    assert.equal(spec.components.securitySchemes.bearerAuth.scheme, "bearer");
    assert.deepEqual(spec.paths["/protected/profile"].get.security, [{ bearerAuth: [] }]);
  });

  await check("POST /auth/logout -> 204, token no longer works", async () => {
    const r = await req("POST", "/auth/logout", { token: `Bearer ${token}` });
    assert.equal(r.status, 204, r.text);
    const after = await req("GET", "/protected/profile", { token: `Bearer ${token}` });
    assert.equal(after.status, 401);
  });

  await check("POST /auth/logout without token -> 401", async () => {
    assert.equal((await req("POST", "/auth/logout")).status, 401);
  });

  server.kill();
  if (fake) fake.close();
  console.log(`\n${passed} checks passed`);
})().catch((err) => {
  console.error("\nFAILED:", err.message);
  process.exit(1);
});
