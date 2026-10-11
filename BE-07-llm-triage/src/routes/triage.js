import express from "express";
import { TriageInput, FALLBACK, describeIssues } from "../llm/schema.js";
import { complete, loadPrompt, PROMPT_VERSION } from "../llm/client.js";

const router = express.Router();
const systemPrompt = loadPrompt();

// POST /triage
router.post("/", async (req, res, next) => {
  // 1. validate the input before anything else. a rejected request is a model call I didn't pay for.
  const parsed = TriageInput.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid input", issues: describeIssues(parsed.error) });
  }

  // stub mode: skip the model entirely, return something that satisfies the schema
  if (process.env.LLM_STUB === "1") {
    res.set("X-Triage-Source", "stub");
    return res.json({ ...FALLBACK, confidence: 0.5, reason: "Stub mode, no model was called." });
  }

  try {
    // Stage 2: call the model and return whatever came back. Stage 3 makes this trustworthy.
    const { text } = await complete({ systemPrompt, userText: parsed.data.text });
    res.set("X-Prompt-Version", PROMPT_VERSION);
    res.type("text/plain").send(text);
  } catch (err) {
    next(err);
  }
});

export default router;
