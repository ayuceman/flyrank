// The pipeline: call -> parse -> validate -> repair once -> give up cleanly.
// The route calls runTriage() and gets either { ok: true, data } or
// { ok: false, status, error }. Raw model text never leaves this file.
import fs from "node:fs";
import path from "node:path";
import { TriageOutput, describeIssues } from "./schema.js";
import { complete, loadPrompt, PROMPT_VERSION } from "./client.js";

const QUARANTINE = path.resolve(import.meta.dirname, "..", "..", "logs", "quarantine.jsonl");
const systemPrompt = loadPrompt();

// Models like to wrap JSON in a code fence or add "Sure! Here's the JSON:".
// Strip that and find the first {...} block. Returns { value } or { error }.
export function extractJson(text) {
  if (typeof text !== "string") return { error: "model returned no text" };
  let s = text.trim();
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) s = fence[1].trim();
  const start = s.indexOf("{");
  const end = s.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) return { error: "no JSON object found in model output" };
  try {
    return { value: JSON.parse(s.slice(start, end + 1)) };
  } catch (e) {
    return { error: `JSON.parse failed: ${e.message}` };
  }
}

// parse + validate in one step. returns { data } or { error }
function check(text) {
  const ex = extractJson(text);
  if (ex.error) return { error: ex.error };
  const v = TriageOutput.safeParse(ex.value);
  if (!v.success) return { error: "schema: " + describeIssues(v.error).join("; ") };
  return { data: v.data };
}

function quarantine(entry) {
  try {
    fs.mkdirSync(path.dirname(QUARANTINE), { recursive: true });
    fs.appendFileSync(QUARANTINE, JSON.stringify({ at: new Date().toISOString(), ...entry }) + "\n");
  } catch (e) {
    console.error("could not write quarantine log:", e.message);
  }
}

export async function runTriage(userText) {
  // attempt 1
  const first = await complete({ systemPrompt, userText });
  const r1 = check(first.text);
  if (r1.data) return { ok: true, data: r1.data, repaired: false };

  // attempt 2: one repair, and only one. hand the model its own mistake and the exact error.
  const second = await complete({
    systemPrompt,
    userText,
    extraMessages: [
      { role: "assistant", content: first.text },
      {
        role: "user",
        content:
          `Your previous answer was rejected for this reason: ${r1.error}\n` +
          "Return only the corrected JSON object matching the schema. No other text.",
      },
    ],
  });
  const r2 = check(second.text);
  if (r2.data) return { ok: true, data: r2.data, repaired: true };

  // give up cleanly
  quarantine({
    prompt_version: PROMPT_VERSION,
    model: second.model,
    input: userText,
    attempts: [
      { output: first.text, error: r1.error },
      { output: second.text, error: r2.error },
    ],
  });
  return {
    ok: false,
    status: 422,
    error: "The model did not return a valid answer after one repair attempt. The response was quarantined for review.",
    detail: r2.error,
  };
}
