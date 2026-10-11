// In-memory report store. Shared by the API routes and the Inngest functions.
const reports = new Map();

function create(topic) {
  const id = `rep_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const report = {
    id,
    topic,
    status: "pending", // pending | done | failed
    result: null,
    error: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  reports.set(id, report);
  return report;
}

function get(id) {
  return reports.get(id) || null;
}

function update(id, patch) {
  const report = reports.get(id);
  if (!report) return null;
  Object.assign(report, patch, { updatedAt: new Date().toISOString() });
  return report;
}

function counts() {
  const c = { pending: 0, done: 0, failed: 0 };
  for (const r of reports.values()) {
    if (c[r.status] !== undefined) c[r.status] += 1;
  }
  return c;
}

module.exports = { create, get, update, counts };
