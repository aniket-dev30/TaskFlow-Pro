const express = require('express');
const router = express.Router();
const repo = require('../db/taskRepo');

// POST /dependencies — add an edge (task_id depends on depends_on_id).
// Every edge — whether added manually or approved from an AI suggestion —
// passes through this same cycle check. There is no separate, looser path
// for AI-originated edges.
router.post('/', async (req, res) => {
  try {
    const { task_id, depends_on_id, source } = req.body; // source: 'manual' | 'ai_suggestion', for logging only
    if (
      typeof task_id !== 'string' ||
      typeof depends_on_id !== 'string' ||
      !task_id.trim() ||
      !depends_on_id.trim()
    ) {
      return res.status(400).json({ error: 'task_id and depends_on_id are required' });
    }

    const result = await repo.insertDependency(task_id, depends_on_id);
    if (result.outcome === 'not_found') {
      return res.status(404).json({ error: 'task_id and depends_on_id must reference existing tasks' });
    }
    if (result.outcome === 'cycle') {
      return res.status(409).json({
        error: 'Rejected: this dependency would create a circular relationship.',
        task_id,
        depends_on_id,
        source: source || 'manual',
      });
    }

    res.status(201).json({ task_id, depends_on_id, source: source || 'manual' });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'This dependency already exists.' });
    }
    if (err.code === '23503') {
      return res.status(404).json({ error: 'task_id and depends_on_id must reference existing tasks' });
    }
    console.error('Failed to create dependency:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
