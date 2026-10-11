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

function setReport(id, patch) {
  const current = reports.get(id);
  if (!current) return null;
  const next = { ...current, ...patch };
  reports.set(id, next);
  return next;
}

function allReports() {
  return [...reports.values()];
}

module.exports = { createReport, getReport, setReport, allReports };
