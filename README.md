# Week 1: First API Endpoint

Minimal Express server with two JSON endpoints for the FlyRank AI Internship Week 1 assignment.

## Setup

```bash
npm install
```

## Run

```bash
npm start
```

Server listens on `http://localhost:3000` (or `PORT` env var).

## Endpoints

| Method | Path | Response |
|--------|------|----------|
| GET | `/` | `{ "message": "Hello from Week 1 API" }` |
| GET | `/health` | `{ "status": "ok" }` |

## Test with curl

```bash
curl http://localhost:3000/
curl http://localhost:3000/health
```

## Test in browser

Open these URLs while the server is running:

- http://localhost:3000/
- http://localhost:3000/health
