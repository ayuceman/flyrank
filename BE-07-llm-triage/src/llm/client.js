// The model client. One place that knows about the provider, the timeout and
// the retry policy; everything else just calls complete().
import fs from "node:fs";
import path from "node:path";
import OpenAI, { APIError, APIConnectionTimeoutError, APIConnectionError } from "openai";

const PROMPTS_DIR = path.resolve(import.meta.dirname, "..", "..", "prompts");

export const PROMPT_VERSION = process.env.PROMPT_VERSION || "triage-v1";
const TIMEOUT_MS = Number(process.env.LLM_TIMEOUT_MS || 30000);
const MAX_RETRIES = Number(process.env.LLM_MAX_RETRIES ?? 3);
const RETRY_BASE_MS = Number(process.env.LLM_RETRY_BASE_MS || 1000);

// prompts are files, not strings in a route. loaded once.
export function loadPrompt(version = PROMPT_VERSION) {
  return fs.readFileSync(path.join(PROMPTS_DIR, `${version}.md`), "utf8");
}

let client;
function getClient() {
  if (!client) {
    client = new OpenAI({
      baseURL: process.env.LLM_BASE_URL,
      apiKey: process.env.LLM_API_KEY,
      // The SDK defaults are 10 minutes and 2 silent retries. Neither is OK
      // behind an HTTP endpoint. I set the timeout explicitly and turn the
      // SDK's retries off so the policy below is the only one that runs.
      timeout: TIMEOUT_MS,
      maxRetries: 0,
    });
  }
  return client;
}

// Errors worth retrying: timeouts, connection drops, 429, 5xx.
// Never 400/401/403/404/422 - they'll be just as wrong in four seconds.
export class LLMError extends Error {
  constructor(message, { status, retryable, cause } = {}) {
    super(message);
    this.name = "LLMError";
    this.status = status;        // upstream HTTP status, if any
    this.retryable = retryable;
    this.cause = cause;
  }
}

function classify(err) {
  if (err instanceof APIConnectionTimeoutError) return new LLMError(`model did not answer within ${TIMEOUT_MS}ms`, { status: 504, retryable: true, cause: err });
  if (err instanceof APIConnectionError) return new LLMError(`could not reach the model provider: ${err.message}`, { status: 502, retryable: true, cause: err });
  if (err instanceof APIError) {
    const s = err.status;
    if (s === 429) return new LLMError("model provider rate limit (429)", { status: 429, retryable: true, cause: err });
    if (s >= 500) return new LLMError(`model provider error (${s})`, { status: 502, retryable: true, cause: err });
    if (s === 401 || s === 403) return new LLMError(`model provider rejected the API key (${s})`, { status: 502, retryable: false, cause: err });
    return new LLMError(`model provider rejected the request (${s}): ${err.message}`, { status: 502, retryable: false, cause: err });
  }
  return new LLMError(err.message || String(err), { status: 502, retryable: false, cause: err });
}

// honour Retry-After (seconds or HTTP date); otherwise exponential backoff with jitter
function retryDelay(attempt, err) {
  const ra = err.cause?.headers?.get?.("retry-after") ?? err.cause?.headers?.["retry-after"];
  if (ra) {
    const secs = Number(ra);
    if (!Number.isNaN(secs)) return secs * 1000;
    const when = Date.parse(ra);
    if (!Number.isNaN(when)) return Math.max(0, when - Date.now());
  }
  const base = RETRY_BASE_MS * 2 ** attempt; // 1s, 2s, 4s
  return base + Math.random() * RETRY_BASE_MS * 0.5;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// one structured line per model call, to stdout, so whatever runs this can collect it
function logCall({ promptVersion, model, usage, durationMs, repair, outcome, attempt }) {
  console.log(JSON.stringify({
    event: "llm_call",
    at: new Date().toISOString(),
    prompt_version: promptVersion,
    model,
    input_tokens: usage?.prompt_tokens ?? null,
    output_tokens: usage?.completion_tokens ?? null,
    duration_ms: durationMs,
    repair,
    attempt,
    outcome,
  }));
}

// Ask the model. The user's text goes in its own user message, JSON-encoded so
// it can't break out of its quotes. It never touches the system prompt.
// `repair` is only for the log line; the repair messages come in via extraMessages.
export async function complete({ systemPrompt, userText, extraMessages = [], repair = false }) {
  const messages = [
    { role: "system", content: systemPrompt },
    { role: "user", content: `Message: ${JSON.stringify(userText)}\nOutput:` },
    ...extraMessages,
  ];

  let lastErr;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const t0 = Date.now();
    try {
      const res = await getClient().chat.completions.create({
        model: process.env.LLM_MODEL,
        temperature: 0,
        messages,
      });
      const model = res.model || process.env.LLM_MODEL;
      logCall({ promptVersion: PROMPT_VERSION, model, usage: res.usage, durationMs: Date.now() - t0, repair, outcome: "ok", attempt });
      return { text: res.choices?.[0]?.message?.content ?? "", usage: res.usage || {}, model };
    } catch (raw) {
      const err = classify(raw);
      logCall({ promptVersion: PROMPT_VERSION, model: process.env.LLM_MODEL, usage: null, durationMs: Date.now() - t0, repair, outcome: `error:${err.status}${err.retryable ? "" : ":no-retry"}`, attempt });
      lastErr = err;
      if (!err.retryable || attempt === MAX_RETRIES) break;
      await sleep(retryDelay(attempt, err));
    }
  }
  throw lastErr;
}
