# Frame It as Cases — FlyRank AI Fluency, Week 2

**Voice card:** plain, specific, honest about trade-offs, no hype.

**Who this is for:** one person — a hiring manager or founder who needs a backend engineer to ship an AI feature and keep it running.
**The one action:** email me at ayuceman@gmail.com. Everything below links to code you can run.

---

## 1. Tasks API that survives restarts, then the same API in Docker

**The problem.** The first assignment was a tasks API that kept everything in memory, so every restart wiped the data. The next two asked for the same API shape — same URLs, same JSON fields — first backed by SQLite, then by Postgres and Redis, with the whole thing starting from one `docker compose up`.

**What I did.** I kept the HTTP layer identical and moved only the storage behind it. For SQLite I used `better-sqlite3` with prepared statements, built it in six small commits so each stage could be reviewed on its own, and wrote 16 tests against a temp database. For the Docker version I put the storage behind a repository interface with two implementations, memory and Postgres, so the same test file runs against both (13 and 12 passing). The compose file gives Postgres a named volume, which is the actual answer to "does it survive a restart" — I checked by stopping the stack and starting it again. I also wrote the `EXPLAIN` queries down instead of just claiming the index was used.

**What didn't work.** While testing a later project, requests to port 3000 kept getting answered by this stack, which I'd left running from an earlier `docker compose up`. Ten confusing minutes. Now the first thing I check when an API "misbehaves" is which process actually owns the port.

**What came of it.** Three folders in one repo, each runnable with `npm install && npm start` or `docker compose up`, 41 tests between them, all green. If I did it again I'd start with the repository interface on day one instead of refactoring into it.

Code: [BE-02-crud-sqlite](https://github.com/ayuceman/flyrank/tree/main/BE-02-crud-sqlite) · [BE-04-containerize](https://github.com/ayuceman/flyrank/tree/main/BE-04-containerize)

---

## 2. Signup, login and protected routes with Supabase Auth

**The problem.** Add real authentication to the API — signup, login, logout, and routes that return 401 unless you carry a valid token — without writing my own password handling, because that is the one thing you should never do yourself.

**What I did.** Supabase Auth issues the JWTs; my Express app only verifies them. One `requireAuth` middleware does the check, so protecting a new route is a single line. I documented every route in Swagger at `/docs` so someone can try the login flow in the browser without reading the code. The tests use a fake Supabase client, so they run offline in under a second and don't burn a real project's rate limit.

**What didn't work.** The first time I ran it on a clean machine it died with a bare `fetch failed` because `.env` still had placeholder values. I didn't just fix my `.env`; I made the startup check each variable and say which one is missing, because the next person would have hit the same wall.

**What came of it.** 15 tests passing, Swagger docs, and a service where the auth logic lives in one file. The piece I'd change: Supabase's "confirm email" setting has to be flipped by hand in their dashboard, and I'd script or document that first next time rather than discovering it during a demo.

Code: [BE-03-auth](https://github.com/ayuceman/flyrank/tree/main/BE-03-auth)

---

## 3. One LLM call behind one endpoint, treated like production code

**The problem.** Put a language model behind `POST /triage` to classify support tickets by category and urgency, and make it behave like a service, not a demo: the response must always be valid JSON in a fixed shape, the call must time out, retries must be bounded, cost must be logged, and there must be a way to switch the model off without a deploy.

**What I did.** The prompt lives in a versioned file (`prompts/triage-v1.md`), not a string in the code. Every model response goes through a zod schema; if it fails, I ask the model once to repair its own output, and if that fails too the ticket is quarantined with the raw text saved, never dropped. Timeout, retry count and a kill switch are environment variables. Each call logs tokens and an estimated cost. I wrote an eight-ticket eval set with expected answers and a runner that scores the model against it.

**What didn't work.** The first eval run was all schema passes but only 6 of 8 categories right on a small local model (gemma3:1b). I didn't pad the eval set until the number looked better; the result is in the README as it was, because the point of an eval is to know where you stand.

**What came of it.** 14 tests against a fake LLM, so CI doesn't need a model, plus a real eval log: 8/8 schema-valid, 6/8 category, 7/8 urgency. The number I'm proudest of is the 8/8, because that's the one the schema-and-repair design is responsible for. Next time I'd write the eval set before the prompt, not after.

Code: [BE-07-llm-triage](https://github.com/ayuceman/flyrank/tree/main/BE-07-llm-triage)

---

## 4. Capstone: usage metering and billing for an AI API

**The problem.** Build the part of an AI product nobody shows in demos: count every call and every token per tenant, enforce plan quotas, charge for upgrades through Stripe, and never double-count or double-charge when a request or a webhook is retried.

**What I did.** Usage events carry an idempotency key with a unique constraint per tenant, so a retried request returns the original row instead of a second one. Stripe webhooks are deduplicated by event id before anything else runs. Pricing is in micro-dollars in integer columns, because floating-point money is how you get a support ticket. Quota checks are `used + requested <= limit` with the right status per situation — 402 when a free tenant needs to upgrade, 429 with `Retry-After` when a paid tenant hits the ceiling. A background worker raises usage alerts. 20 tests run against a real Postgres, and `scripts/smoke.sh` runs 20 live checks against a running stack.

**What didn't work.** Two things. The replay test failed because Postgres reorders JSON keys, so the "same" response wasn't byte-identical — fixed by returning the stored row. And during the real Stripe test I started `stripe listen` without `--forward-to`, so Checkout completed and the tenant stayed on the free plan. The webhook log, with the second delivery marked `duplicate`, is in `EVIDENCE.md`.

**What came of it.** A working end-to-end flow: free tenant hits the quota, pays through a real Stripe test Checkout, webhook upgrades them to pro, usage continues. The design decisions and the evidence are written down, including that the build was AI-assisted and that I reviewed every line. The thing I'd do differently: put it in its own repo from the start; I put all capstones in one and had to add pointers at the root.

Code: [flyrank-capstones/metering-billing](https://github.com/ayuceman/flyrank-capstones/tree/main/metering-billing)

---

## Bio

I'm Ayushman Bajracharya. I've been a .NET developer for more than 20 years, building e-commerce stores, staffing platforms, dating apps, learning management systems, a billboard management system and CRMs, and for the last eight years mostly nopCommerce, as lead developer and then technical manager. I've done the frontends too: more than eight years of Angular and about three of React. The cases above are my newer work: backend services in Node and Postgres, and the plumbing that makes AI features safe to ship — schema checks, evals, metering, billing. Right now I freelance between jobs and I'm building Creatrix Technologies, my own AI services startup, on the side. The FlyRank Backend AI Engineering internship is where I get this newer work reviewed by people who don't already know me.

## Contact

If you need an AI feature built properly — the endpoint, the tests, the bill — or a nopCommerce / .NET lead who can also do that, email me: **ayuceman@gmail.com**. Code is at [github.com/ayuceman](https://github.com/ayuceman).

---

## Before / after

**Generic AI line (what the model gave me first for case 3):**

> Leveraging cutting-edge LLM technology, I architected a robust, scalable triage microservice with comprehensive error handling and production-grade reliability.

**My edited version:**

> Every model response goes through a schema; if it fails, I ask the model once to repair it, and if that fails the ticket is quarantined with the raw text saved, never dropped.

The first line could sit on anyone's portfolio. The second one could only describe this project, and it tells you what actually happens when the model gets it wrong.
