const express = require("express");

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

// GET /protected/profile - Stage 2: only checks the header is there.
// Stage 3 will actually verify the token.
router.get("/profile", (req, res) => {
  const token = extractToken(req);
  if (!token) return res.status(401).json({ error: "Access token required" });
  res.json({ message: "token received (not verified yet)" });
});

module.exports = router;
module.exports.extractToken = extractToken;
