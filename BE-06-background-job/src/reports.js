const crypto = require('node:crypto');

// In-memory store. It forgets everything on restart — on purpose, same as A1.
// The job system (Inngest) is what survives restarts, not this map.
const reports = new Map();

function createReport(topic) {
  const report = {
    id: crypto.randomUUID(),
    topic,
    status: 'pending',
    created_at: new Date().toISOString(),
  };
  reports.set(report.id, report);
  return report;
}

function getReport(id) {
  return reports.get(id) || null;
}

// Upsert. The job may finish after a restart wiped this map (see README,
// "the restart experiment"), so a missing row is recreated from the event data
// rather than treated as an error.
function setReport(id, patch) {
  const current = reports.get(id) || { id, created_at: new Date().toISOString() };
  const next = { ...current, ...patch };
  reports.set(id, next);
  return next;
}

function allReports() {
  return [...reports.values()];
}

module.exports = { createReport, getReport, setReport, allReports };
