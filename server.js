// server.js — Tasks CRUD API (Week 3: now backed by SQLite instead of an array)
const express = require("express");
const db = require("./db"); // opening db.js creates tasks.db + seeds it on first run

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

app.get("/", (req, res) => {
  res.json({ message: "Tasks API — Week 3, backed by SQLite" });
});

app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});

module.exports = app;
