const express = require("express");
const { supabase } = require("../supabase");
const { requireAuth } = require("../middleware/requireAuth");

const router = express.Router();

// very light validation, the real rules (password length etc.) live in Supabase
function validCredentials(body) {
  return (
    body &&
    typeof body.email === "string" && body.email.trim() !== "" &&
    typeof body.password === "string" && body.password !== ""
  );
}

// POST /auth/signup  -> 201 { user }
router.post("/signup", async (req, res) => {
  if (!validCredentials(req.body)) {
    return res.status(400).json({ error: "email and password are required" });
  }
  const { email, password } = req.body;

  const { data, error } = await supabase.auth.signUp({ email: email.trim(), password });
  if (error) {
    // 422 from supabase = bad input (weak password, bad email, already registered...)
    const status = error.status === 422 || error.status === 400 ? 400 : 500;
    return res.status(status).json({ error: error.message });
  }

  res.status(201).json({
    message: data.session
      ? "Signup successful"
      : "Signup successful, check your email to confirm the account before logging in",
    user: { id: data.user.id, email: data.user.email },
    // session is null when the project has email confirmation turned on
    access_token: data.session ? data.session.access_token : null,
  });
});

// POST /auth/login  -> 200 { access_token, refresh_token, user }
router.post("/login", async (req, res) => {
  if (!validCredentials(req.body)) {
    return res.status(400).json({ error: "email and password are required" });
  }
  const { email, password } = req.body;

  const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
  if (error) {
    // don't leak whether the email exists
    return res.status(401).json({ error: "Invalid login credentials" });
  }

  res.json({
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token,
    token_type: "bearer",
    expires_in: data.session.expires_in,
    user: { id: data.user.id, email: data.user.email },
  });
});

// POST /auth/logout  -> 204
// Needs a valid token (so it goes through the same guard). Supabase then
// revokes the session server-side; that token is dead from here on.
router.post("/logout", requireAuth, async (req, res, next) => {
  try {
    // supabase.auth.signOut() in supabase-js v2 signs out the *client's* own
    // stored session, and this server keeps none (persistSession: false).
    // So I call the same endpoint the SDK calls, with the caller's token.
    const resp = await fetch(`${process.env.SUPABASE_URL}/auth/v1/logout`, {
      method: "POST",
      headers: { apikey: process.env.SUPABASE_KEY, Authorization: `Bearer ${req.token}` },
    });
    if (!resp.ok) {
      return res.status(502).json({ error: `Logout failed upstream (${resp.status})` });
    }
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

module.exports = router;
