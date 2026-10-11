const { inngest } = require("./client");
const store = require("../store");

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const makeReport = inngest.createFunction(
  {
    id: "make-report",
    retries: 2,
    concurrency: 2,
    triggers: [{ event: "report/requested" }],
    onFailure: async ({ event, error }) => {
      // On final failure, the original event is nested at event.data.event
      const original = event.data && event.data.event ? event.data.event : event;
      const { id, topic } = original.data;
      store.markFailed(id, topic, error.message);
      console.log(`[make-report] ${id} failed: ${error.message}`);
    },
  },
  async ({ event, step }) => {
    const { id, topic } = event.data;

    // (1) Idempotency guard: the same event may be delivered twice.
    const alreadyDone = await step.run("check-not-already-done", async () => {
      const existing = store.getReport(id);
      return Boolean(existing && existing.status === "done");
    });

    if (alreadyDone) {
      return { id, skipped: true };
    }

    // (2) Slow work. A real timer (not step.sleep) so the concurrency limit is observable.
    await step.run("do-the-slow-work", async () => {
      await wait(8000);
      return { slept_ms: 8000 };
    });

    // (3) Build the report and mark it done (upsert).
    const result = await step.run("build-report", async () => {
      if (topic === "fail") {
        throw new Error("The report oven is broken!");
      }
      const built = {
        title: `Report on ${topic}`,
        summary: `This is a generated report about ${topic}.`,
        generated_at: new Date().toISOString(),
      };
      store.markDone(id, topic, built);
      return built;
    });

    return { id, status: "done", result };
  }
);

const heartbeat = inngest.createFunction(
  {
    id: "heartbeat",
    triggers: [{ cron: "* * * * *" }],
  },
  async () => {
    const c = store.counts();
    console.log(
      `[heartbeat] ${new Date().toISOString()} pending=${c.pending} done=${c.done} failed=${c.failed}`
    );
    return c;
  }
);

module.exports = { functions: [makeReport, heartbeat] };
