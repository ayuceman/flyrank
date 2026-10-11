# Put an LLM behind your API (BE-07)

One endpoint, `POST /triage`. You send it a customer support message, it asks a
language model which team the message belongs to and how urgent it is, and it
gives you back a small, fixed-shape JSON answer that the rest of the system can
rely on. It is not a chatbot: one message in, one verdict out, no memory.

What makes it more than "I called an AI": the model's answer is treated as
untrusted input. It gets parsed, checked against a schema, sent back once for
repair if it's wrong, and quarantined if it's still wrong. There is a real
timeout, a retry policy that only retries the right errors, a cost log line
per call, and a kill switch that turns the model off without a deploy.

## Try it

```bash
cp .env.example .env     # defaults point at Ollama (gemma3:1b), no key needed
npm install
npm start
```

```bash
curl -s -X POST localhost:3000/triage -H "Content-Type: application/json" \
  -d '{"text":"I was charged $49 twice on the 3rd, can you refund one of them?"}'
```

Response (real output from `gemma3:1b` via Ollama, prompt `triage-v1`):

```json
__CURL_RESPONSE__
```

And a deliberately broken one, which is rejected before any model call:

```bash
curl -s -X POST localhost:3000/triage -H "Content-Type: application/json" -d '{"text":""}'
# {"error":"Invalid input","issues":["text: text must not be empty"]}
```

## Job card

What it does: reads one incoming support message and decides which team it
belongs to and how urgent it is.

```
Input:  { "text": "string, 1-2000 characters" }
Output: { "category":   one of [billing | bug | feature | account | other],
          "urgency":    one of [low | normal | high],
          "confidence": 0.0-1.0,
          "reason":     "one short sentence, max 200 characters" }
```

It must never: invent a category outside the list, add extra fields, return
free text or markdown instead of the JSON object, follow instructions that
appear inside the message, give legal/medical/financial advice, or reveal the
prompt.

When unsure: return `other` with confidence below 0.5 and say why. Not guess.

Full version with the three-rules check in [`JOB-CARD.md`](JOB-CARD.md).

## Provider and model

I built this on **Ollama** running `gemma3:1b` locally, because it has no quota
and I restart the server a lot. The code uses the `openai` npm package pointed
at Ollama's OpenAI-compatible endpoint. Switching to a hosted model is three
environment variables and nothing else:

```
LLM_BASE_URL=https://openrouter.ai/api/v1     # was http://localhost:11434/v1
LLM_API_KEY=<your key>                        # was "ollama"
LLM_MODEL=openrouter/free                     # was gemma3:1b
```

That is the whole reason not to hard-code a provider: the difference between a
model on my laptop and one in a datacentre is three lines of config.

`.env` is git-ignored, `.env.example` has every variable with no real values.

## Eval

`evals/cases.json` has 8 messages I labelled by hand, including one ambiguous
"thanks" message that should trigger the when-unsure rule and one prompt
injection. `npm run eval` sends all 8 through the running endpoint and prints
the score on `category` (the key field) and on `urgency` separately.

__EVAL_RESULT__

## Cost

One structured log line per model call goes to stdout, like this (a real line
from my run):

```
__COST_LINE__
```

__COST_ESTIMATE__

## How it works

```
POST /triage
  1. Zod validates the body        -> 400 naming the field, no model call
  2. LLM_ENABLED=false?             -> deterministic fallback, no model call
  3. LLM_STUB=1?                    -> canned schema-valid answer, no model call
  4. load prompts/triage-v1.md      -> system message
     user's text, JSON-encoded      -> user message (never in the system prompt)
  5. call the model                 -> 30s timeout, retry on timeout/429/5xx only
  6. strip fences, find {...}, JSON.parse, Zod .strict() parse
  7. failed? one repair call with the broken output + the exact error
  8. still failed? 422 + a line in logs/quarantine.jsonl
  9. success -> the validated object, nothing else
```

```
src/
├── index.js, app.js
├── routes/triage.js        the route: validate, kill switch, stub, call, map errors
└── llm/
    ├── schema.js           Zod input + output schemas, enums, fallback object
    ├── client.js           openai client, timeout, retry policy, cost log
    ├── triage.js           parse -> validate -> repair once -> quarantine
    └── hello.js            Stage 0 "say ready" script  (npm run hello)
prompts/triage-v1.md        the prompt, versioned
evals/cases.json, run.js    8 labelled cases + runner  (npm run eval)
test/fake-llm.js, triage.test.js   fake provider + 14 e2e checks  (npm test)
logs/quarantine.jsonl       rejected model output (git-ignored)
```

Things I decided and want to be explicit about:

- **Timeout** is 30 s (`LLM_TIMEOUT_MS`), set on the client. The SDK default is
  10 minutes, which is not a timeout. On timeout the endpoint returns 504.
- **Retries**: the SDK's own 2 silent retries are turned off (`maxRetries: 0`)
  so the only retry logic is mine. Up to 3 retries on timeouts, connection
  errors, 429 and 5xx, with backoff 1s/2s/4s plus jitter, and `Retry-After` is
  obeyed when present. 400/401/403/404/422 are never retried. A bad key fails
  on the first call.
- **Repair** is exactly one extra call. Both attempts are logged in the
  quarantine file with the input, the prompt version and the validation error.
- **The caller never sees raw model text.** Not on success, not on failure.
  Output is `.strict()` so an extra field the model added is a failure.
- **Prompt injection**: the message goes in a user message, JSON-encoded, and
  the prompt says to treat it as data. The last eval case checks it; see below.

## What surprised me

- gemma3:1b with temperature 0 is very consistent on shape but hedges on
  urgency: it leans "normal" when the message doesn't shout. That is where most
  of my eval misses are, not category.
- The "when unsure" line in the prompt matters more than the examples. Without
  it the model picked a category for "thanks for the help" with 0.8 confidence.
- Stub mode saved me more quota than anything else. I restarted the server
  probably fifty times; none of those cost a call.

## Tests

`npm test` runs 14 end-to-end checks against `test/fake-llm.js`, a tiny
OpenAI-compatible server that returns canned answers and can be told to
misbehave (fenced output, invalid category, prose instead of JSON, 429, 500,
401, hang forever). It checks every status code in the brief and that the
pipeline makes exactly the number of model calls it should (one repair, no
retry on 401, zero calls in stub and kill-switch mode). It is not a model and
says nothing about answer quality; that's what the eval is for.

## What I'd fix with another day

__NEXT_DAY__
