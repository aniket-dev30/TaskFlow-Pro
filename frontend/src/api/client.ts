import type { BoardState, ColumnName, AiSuggestion } from '../types';

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';

async function handleResponse(res: Response) {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const err = new Error(body.error || `Request failed with status ${res.status}`);
    (err as any).status = res.status;
    (err as any).body = body;
    throw err;
  }
  return res.json();
}

export async function fetchBoard(): Promise<BoardState> {
  const res = await fetch(`${BASE_URL}/tasks`);
  return handleResponse(res);
}

export async function createTask(task: {
  id: string;
  title: string;
  description?: string;
  column?: ColumnName;
  start_date: string;
  end_date: string;
}) {
  const res = await fetch(`${BASE_URL}/tasks`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(task),
  });
  return handleResponse(res);
}

export async function updateTaskStatus(
  id: string,
  column: ColumnName,
  dateShiftDays?: number
) {
  const res = await fetch(`${BASE_URL}/tasks/${id}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ column, dateShiftDays }),
  });
  return handleResponse(res);
}

/**
 * Adds a dependency edge. Throws with status 409 and a clear message if
 * the backend rejects it as a cycle — the caller (UI) surfaces this to
 * the user rather than silently swallowing it.
 */
export async function addDependency(
  taskId: string,
  dependsOnId: string,
  source: 'manual' | 'ai_suggestion' = 'manual'
) {
  const res = await fetch(`${BASE_URL}/dependencies`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ task_id: taskId, depends_on_id: dependsOnId, source }),
  });
  return handleResponse(res);
}

export async function suggestDependencies(
  taskId: string,
  title: string,
  description: string
): Promise<{ suggestions: AiSuggestion[]; note?: string }> {
  const res = await fetch(`${BASE_URL}/ai/suggest-dependencies`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ taskId, title, description }),
  });
  return handleResponse(res);
}
