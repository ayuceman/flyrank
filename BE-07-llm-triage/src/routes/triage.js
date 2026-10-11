import express from "express";
import { TriageInput, FALLBACK, describeIssues } from "../llm/schema.js";
import { runTriage } from "../llm/triage.js";
import { PROMPT_VERSION, LLMError } from "../llm/client.js";

const router = express.Router();

// POST /triage
router.post("/", async (req, res, next) => {
  // 1. validate the input before anything else. a rejected request is a model call I didn't pay for.
  const parsed = TriageInput.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid input", issues: describeIssues(parsed.error) });
  }

  res.set("X-Prompt-Version", PROMPT_VERSION);

  // kill switch: somebody who is not me can turn the model off without a deploy.
  // deterministic fallback so the rest of the system keeps working.
  if (process.env.LLM_ENABLED === "false") {
    res.set("X-Triage-Source", "fallback");
    return res.json(FALLBACK);
  }

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
    if (err instanceof LLMError) {
      // 504 for a timeout, 502 for everything else upstream. never the raw provider error.
      return res.status(err.status === 504 ? 504 : 502).json({ error: err.message });
    }
    next(err);
  }
});

export default router;
