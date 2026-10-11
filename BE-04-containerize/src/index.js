require("dotenv").config({ quiet: true });

const { createApp } = require("./app");
const { createMemoryRepository } = require("./repositories/memory");
const { createPostgresRepository } = require("./repositories/postgres");

const PORT = process.env.PORT || 3000;

// Pick the store from the environment. DATABASE_URL set -> Postgres,
// otherwise fall back to the in-memory array so `npm start` still works
// without docker.
function chooseRepository() {
  if (process.env.REPOSITORY === "memory" || !process.env.DATABASE_URL) {
    console.log("store: in-memory (set DATABASE_URL to use Postgres)");
    return createMemoryRepository();
  }
  console.log("store: postgres");
  return createPostgresRepository(process.env.DATABASE_URL);
}

function chooseRedis() {
  if (!process.env.REDIS_URL) return null;
  const Redis = require("ioredis");
  const redis = new Redis(process.env.REDIS_URL, { lazyConnect: true, maxRetriesPerRequest: 1 });
  redis.on("error", (err) => console.error("redis:", err.message));
  return redis;
}

// Postgres in docker can take a second or two longer than the app to come up,
// so retry the first connection a few times instead of crashing.
async function initWithRetry(repo, attempts = 10, delayMs = 1000) {
  for (let i = 1; i <= attempts; i++) {
    try {
      await repo.init();
      return;
    } catch (err) {
      if (i === attempts) throw err;
      console.log(`database not ready (${err.code || err.message}), retrying ${i}/${attempts}...`);
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
}

async function main() {
  const repo = chooseRepository();
  const redis = chooseRedis();

  await initWithRetry(repo);
  if (redis) {
    try {
      await redis.connect();
      console.log("redis: connected");
    } catch (err) {
      console.error("redis: could not connect,", err.message);
    }
  }

  const app = createApp({ repo, redis });
  const server = app.listen(PORT, () => {
    console.log(`Server listening on http://localhost:${PORT}`);
  });

  // so `docker compose down` doesn't have to wait 10s for SIGKILL
  const shutdown = async () => {
    console.log("shutting down");
    server.close();
    await repo.close();
    if (redis) redis.disconnect();
    process.exit(0);
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

main().catch((err) => {
  console.error("failed to start:", err.message);
  process.exit(1);
});
