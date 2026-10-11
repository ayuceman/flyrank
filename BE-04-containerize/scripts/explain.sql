-- Stretch goal: see what one index does to a query on a big table.
--
--   npm run explain        (or: psql "$DATABASE_URL" -f scripts/explain.sql)
--
-- Uses a throwaway table so it doesn't touch the real tasks table.

\timing off
\echo '--- seeding 500k rows into tasks_big ---'
DROP TABLE IF EXISTS tasks_big;
CREATE TABLE tasks_big (LIKE tasks INCLUDING DEFAULTS);
INSERT INTO tasks_big (title, done)
SELECT 'task number ' || g, (g % 7 = 0)
FROM generate_series(1, 500000) AS g;
ANALYZE tasks_big;

\echo ''
\echo '--- BEFORE: no index on title ---'
EXPLAIN ANALYZE SELECT * FROM tasks_big WHERE title = 'task number 424242';

\echo ''
\echo '--- creating index ---'
CREATE INDEX tasks_big_title_idx ON tasks_big (title);
ANALYZE tasks_big;

\echo ''
\echo '--- AFTER: btree index on title ---'
EXPLAIN ANALYZE SELECT * FROM tasks_big WHERE title = 'task number 424242';

\echo ''
\echo '--- cleanup ---'
DROP TABLE tasks_big;
