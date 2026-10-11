const express = require("express");
const { serve } = require("inngest/express");
const store = require("./store");
const { inngest, functions } = require("./inngest");

const app = express();
app.use(express.json());

app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

app.post("/reports", async (req, res) => {
  const topic = req.body && req.body.topic;
  if (typeof topic !== "string" || topic.trim() === "") {
    return res
      .status(400)
      .json({ error: "Field 'topic' is required and must be a non-empty string" });
  }

  const report = store.create(topic.trim());

  try {
    await inngest.send({
      name: "report/requested",
      data: { id: report.id, topic: report.topic },
    });
  } catch (err) {
    console.error("Failed to send Inngest event:", err.message);
    store.update(report.id, { status: "failed", error: "Could not enqueue job" });
    return res.status(503).json({ error: "Could not enqueue report job" });
  }

  res.status(202).json({ id: report.id, status: "pending" });
});

app.get("/reports/:id", (req, res) => {
  const report = store.get(req.params.id);
  if (!report) return res.status(404).json({ error: "Report not found" });
  res.json(report);
});

// Inngest endpoint: the dev server discovers and invokes functions here.
app.use("/api/inngest", serve({ client: inngest, functions }));

const PORT = 3000;
app.listen(PORT, () => {
  console.log(`API listening on http://localhost:${PORT}`);
  console.log(`Inngest functions served at http://localhost:${PORT}/api/inngest`);
});
