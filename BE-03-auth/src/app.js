const express = require("express");
const authRoutes = require("./routes/auth");

function createApp() {
  const app = express();
  app.use(express.json());

  app.get("/", (req, res) => {
    res.json({ message: "Auth API - BE-03", docs: "/docs" });
  });

  app.use("/auth", authRoutes);

  app.use((req, res) => res.status(404).json({ error: "Not found" }));

  app.use((err, req, res, next) => {
    if (err.type === "entity.parse.failed") {
      return res.status(400).json({ error: "Invalid JSON body" });
    }
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  });

  return app;
}

module.exports = { createApp };
