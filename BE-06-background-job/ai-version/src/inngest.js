const { Inngest } = require("inngest");
const store = require("./store");

const inngest = new Inngest({ id: "report-api" });

// Triggered by POST /reports. Step 1 sleeps (stands in for slow work),
// step 2 builds the result and marks the report done.
const makeReport = inngest.createFunction(
  {
    id: "make-report",
    retries: 2, // 3 attempts total, then the run is marked failed
    onFailure: async ({ event }) => {
      // event.data.event is the original report/requested event
      const { id } = event.data.event.data;
      const message =
        (event.data.error && event.data.error.message) || "unknown error";
      store.update(id, { status: "failed", error: message });
      console.log(`[make-report] report ${id} FAILED after all retries: ${message}`);
    },
  },
  { event: "report/requested" },
  async ({ event, step }) => {
    const { id, topic } = event.data;

    await step.sleep("simulate-slow-work", "8s");

    const result = await step.run("build-result", async () => {
      if (topic === "fail") {
        throw new Error(`Could not build report for topic "${topic}"`);
      }
      const text = `Report on ${topic}: ${topic} are fascinating. Generated at ${new Date().toISOString()}.`;
      store.update(id, { status: "done", result: text });
      return text;
    });

    return { id, result };
  }
);

// Runs every minute and logs a one-line summary of report statuses.
const heartbeat = inngest.createFunction(
  { id: "heartbeat" },
  { cron: "* * * * *" },
  async () => {
    const c = store.counts();
    console.log(
      `[heartbeat] pending=${c.pending} done=${c.done} failed=${c.failed}`
    );
    return c;
  }
);

module.exports = { inngest, functions: [makeReport, heartbeat] };
