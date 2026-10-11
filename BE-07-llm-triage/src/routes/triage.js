import express from "express";
import { TriageInput, FALLBACK, describeIssues } from "../llm/schema.js";

const router = express.Router();

// POST /triage
router.post("/", async (req, res) => {
  // 1. validate the input before anything else. a rejected request is a model call I didn't pay for.
  const parsed = TriageInput.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid input", issues: describeIssues(parsed.error) });
  }

  // stub mode: skip the model entirely, return something that satisfies the schema
  if (process.env.LLM_STUB === "1") {
    return res.json({ ...FALLBACK, confidence: 0.5, reason: "Stub mode, no model was called.", meta: { stub: true } });
  }

  // Stage 2 wires the model in here
  res.status(501).json({ error: "Model call not implemented yet, set LLM_STUB=1" });
});

export default router;
