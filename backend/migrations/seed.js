const pool = require('../src/db/pool');

// 10 seeded tasks modeling a realistic small web-app build.
// Dependency shape deliberately includes a converging diamond
// (t2 & t4 -> t5) and a 4-way convergence at t9, so the no-compounding
// rule can be demonstrated directly on the seeded data during a demo.
const tasks = [
  { id: 't1', title: 'Design database schema', description: 'Define tasks & dependencies tables', column_name: 'Done', start_date: '2026-09-25', end_date: '2026-09-25' },
  { id: 't2', title: 'Build backend API', description: 'REST endpoints for tasks/dependencies/status', column_name: 'Backlog', start_date: '2026-09-26', end_date: '2026-09-27' },
  { id: 't3', title: 'Set up CI/CD pipeline', description: 'Lint, test, and deploy automation', column_name: 'Backlog', start_date: '2026-09-26', end_date: '2026-09-26' },
  { id: 't4', title: 'Build frontend UI shell', description: 'Kanban board layout, four columns', column_name: 'Backlog', start_date: '2026-09-26', end_date: '2026-09-27' },
  { id: 't5', title: 'Integrate frontend with API', description: 'Wire board to live task/dependency endpoints', column_name: 'Backlog', start_date: '2026-09-28', end_date: '2026-09-29' },
  { id: 't6', title: 'Write integration tests', description: 'Cycle detection, propagation, rollback', column_name: 'Backlog', start_date: '2026-09-28', end_date: '2026-09-28' },
  { id: 't7', title: 'Write end-to-end tests', description: 'Full user flow: create, drag, depend, block/ready', column_name: 'Backlog', start_date: '2026-09-30', end_date: '2026-09-30' },
  { id: 't8', title: 'Security review', description: 'Input validation, secrets handling, AI input sanitation', column_name: 'Backlog', start_date: '2026-09-28', end_date: '2026-09-28' },
  { id: 't9', title: 'Deploy to staging', description: 'Push build to a live staging URL', column_name: 'Backlog', start_date: '2026-10-01', end_date: '2026-10-01' },
  { id: 't10', title: 'User acceptance testing', description: 'Walk through the end-to-end demo checklist', column_name: 'Backlog', start_date: '2026-10-02', end_date: '2026-10-02' },
];

const dependencies = [
  { task_id: 't2', depends_on_id: 't1' },
  { task_id: 't5', depends_on_id: 't2' },
  { task_id: 't5', depends_on_id: 't4' }, // convergence point #1 (diamond: t1->t2->t5, t4->t5)
  { task_id: 't6', depends_on_id: 't2' },
  { task_id: 't7', depends_on_id: 't5' },
  { task_id: 't8', depends_on_id: 't2' },
  { task_id: 't9', depends_on_id: 't5' },
  { task_id: 't9', depends_on_id: 't6' },
  { task_id: 't9', depends_on_id: 't7' },
  { task_id: 't9', depends_on_id: 't8' }, // convergence point #2 (4 paths converge at t9)
  { task_id: 't10', depends_on_id: 't9' },
];

async function seed() {
  await pool.query('DELETE FROM dependencies');
  await pool.query('DELETE FROM tasks');

  for (const t of tasks) {
    await pool.query(
      `INSERT INTO tasks (id, title, description, column_name, start_date, end_date)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [t.id, t.title, t.description, t.column_name, t.start_date, t.end_date]
    );
  }

  for (const d of dependencies) {
    await pool.query(
      `INSERT INTO dependencies (task_id, depends_on_id) VALUES ($1, $2)`,
      [d.task_id, d.depends_on_id]
    );
  }

  console.log(`Seeded ${tasks.length} tasks and ${dependencies.length} dependencies.`);
  await pool.end();
}

seed().catch((err) => {
  console.error('Seeding failed:', err);
  process.exit(1);
});
