const express = require("express");
const { supabase } = require("../supabase");

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

module.exports = router;
