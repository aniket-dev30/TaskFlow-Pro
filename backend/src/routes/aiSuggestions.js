const express = require('express');
const router = express.Router();
const repo = require('../db/taskRepo');

const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const RATE_LIMIT_MAX_REQUESTS = 20;
const rateLimitByIp = new Map();

const rateLimitCleanup = setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of rateLimitByIp) {
    if (entry.resetAt <= now) rateLimitByIp.delete(ip);
  }
}, RATE_LIMIT_WINDOW_MS);
rateLimitCleanup.unref();

function isRateLimited(ip) {
  const now = Date.now();
  const current = rateLimitByIp.get(ip);
  if (!current || current.resetAt <= now) {
    rateLimitByIp.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return false;
  }
  if (current.count >= RATE_LIMIT_MAX_REQUESTS) return true;

  current.count += 1;
  return false;
}

const GENERIC_CONTEXT_WORDS = new Set([
  'a',
  'an',
  'and',
  'item',
  'new',
  'some',
  'task',
  'test',
  'testing',
  'the',
  'thing',
  'todo',
  'update',
  'work',
]);

function hasMeaningfulTaskContext(title, description) {
  const context = [title, description]
    .filter((value) => typeof value === 'string')
    .join(' ')
    .trim();
  const words = context.match(/[A-Za-z0-9]+/g) || [];
  const meaningfulWords = words.filter((word) => {
    const normalized = word.toLowerCase();
    const looksLikeAcronym = word.length >= 2 && word === word.toUpperCase();
    const looksLikeAWord = /[aeiou]/i.test(word) || looksLikeAcronym;
    return word.length >= 3 && !GENERIC_CONTEXT_WORDS.has(normalized) && looksLikeAWord;
  });

  return meaningfulWords.length >= 2;
}

/**
 * POST /ai/suggest-dependencies
 * Body: { taskId, title, description }
 *
 * Calls Gemini to suggest likely prerequisite tasks from the existing
 * board. Suggestions are informational only — they are returned to the
 * client for the "Suggested Dependencies" panel and are NEVER persisted
 * here. Turning a suggestion into a real edge always goes through
 * POST /dependencies, which re-runs cycle detection regardless of origin.
 *
 * If the Gemini call fails, times out, or returns unparseable output,
 * this endpoint returns an empty suggestion list rather than an error —
 * the board and manual dependency creation are unaffected either way.
 */
router.post('/suggest-dependencies', async (req, res) => {
  const clientIp = req.ip || req.socket.remoteAddress || 'unknown';
  if (isRateLimited(clientIp)) {
    return res.status(429).json({ error: 'Too many AI suggestion requests. Please try again later.' });
  }

  const { taskId, title, description } = req.body;
  if (!taskId || !title) {
    return res.status(400).json({ error: 'taskId and title are required' });
  }
  if (!hasMeaningfulTaskContext(title, description)) {
    return res.json({
      suggestions: [],
      note: 'Insufficient task context to generate reliable dependency suggestions.',
    });
  }

  try {
    const existingTasks = await repo.getAllTasks();
    const candidates = existingTasks.filter((t) => t.id !== taskId);

    if (!process.env.GEMINI_API_KEY) {
      // No key configured — degrade gracefully, do not error the request.
      return res.json({ suggestions: [], note: 'AI suggestions unavailable (no API key configured).' });
    }

    const suggestions = await callGeminiForSuggestions({ title, description, candidates });
    // Defense in depth: only ever return IDs that actually exist on the board,
    // even though the prompt already constrains the model to known IDs.
    const validIds = new Set(candidates.map((c) => c.id));
    const filtered = suggestions.filter(
      (suggestion) =>
        suggestion &&
        typeof suggestion.id === 'string' &&
        suggestion.id.length > 0 &&
        typeof suggestion.rationale === 'string' &&
        suggestion.rationale.trim().length > 0 &&
        validIds.has(suggestion.id)
    );

    res.json({ suggestions: filtered });
  } catch (err) {
    // Graceful degradation: AI is additive, never on the critical path.
    console.error('Gemini suggestion call failed:', err.message);
    res.json({ suggestions: [], note: 'AI suggestions temporarily unavailable.' });
  }
});

async function callGeminiForSuggestions({ title, description, candidates }) {
  const prompt = buildPrompt({ title, description, candidates });

  const model = process.env.GEMINI_MODEL || 'gemini-3.1-flash-lite';
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { responseMimeType: 'application/json' },
        }),
        signal: controller.signal,
      }
    );

    if (!response.ok) {
      const bodyText = await response.text().catch(() => '');
      throw new Error(`Gemini API returned ${response.status} for model "${model}": ${bodyText.slice(0, 300)}`);
    }

    const data = await response.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error('Gemini returned no content');

    const parsed = JSON.parse(text); // may throw on malformed output — caught by caller
    if (!Array.isArray(parsed)) throw new Error('Gemini output was not a list');
    return parsed; // expected: [{ id, rationale }, ...]
  } finally {
    clearTimeout(timeout);
  }
}

function buildPrompt({ title, description, candidates }) {
  const taskList = candidates.map((c) => `- id: ${c.id}, title: "${c.title}"`).join('\n');
  return [
    'You are suggesting task PREREQUISITES for a dependency-aware Kanban board.',
    `New task title: "${title}"`,
    `New task description: "${description || ''}"`,
    'Existing tasks on the board (only these IDs are valid):',
    taskList,
    '',
    'Return ONLY a JSON array of objects: [{ "id": "<existing task id>", "rationale": "<short reason>" }].',
    'Only suggest a candidate when the target title/description and candidate metadata show a direct prerequisite relationship, such as the target explicitly requiring or consuming the candidate task output.',
    'The rationale must cite or clearly paraphrase concrete information present in those fields; do not use outside knowledge or generic workflow assumptions.',
    'Do not suggest a candidate merely because it is commonly useful, normally occurs earlier, or is generally associated with this type of work.',
    'If the relationship cannot be justified from the supplied fields alone, return []. Never invent task relationships.',
    'Do not invent task IDs that are not in the list above.',
  ].join('\n');
}

module.exports = router;
