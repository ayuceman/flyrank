import express from "express";
import { TriageInput, FALLBACK, describeIssues } from "../llm/schema.js";
import { runTriage } from "../llm/triage.js";
import { PROMPT_VERSION } from "../llm/client.js";

const router = express.Router();

// POST /triage
router.post("/", async (req, res, next) => {
  // 1. validate the input before anything else. a rejected request is a model call I didn't pay for.
  const parsed = TriageInput.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid input", issues: describeIssues(parsed.error) });
  }

  res.set("X-Prompt-Version", PROMPT_VERSION);

  // stub mode: skip the model entirely, return something that satisfies the schema
  if (process.env.LLM_STUB === "1") {
    res.set("X-Triage-Source", "stub");
    return res.json({ ...FALLBACK, confidence: 0.5, reason: "Stub mode, no model was called." });
  }

  try {
    const result = await runTriage(parsed.data.text);
    if (!result.ok) {
      return res.status(result.status).json({ error: result.error, detail: result.detail });
    }
    res.set("X-Triage-Source", result.repaired ? "model-repaired" : "model");
    res.json(result.data);
  } catch (err) {
    next(err);
  }
});

export default router;
