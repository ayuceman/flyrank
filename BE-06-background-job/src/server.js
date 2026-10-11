const express = require('express');
const { serve } = require('inngest/express');
const { inngest } = require('./inngest/client');
const { functions } = require('./inngest/functions');
const { createReport, getReport } = require('./reports');

const app = express();
app.use(express.json());

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// The fast door: save, send the event, answer 202. No slow work here.
app.post('/reports', async (req, res, next) => {
  try {
    const { topic } = req.body || {};
    // Wrong input is rejected at the door. No report, no event, nothing to retry.
    if (typeof topic !== 'string' || topic.trim() === '') {
      return res.status(400).json({ error: 'topic is required' });
    }
    const report = createReport(topic.trim());
    await inngest.send({
      name: 'report/requested',
      data: { id: report.id, topic: report.topic },
    });
    res.status(202).json({ id: report.id, status: report.status });
  } catch (err) {
    next(err);
  }
});

// The status endpoint: pending now, done (+ result) later.
app.get('/reports/:id', (req, res) => {
  const report = getReport(req.params.id);
  if (!report) return res.status(404).json({ error: 'Report not found' });
  res.json(report);
});

// The Dev Server talks to the app through this one route.
app.use('/api/inngest', serve({ client: inngest, functions }));

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`report-api listening on http://localhost:${PORT}`);
});
