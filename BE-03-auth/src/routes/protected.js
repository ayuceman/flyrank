const express = require("express");
const { requireAuth } = require("../middleware/requireAuth");

const router = express.Router();

// Everything under /protected goes through the guard first.
router.use(requireAuth);

// GET /protected/profile
router.get("/profile", (req, res) => {
  res.json({
    message: "This is your private profile.",
    user: {
      id: req.user.id,
      email: req.user.email,
      created_at: req.user.created_at,
    },
  });
});

// GET /protected/dashboard - a second locked door, to show the middleware
// works for any route without repeating the token logic.
router.get("/dashboard", (req, res) => {
  res.json({
    message: `Welcome back, ${req.user.email}`,
    stats: { logins_today: 1, unread: 0 },
    server_time: new Date().toISOString(),
  });
});

module.exports = router;
