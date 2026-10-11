const express = require('express');
const { serve } = require('inngest/express');
const { inngest } = require('./inngest/client');
const { functions } = require('./inngest/functions');

const app = express();
app.use(express.json());

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// The Dev Server talks to the app through this one route.
app.use('/api/inngest', serve({ client: inngest, functions }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`report-api listening on http://localhost:${PORT}`);
});
