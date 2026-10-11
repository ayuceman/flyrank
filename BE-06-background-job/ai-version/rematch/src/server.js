const express = require("express");
const crypto = require("crypto");
const { serve } = require("inngest/express");
const { inngest } = require("./inngest/client");
const { functions } = require("./inngest/functions");
const store = require("./store");

const app = express();
app.use(express.json());

app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

app.post("/reports", async (req, res) => {
  const topic = req.body && typeof req.body.topic === "string" ? req.body.topic.trim() : "";
  if (!topic) {
    return res.status(400).json({ error: "topic is required" });
  }

  const id = crypto.randomUUID();
  store.createReport({ id, topic });

  // Hand off to the background job; nothing slow happens here.
  await inngest.send({ name: "report/requested", data: { id, topic } });

  res.status(202).json({ id, status: "pending" });
});

app.get("/reports", (req, res) => {
  res.json(store.listReports());
});

app.get("/reports/:id", (req, res) => {
  const report = store.getReport(req.params.id);
  if (!report) {
    return res.status(404).json({ error: "Report not found" });
  }
  res.json(report);
});

app.use("/api/inngest", serve({ client: inngest, functions }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`report-api listening on http://localhost:${PORT}`);
});
