const { inngest } = require('./client');
const { getReport, setReport } = require('../reports');

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
const makeReport = inngest.createFunction(
  {
    id: 'make-report',
    triggers: [{ event: 'report/requested' }],
    retries: 2,
    // Runs once, after the last retry has failed. Someone must find out.
    onFailure: async ({ event, error }) => {
      const { id } = event.data.event.data;
      setReport(id, { status: 'failed', error: error.message });
      console.error(`[make-report] gave up on ${id}: ${error.message}`);
    },
  },
  async ({ event, step }) => {
    const { id, topic } = event.data;

    // Stand-in for the real slow thing (an AI call, a big export).
    await step.sleep('do-the-slow-work', '8s');

    const result = await step.run('build-report', async () => {
      // A "bad moment" we can trigger on demand, to watch the retry.
      if (topic === 'fail') throw new Error('The report oven is broken!');

      const report = getReport(id);
      if (!report) throw new Error(`Report ${id} not found in store`);
      const built = {
        title: `Report on ${topic}`,
        summary: `Everything you need to know about ${topic}, in one paragraph.`,
        generated_at: new Date().toISOString(),
      };
      setReport(id, { status: 'done', result: built });
      return built;
    });

    return { id, result };
  }
);

module.exports = { functions: [sayHello, makeReport] };
