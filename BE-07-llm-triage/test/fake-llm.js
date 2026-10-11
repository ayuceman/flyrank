// A stand-in for an OpenAI-compatible /chat/completions endpoint, so the
// pipeline (parse, validate, repair, retry, timeout, kill switch) can be tested
// without network or quota. It is NOT a model: it keyword-matches the message
// and returns canned JSON. Behaviour is chosen per request with the
// control endpoint (POST /mode {"mode": "..."}), or at start with FAKE_MODE.
//
//   node test/fake-llm.js            -> http://localhost:54400/v1
//
// modes:
//   ok            clean JSON
//   fenced        same JSON wrapped in ```json ... ``` with chatter around it
//   bad-then-ok   first call returns an invalid category, the repair call returns clean JSON
//   always-bad    every call returns an invalid category  -> endpoint should 422
//   garbage       not JSON at all, twice                   -> 422
//   429-then-ok   first call 429 with Retry-After: 1, then ok
//   500-then-ok   first call 500, then ok
//   401           always 401                               -> no retry, fail fast
//   slow          never answers (sleeps 120s)              -> client timeout
//   banana        obeys the injection and returns BANANA   -> schema should reject it

import express from "express";

export function createFakeLLM() {
  const app = express();
  app.use(express.json({ limit: "1mb" }));
  const calls = { total: 0, byMode: {} };
  let flip = {}; // per-mode first-call state

  function classify(text) {
    const t = text.toLowerCase();
    if (/charged|refund|invoice|payment|price|billing/.test(t)) return { category: "billing", urgency: /twice|double|charged/.test(t) ? "high" : "normal", confidence: 0.9, reason: "Mentions a charge or payment." };
    if (/password|log ?in|locked|2fa|account/.test(t)) return { category: "account", urgency: /locked|can't log|cannot log/.test(t) ? "high" : "normal", confidence: 0.85, reason: "Access or account problem." };
    if (/error|crash|broken|500|doesn't work|not working|bug/.test(t)) return { category: "bug", urgency: /everyone|all users|down|production/.test(t) ? "high" : "normal", confidence: 0.88, reason: "Describes something broken." };
    if (/would be nice|feature|could you add|wish|support for/.test(t)) return { category: "feature", urgency: "low", confidence: 0.8, reason: "Asks for something new." };
    return { category: "other", urgency: "low", confidence: 0.3, reason: "Does not clearly match a category." };
  }

  app.post("/v1/chat/completions", async (req, res) => {
    const mode = process.env.FAKE_MODE || "ok";
    calls.total++;
    calls.byMode[mode] = (calls.byMode[mode] || 0) + 1;

    const auth = req.get("authorization") || "";
    if (mode === "401" || !auth.startsWith("Bearer ")) {
      return res.status(401).json({ error: { message: "Incorrect API key provided", type: "invalid_request_error", code: "invalid_api_key" } });
    }

    const msgs = req.body.messages || [];
    const isRepair = msgs.some((m) => m.role === "user" && /previous answer was rejected/i.test(m.content));
    const userMsg = msgs.find((m) => m.role === "user")?.content || "";
    const m = userMsg.match(/^Message:\s*(.*)\nOutput:/s);
    let text = "";
    try { text = m ? JSON.parse(m[1]) : userMsg; } catch { text = userMsg; }

    const verdict = classify(text);
    const good = JSON.stringify(verdict);
    const bad = JSON.stringify({ ...verdict, category: "complaint" });

    let content;
    switch (mode) {
      case "ok": content = good; break;
      case "fenced": content = "Sure! Here's the JSON:\n```json\n" + JSON.stringify(verdict, null, 2) + "\n```\nLet me know if you need anything else."; break;
      case "bad-then-ok": content = isRepair ? good : bad; break;
      case "always-bad": content = bad; break;
      case "garbage": content = "I think this is probably a billing thing? Hard to say."; break;
      case "banana": content = "BANANA"; break;
      case "429-then-ok":
        if (!flip["429"]) { flip["429"] = true; res.set("Retry-After", "1"); return res.status(429).json({ error: { message: "Rate limit exceeded" } }); }
        content = good; break;
      case "500-then-ok":
        if (!flip["500"]) { flip["500"] = true; return res.status(500).json({ error: { message: "upstream exploded" } }); }
        content = good; break;
      case "slow":
        await new Promise((r) => setTimeout(r, 120000));
        content = good; break;
      default: content = good;
    }

    const promptTokens = Math.ceil(msgs.reduce((n, x) => n + x.content.length, 0) / 4);
    res.json({
      id: "chatcmpl-fake",
      object: "chat.completion",
      model: req.body.model || "fake-model",
      choices: [{ index: 0, message: { role: "assistant", content }, finish_reason: "stop" }],
      usage: { prompt_tokens: promptTokens, completion_tokens: Math.ceil(content.length / 4), total_tokens: promptTokens + Math.ceil(content.length / 4) },
    });
  });

  app.get("/calls", (req, res) => res.json(calls));
  app.post("/reset", (req, res) => { calls.total = 0; calls.byMode = {}; flip = {}; res.json({ ok: true }); });
  // test control: POST /mode { "mode": "fenced" } switches behaviour for the next calls
  app.post("/mode", (req, res) => { process.env.FAKE_MODE = req.body.mode || "ok"; flip = {}; res.json({ mode: process.env.FAKE_MODE }); });
  return app;
}

if (process.argv[1] && process.argv[1].endsWith("fake-llm.js")) {
  const port = process.env.FAKE_PORT || 54400;
  createFakeLLM().listen(port, () => console.log(`fake llm on http://localhost:${port}/v1`));
}
