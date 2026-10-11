const express = require("express");
const { supabase } = require("../supabase");

const router = express.Router();

// Pull the token out of "Authorization: Bearer <token>". Returns null if the
// header is missing, isn't Bearer, or has nothing after "Bearer ".
function extractToken(req) {
  const header = req.get("authorization");
  if (!header) return null;
  const [scheme, token, ...rest] = header.trim().split(/\s+/);
  if (!/^bearer$/i.test(scheme) || !token || rest.length) return null;
  return token;
}

// GET /protected/profile - Stage 3: the guard actually checks the pass.
router.get("/profile", async (req, res) => {
  const token = extractToken(req);
  if (!token) return res.status(401).json({ error: "Access token required" });

  // getUser(token) sends the token to Supabase, which checks the signature,
  // expiry and that the session hasn't been revoked. If any of that fails we
  // get an error back instead of a user.
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) {
    return res.status(401).json({ error: "Invalid or expired token" });
  }

  res.json({
    message: "This is your private profile.",
    user: {
      id: data.user.id,
      email: data.user.email,
      created_at: data.user.created_at,
    },
  });
});

module.exports = router;
module.exports.extractToken = extractToken;
