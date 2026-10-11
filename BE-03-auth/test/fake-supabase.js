// A tiny stand-in for the Supabase Auth (GoTrue) endpoints that supabase-js
// calls, so the test suite can run without network or a real project.
// It is deliberately dumb: plaintext passwords in memory, random tokens.
// It only exists for tests. Nothing in src/ knows about it.

const express = require("express");
const crypto = require("crypto");

function createFakeSupabase() {
  const app = express();
  app.use(express.json());

  const users = new Map(); // email -> { id, email, password }
  const tokens = new Map(); // access_token -> email

  const requireApiKey = (req, res, next) => {
    if (req.get("apikey") !== "fake-anon-key") return res.status(401).json({ message: "Invalid API key" });
    next();
  };
  app.use(requireApiKey);

  const session = (user) => {
    const access_token = "tok_" + crypto.randomBytes(16).toString("hex");
    tokens.set(access_token, user.email);
    return {
      access_token,
      refresh_token: "ref_" + crypto.randomBytes(8).toString("hex"),
      token_type: "bearer",
      expires_in: 3600,
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      user: publicUser(user),
    };
  };
  const publicUser = (u) => ({ id: u.id, email: u.email, aud: "authenticated", role: "authenticated", created_at: new Date().toISOString() });

  app.get("/auth/v1/settings", (req, res) => res.json({ external: { email: true } }));

  app.post("/auth/v1/signup", (req, res) => {
    const { email, password } = req.body || {};
    if (!email || !password) return res.status(422).json({ code: 422, msg: "Signup requires a valid password" });
    if (password.length < 6) return res.status(422).json({ code: 422, msg: "Password should be at least 6 characters." });
    if (users.has(email)) return res.status(422).json({ code: 422, msg: "User already registered" });
    const user = { id: crypto.randomUUID(), email, password };
    users.set(email, user);
    // autoconfirm on, like a fresh project with "confirm email" switched off
    res.json(session(user));
  });

  app.post("/auth/v1/token", (req, res) => {
    if (req.query.grant_type !== "password") return res.status(400).json({ msg: "unsupported grant" });
    const { email, password } = req.body || {};
    const user = users.get(email);
    if (!user || user.password !== password) {
      return res.status(400).json({ code: 400, error_code: "invalid_credentials", msg: "Invalid login credentials" });
    }
    res.json(session(user));
  });

  const bearer = (req) => {
    const h = req.get("authorization") || "";
    return h.startsWith("Bearer ") ? h.slice(7) : null;
  };

  app.get("/auth/v1/user", (req, res) => {
    const email = tokens.get(bearer(req));
    if (!email) return res.status(401).json({ code: 401, msg: "invalid JWT" });
    res.json(publicUser(users.get(email)));
  });

  app.post("/auth/v1/logout", (req, res) => {
    const t = bearer(req);
    if (!tokens.has(t)) return res.status(401).json({ code: 401, msg: "invalid JWT" });
    tokens.delete(t);
    res.status(204).send();
  });

  return app;
}

module.exports = { createFakeSupabase };

if (require.main === module) {
  const port = process.env.FAKE_PORT || 54321;
  createFakeSupabase().listen(port, () => console.log(`fake supabase on http://localhost:${port}`));
}
