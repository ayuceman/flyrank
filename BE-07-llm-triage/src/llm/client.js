// The model client. One place that knows about the provider; everything else
// just calls complete().
import fs from "node:fs";
import path from "node:path";
import OpenAI from "openai";

const PROMPTS_DIR = path.resolve(import.meta.dirname, "..", "..", "prompts");

export const PROMPT_VERSION = process.env.PROMPT_VERSION || "triage-v1";

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
    });
  }
  return client;
}

// Ask the model. The user's text goes in its own user message, JSON-encoded so
// it can't break out of its quotes. It never touches the system prompt.
export async function complete({ systemPrompt, userText, extraMessages = [] }) {
  const res = await getClient().chat.completions.create({
    model: process.env.LLM_MODEL,
    temperature: 0,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: `Message: ${JSON.stringify(userText)}\nOutput:` },
      ...extraMessages,
    ],
  });
  return {
    text: res.choices?.[0]?.message?.content ?? "",
    usage: res.usage || {},
    model: res.model || process.env.LLM_MODEL,
  };
}
