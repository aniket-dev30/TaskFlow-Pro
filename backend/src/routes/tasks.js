const express = require('express');
const router = express.Router();
const repo = require('../db/taskRepo');
const { computeReadiness, propagateDateShift } = require('../engine/graph');

// GET /tasks — full board state, with derived readiness attached
router.get('/', async (req, res) => {
  try {
    const [tasks, edges] = await Promise.all([repo.getAllTasks(), repo.getAllDependencies()]);
    const readiness = computeReadiness(tasks, edges);
    const enriched = tasks.map((t) => ({ ...t, depStatus: readiness.get(t.id) }));
    res.json({ tasks: enriched, dependencies: edges });
  } catch (err) {
    console.error('Failed to fetch tasks:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /tasks — create a new task
router.post('/', async (req, res) => {
  try {
    const { id, title, description, column, start_date, end_date } = req.body;
    if (!id || !title || !start_date || !end_date) {
      return res.status(400).json({ error: 'id, title, start_date, end_date are required' });
    }
    if (end_date < start_date) {
      return res.status(400).json({ error: 'end_date must be on or after start_date' });
    }
    await repo.createTask({ id, title, description, column, start_date, end_date });
    res.status(201).json({ id, title, description, column: column || 'Backlog', start_date, end_date });
  } catch (err) {
    console.error('Failed to create task:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /tasks/:id — remove a task and its dependency edges.
// The database foreign keys cascade deletion to both dependency directions.
router.delete('/:id', async (req, res) => {
  try {
    const deleted = await repo.deleteTask(req.params.id);
    if (!deleted) return res.status(404).json({ error: 'Task not found' });
    res.status(204).end();
  } catch (err) {
    console.error('Failed to delete task:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH /tasks/:id/status — move a task between columns.
// This is the single entry point for all column changes, so that
// propagation and rollback are always triggered consistently.
router.patch('/:id/status', async (req, res) => {
  try {
    const { id } = req.params;
    const { column, dateShiftDays } = req.body;
    if (!column) return res.status(400).json({ error: 'column is required' });

    await repo.updateTaskColumn(id, column);

    let updatedTaskDates = {};
    if (typeof dateShiftDays === 'number' && dateShiftDays !== 0) {
      const tasks = await repo.getAllTasks();
      const edges = await repo.getAllDependencies();
      const updates = propagateDateShift(tasks, edges, id, dateShiftDays);
      await repo.applyDateShifts(updates);
      updatedTaskDates = Object.fromEntries(updates);
    }

    // Rollback on Regression: recompute readiness for the WHOLE board after
    // any column change, since moving one task (even backward) can flip
    // any number of downstream dependents between Ready and Blocked.
    const tasks = await repo.getAllTasks();
    const edges = await repo.getAllDependencies();
    const readiness = computeReadiness(tasks, edges);

    res.json({
      updatedTask: id,
      column,
      propagatedDateShifts: updatedTaskDates,
      readiness: Object.fromEntries(readiness),
    });
  } catch (err) {
    console.error('Failed to update task status:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
