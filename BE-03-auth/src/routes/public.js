const express = require("express");

const router = express.Router();

// GET /public/info - no auth, anyone can hit this
router.get("/info", (req, res) => {
  res.json({ message: "Welcome stranger! This info is public." });
});

module.exports = router;
