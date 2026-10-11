const { supabase } = require("../supabase");

// Pull the token out of "Authorization: Bearer <token>". Returns null if the
// header is missing, isn't Bearer, or has nothing after "Bearer ".
function extractToken(req) {
  const header = req.get("authorization");
  if (!header) return null;
  const [scheme, token, ...rest] = header.trim().split(/\s+/);
  if (!/^bearer$/i.test(scheme) || !token || rest.length) return null;
  return token;
}

// Express middleware. Put it in front of any route that needs a logged-in
// user. On success it sets req.user and req.token and calls next(); otherwise
// it answers 401 and the route never runs.
async function requireAuth(req, res, next) {
  const token = extractToken(req);
  if (!token) return res.status(401).json({ error: "Access token required" });

  try {
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data.user) {
      return res.status(401).json({ error: "Invalid or expired token" });
    }
    req.user = data.user;
    req.token = token;
    next();
  } catch (err) {
    next(err);
  }
}

module.exports = { requireAuth, extractToken };
