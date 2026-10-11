// Express app. Routes only know about `repo` — they have no idea whether
// it's an array or Postgres underneath. That's the whole point of A3.
const express = require("express");

function parseId(raw) {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

// returns an error message or null
function validateBody(body, { partial = false } = {}) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return "Request body must be a JSON object";
  }
  const hasTitle = body.title !== undefined;
  const hasDone = body.done !== undefined;

  if (!partial && !hasTitle) return "title is required";
  if (hasTitle && (typeof body.title !== "string" || body.title.trim() === "")) {
    return "title must be a non-empty string";
  }
  if (hasDone && typeof body.done !== "boolean") return "done must be a boolean";
  if (partial && !hasTitle && !hasDone) return "Provide at least one of: title, done";
  return null;
}

function createApp({ repo, redis = null }) {
  const app = express();
  app.use(express.json());

  app.get("/", (req, res) => {
    res.json({ message: "Tasks API - Week 3 A3, running in Docker" });
  });

  // reports on the database (and redis if it's configured)
  app.get("/health", async (req, res) => {
    const out = { status: "ok" };
    try {
      out.database = await repo.healthcheck();
    } catch (err) {
      out.status = "degraded";
      out.database = `error: ${err.message}`;
    }
    if (redis) {
      try {
        out.redis = (await redis.ping()) === "PONG" ? "ok" : "unexpected reply";
      } catch (err) {
        out.status = "degraded";
        out.redis = `error: ${err.message}`;
      }
    }
    res.status(out.status === "ok" ? 200 : 503).json(out);
  });

  app.get("/tasks", async (req, res, next) => {
    try {
      const opts = {};
      if (typeof req.query.search === "string" && req.query.search.trim() !== "") {
        opts.search = req.query.search.trim();
      }
      if (req.query.done !== undefined) {
        if (req.query.done !== "true" && req.query.done !== "false") {
          return res.status(400).json({ error: "done must be true or false" });
        }
        opts.done = req.query.done === "true";
      }
      if (req.query.sort !== undefined) {
        if (req.query.sort !== "title" && req.query.sort !== "id") {
          return res.status(400).json({ error: "sort must be title or id" });
        }
        opts.sort = req.query.sort;
      }
      res.json(await repo.list(opts));
    } catch (err) {
      next(err);
    }
  });

  app.get("/stats", async (req, res, next) => {
    try {
      res.json(await repo.stats());
    } catch (err) {
      next(err);
    }
  });

  app.get("/tasks/:id", async (req, res, next) => {
    try {
      const id = parseId(req.params.id);
      const task = id === null ? null : await repo.get(id);
      if (!task) return res.status(404).json({ error: "Task not found" });
      res.json(task);
    } catch (err) {
      next(err);
    }
  });

  app.post("/tasks", async (req, res, next) => {
    try {
      const error = validateBody(req.body);
      if (error) return res.status(400).json({ error });
      const task = await repo.create({
        title: req.body.title.trim(),
        done: req.body.done === true,
      });
      res.status(201).json(task);
    } catch (err) {
      next(err);
    }
  });

  app.put("/tasks/:id", async (req, res, next) => {
    try {
      const id = parseId(req.params.id);
      if (id === null) return res.status(404).json({ error: "Task not found" });
      const error = validateBody(req.body, { partial: true });
      if (error) return res.status(400).json({ error });
      const task = await repo.update(id, {
        title: req.body.title !== undefined ? req.body.title.trim() : undefined,
        done: req.body.done,
      });
      if (!task) return res.status(404).json({ error: "Task not found" });
      res.json(task);
    } catch (err) {
      next(err);
    }
  });

  app.delete("/tasks/:id", async (req, res, next) => {
    try {
      const id = parseId(req.params.id);
      const removed = id === null ? false : await repo.remove(id);
      if (!removed) return res.status(404).json({ error: "Task not found" });
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  });

  // bad JSON -> 400, anything else -> 500 (and log it)
  app.use((err, req, res, next) => {
    if (err.type === "entity.parse.failed") {
      return res.status(400).json({ error: "Invalid JSON body" });
    }
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  });

  return app;
}

module.exports = { createApp };
