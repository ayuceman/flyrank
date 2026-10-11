// In-memory report store. Lost on restart, which is why done/failed are upserts.
const reports = new Map();

function createReport({ id, topic }) {
  const report = {
    id,
    topic,
    status: "pending",
    created_at: new Date().toISOString(),
  };
  reports.set(id, report);
  return report;
}

function getReport(id) {
  return reports.get(id);
}

function listReports() {
  return Array.from(reports.values());
}

// Upsert: if the store was wiped while the job was running, recreate the record.
function upsertReport(id, topic, patch) {
  const existing = reports.get(id) || {
    id,
    topic,
    status: "pending",
    created_at: new Date().toISOString(),
  };
  const updated = { ...existing, ...patch };
  reports.set(id, updated);
  return updated;
}

function markDone(id, topic, result) {
  return upsertReport(id, topic, { status: "done", result });
}

function markFailed(id, topic, errorMessage) {
  return upsertReport(id, topic, { status: "failed", error: errorMessage });
}

function counts() {
  const c = { pending: 0, done: 0, failed: 0 };
  for (const r of reports.values()) {
    if (c[r.status] !== undefined) c[r.status] += 1;
  }
  return c;
}

module.exports = { createReport, getReport, listReports, markDone, markFailed, counts };
