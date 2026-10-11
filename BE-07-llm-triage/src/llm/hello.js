// Stage 0 throwaway: prove I can get one word out of a model from my machine.
//   npm run hello      (reads .env via node --env-file)
import OpenAI from "openai";

const client = new OpenAI({
  baseURL: process.env.LLM_BASE_URL, // Ollama: http://localhost:11434/v1   OpenRouter: https://openrouter.ai/api/v1
  apiKey: process.env.LLM_API_KEY,   // Ollama: the literal string "ollama"
});

const res = await client.chat.completions.create({
  model: process.env.LLM_MODEL,      // gemma3:1b  or  openrouter/free
  messages: [{ role: "user", content: "Reply with exactly the word: ready" }],
});

console.log(res.choices[0].message.content);
