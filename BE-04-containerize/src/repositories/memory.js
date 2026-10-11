// In-memory repository. Same interface as the Postgres one, just an array.
// I keep it around for tests and for running the app without a database.

function createMemoryRepository() {
  let tasks = [];
  let nextId = 1;

  const clone = (t) => ({ ...t });

  return {
    async init() {
      tasks = [];
      nextId = 1;
    },

    async list({ search, done, sort } = {}) {
      let rows = tasks;
      if (search) {
        const q = search.toLowerCase();
        rows = rows.filter((t) => t.title.toLowerCase().includes(q));
      }
      if (done !== undefined) rows = rows.filter((t) => t.done === done);
      rows = [...rows];
      if (sort === "title") {
        rows.sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: "base" }));
      } else {
        rows.sort((a, b) => a.id - b.id);
      }
      return rows.map(clone);
    },

    async get(id) {
      const t = tasks.find((t) => t.id === id);
      return t ? clone(t) : null;
    },

    async create({ title, done }) {
      const now = new Date().toISOString();
      const t = { id: nextId++, title, done, created_at: now, updated_at: now };
      tasks.push(t);
      return clone(t);
    },

    async update(id, { title, done }) {
      const t = tasks.find((t) => t.id === id);
      if (!t) return null;
      if (title !== undefined) t.title = title;
      if (done !== undefined) t.done = done;
      t.updated_at = new Date().toISOString();
      return clone(t);
    },

    async remove(id) {
      const before = tasks.length;
      tasks = tasks.filter((t) => t.id !== id);
      return tasks.length < before;
    },

    async stats() {
      const done = tasks.filter((t) => t.done).length;
      return { total: tasks.length, done, pending: tasks.length - done };
    },

    async healthcheck() {
      return "ok (memory)";
    },

    async close() {},
  };
}

module.exports = { createMemoryRepository };
