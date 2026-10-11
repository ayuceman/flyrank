const fs = require('node:fs/promises');
const path = require('node:path');
const { inngest } = require('./client');
const { getReport, setReport, allReports } = require('../reports');

const OUTBOX = path.join(__dirname, '..', '..', 'outbox');

// Stage 1: the introductions. Trigger it from the Dev Server dashboard (Invoke).
// Note: inngest v4 puts triggers inside the options object, not as a second argument.
const sayHello = inngest.createFunction(
  { id: 'say-hello', triggers: [{ event: 'test/hello' }] },
  async ({ step }) => {
    await step.sleep('wait-a-moment', '5s');
    return 'Hello from the background!';
  }
);

// Stage 2: the slow work. POST /reports sends report/requested and returns 202;
// this function does the 8-second job and writes the result back.
// Stage 3: retries. A thrown error inside a step makes Inngest retry the run.
// retries: 2 means 3 attempts in total, then the run ends Failed.
// Stretch: concurrency 2 — at most two reports build at once, the rest wait in line.
const makeReport = inngest.createFunction(
  {
    id: 'make-report',
    triggers: [{ event: 'report/requested' }],
    retries: 2,
    concurrency: 2,
    // Runs once, after the last retry has failed. Someone must find out.
    onFailure: async ({ event, error }) => {
      const { id } = event.data.event.data;
      setReport(id, { status: 'failed', error: error.message });
      console.error(`[make-report] gave up on ${id}: ${error.message}`);
    },
  },
  async ({ event, step }) => {
    const { id, topic } = event.data;

    // Stretch: idempotency. The same event will arrive twice one day (a retry,
    // a replay, a double click). If the report is already built, do nothing.
    const already = await step.run('check-not-already-done', async () => {
      const report = getReport(id);
      return report ? report.status === 'done' : false;
    });
    if (already) return { id, skipped: 'already done' };

    // Stand-in for the real slow thing (an AI call, a big export).
    // The brief suggests step.sleep here. I used step.run with a timer instead,
    // because a sleeping step releases its concurrency slot (nothing is running),
    // so the concurrency limit above would never be visible. A real AI call is
    // a step.run that waits on the network — this is the same shape.
    await step.run('do-the-slow-work', () => new Promise((r) => setTimeout(r, 8000)));

    const result = await step.run('build-report', async () => {
      // A "bad moment" we can trigger on demand, to watch the retry.
      if (topic === 'fail') throw new Error('The report oven is broken!');

      const built = {
        title: `Report on ${topic}`,
        summary: `Everything you need to know about ${topic}, in one paragraph.`,
        generated_at: new Date().toISOString(),
      };
      // Upsert: if the API restarted and lost the row, the event still has
      // everything needed to finish the job.
      setReport(id, { topic, status: 'done', result: built });
      return built;
    });

    // Extra: the "email". A stand-in for sending mail from a job.
    await step.run('write-outbox', async () => {
      await fs.mkdir(OUTBOX, { recursive: true });
      const file = path.join(OUTBOX, `${id}.txt`);
      await fs.writeFile(file, `${result.title}\n\n${result.summary}\n\nGenerated ${result.generated_at}\n`);
      return file;
    });

    return { id, result };
  }
);

// Stage 4: the clock. No endpoint, no event — a schedule is the only trigger.
// Every minute is for watching it work; a real one would be daily (0 8 * * *).
const heartbeat = inngest.createFunction(
  { id: 'heartbeat', triggers: [{ cron: '* * * * *' }] },
  async () => {
    const counts = { pending: 0, done: 0, failed: 0 };
    for (const r of allReports()) counts[r.status] = (counts[r.status] || 0) + 1;
    const line = `[heartbeat] ${new Date().toISOString()} reports: pending=${counts.pending} done=${counts.done} failed=${counts.failed}`;
    console.log(line);
    return counts;
  }
);

module.exports = { functions: [sayHello, makeReport, heartbeat] };
