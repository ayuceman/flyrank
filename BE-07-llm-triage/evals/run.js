// Runs evals/cases.json through the live endpoint and prints the score.
//
//   npm run eval                    (server must be running on $PORT, default 3000)
//   EVAL_BASE=http://localhost:3210 node evals/run.js
//
// Score = category matches / total. Urgency is reported separately because
// it's the fuzzier field. On OpenRouter this costs 8 of the 50 daily calls.

import fs from "node:fs";
import path from "node:path";

const BASE = process.env.EVAL_BASE || `http://localhost:${process.env.PORT || 3000}`;
const cases = JSON.parse(fs.readFileSync(path.resolve(import.meta.dirname, "cases.json"), "utf8"));

let category = 0, urgency = 0, schemaOk = 0;
const failures = [];
const rows = [];
const t0 = Date.now();

for (const c of cases) {
  let res, body, text;
  try {
    res = await fetch(`${BASE}/triage`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: c.text }) });
    text = await res.text();
    body = JSON.parse(text);
  } catch (e) {
    failures.push(`${c.id}: request failed (${e.message})`);
    rows.push({ id: c.id, status: "ERR" });
    continue;
  }
  if (res.status !== 200) {
    failures.push(`${c.id}: HTTP ${res.status} ${text.slice(0, 120)}`);
    rows.push({ id: c.id, status: res.status });
    continue;
  }
  schemaOk++;
  const catOk = body.category === c.expect.category;
  const urgOk = c.expect.urgency === undefined || body.urgency === c.expect.urgency;
  const confOk = c.expect.max_confidence === undefined || body.confidence <= c.expect.max_confidence;
  if (catOk && confOk) category++; else failures.push(`${c.id}: expected ${c.expect.category}${c.expect.max_confidence !== undefined ? ` (conf <= ${c.expect.max_confidence})` : ""}, got ${body.category} (conf ${body.confidence}) - "${body.reason}"`);
  if (urgOk) urgency++; else failures.push(`${c.id}: urgency expected ${c.expect.urgency}, got ${body.urgency}`);
  rows.push({ id: c.id, status: 200, category: body.category, urgency: body.urgency, confidence: body.confidence, src: res.headers.get("x-triage-source") });
}

const n = cases.length;
console.log(`\nprompt: ${process.env.PROMPT_VERSION || "triage-v1"}   model: ${process.env.LLM_MODEL || "(see server)"}   date: ${new Date().toISOString().slice(0, 10)}   ${Date.now() - t0}ms`);
console.table(rows);
console.log(`schema-valid responses: ${schemaOk}/${n}`);
console.log(`category correct:       ${category}/${n}  (${Math.round((100 * category) / n)}%)   <- the key field`);
console.log(`urgency correct:        ${urgency}/${n}  (${Math.round((100 * urgency) / n)}%)`);
if (failures.length) {
  console.log("\nmisses:");
  for (const f of failures) console.log("  - " + f);
}
