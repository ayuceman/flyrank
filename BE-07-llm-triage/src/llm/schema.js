// The contract. Written before the model was ever called, copied from JOB-CARD.md.
import { z } from "zod";

export const CATEGORIES = ["billing", "bug", "feature", "account", "other"];
export const URGENCIES = ["low", "normal", "high"];

// what the caller sends
export const TriageInput = z.object({
  text: z.string().min(1, "text must not be empty").max(2000, "text must be at most 2000 characters"),
}).strict();

// what the caller gets back. .strict() so an extra field the model invents is a failure, not a bonus.
export const TriageOutput = z.object({
  category: z.enum(CATEGORIES),
  urgency: z.enum(URGENCIES),
  confidence: z.number().min(0).max(1),
  reason: z.string().min(1).max(200),
}).strict();

// used by stub mode and by the kill switch
export const FALLBACK = {
  category: "other",
  urgency: "normal",
  confidence: 0,
  reason: "Model unavailable, routed to the default queue for a human to look at.",
};

// flatten a zod error into "field: message" lines a human can read
export function describeIssues(error) {
  return error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`);
}
