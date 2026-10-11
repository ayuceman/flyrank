import express from "express";
import triageRoutes from "./routes/triage.js";

export function createApp() {
  const app = express();
  app.use(express.json({ limit: "16kb" }));

  app.get("/", (req, res) => res.json({ message: "BE-07 - POST /triage" }));
  app.get("/health", (req, res) => res.json({ status: "ok", llm_enabled: process.env.LLM_ENABLED !== "false", stub: process.env.LLM_STUB === "1" }));

  app.use("/triage", triageRoutes);

  app.use((req, res) => res.status(404).json({ error: "Not found" }));
  app.use((err, req, res, next) => {
    if (err.type === "entity.parse.failed") return res.status(400).json({ error: "Invalid JSON body" });
    if (err.type === "entity.too.large") return res.status(413).json({ error: "Body too large" });
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  });
  return app;
}
