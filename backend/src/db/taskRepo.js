const pool = require('./pool');
const { wouldCreateCycle } = require('../engine/graph');

function formatDateOnly(dateValue) {
  if (typeof dateValue === 'string') return dateValue.slice(0, 10);

  const year = dateValue.getFullYear();
  const month = String(dateValue.getMonth() + 1).padStart(2, '0');
  const day = String(dateValue.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

async function getAllTasks() {
  const { rows } = await pool.query('SELECT id, title, description, column_name AS column, start_date, end_date FROM tasks');
  return rows.map((r) => ({
    ...r,
    start_date: formatDateOnly(r.start_date),
    end_date: formatDateOnly(r.end_date),
  }));
}

async function getAllDependencies() {
  const { rows } = await pool.query('SELECT task_id, depends_on_id FROM dependencies');
  return rows;
}

async function createTask(task) {
  const { id, title, description = '', column = 'Backlog', start_date, end_date } = task;
  await pool.query(
    `INSERT INTO tasks (id, title, description, column_name, start_date, end_date)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [id, title, description, column, start_date, end_date]
  );
}

async function deleteTask(taskId) {
  const result = await pool.query('DELETE FROM tasks WHERE id = $1', [taskId]);
  return result.rowCount > 0;
}

async function insertDependency(taskId, dependsOnId) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(1, 1)');

    const { rows: edges } = await client.query(
      'SELECT task_id, depends_on_id FROM dependencies'
    );
    const { rows: tasks } = await client.query(
      'SELECT id FROM tasks WHERE id = $1 OR id = $2',
      [taskId, dependsOnId]
    );
    const taskIds = new Set(tasks.map((task) => task.id));
    if (!taskIds.has(taskId) || !taskIds.has(dependsOnId)) {
      await client.query('ROLLBACK');
      return { outcome: 'not_found' };
    }

    if (wouldCreateCycle(edges, taskId, dependsOnId)) {
      await client.query('ROLLBACK');
      return { outcome: 'cycle' };
    }

    await client.query(
      'INSERT INTO dependencies (task_id, depends_on_id) VALUES ($1, $2)',
      [taskId, dependsOnId]
    );
    await client.query('COMMIT');
    return { outcome: 'created' };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

async function updateTaskColumn(taskId, column) {
  await pool.query(`UPDATE tasks SET column_name = $1 WHERE id = $2`, [column, taskId]);
}

async function applyDateShifts(updates) {
  // updates: Map<taskId, { start_date, end_date }>
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const [taskId, u] of updates.entries()) {
      await client.query(
        `UPDATE tasks SET start_date = $1, end_date = $2 WHERE id = $3`,
        [u.start_date, u.end_date, taskId]
      );
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

module.exports = {
  getAllTasks,
  getAllDependencies,
  createTask,
  deleteTask,
  insertDependency,
  updateTaskColumn,
  applyDateShifts,
};
