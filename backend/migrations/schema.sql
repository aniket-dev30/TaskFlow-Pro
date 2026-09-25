-- TaskFlow Pro schema
-- tasks: one row per Kanban card
-- dependencies: edge list — (task_id) depends on (depends_on_id)

CREATE TABLE IF NOT EXISTS tasks (
  id          TEXT PRIMARY KEY,
  title       TEXT NOT NULL,
  description TEXT DEFAULT '',
  column_name TEXT NOT NULL DEFAULT 'Backlog'
                CHECK (column_name IN ('Backlog', 'InProgress', 'Review', 'Done')),
  start_date  DATE NOT NULL,
  end_date    DATE NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS dependencies (
  task_id        TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  depends_on_id  TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  PRIMARY KEY (task_id, depends_on_id),
  CHECK (task_id <> depends_on_id)
);

-- Indexes for fast lookups in both directions of the graph
CREATE INDEX IF NOT EXISTS idx_dependencies_task_id ON dependencies(task_id);
CREATE INDEX IF NOT EXISTS idx_dependencies_depends_on_id ON dependencies(depends_on_id);
