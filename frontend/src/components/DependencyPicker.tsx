import { useState, useEffect } from 'react';
import type { Task, Dependency, AiSuggestion } from '../types';
import { suggestDependencies } from '../api/client';

interface Props {
  task: Task;
  allTasks: Task[];
  dependencies: Dependency[];
  onAddDependency: (taskId: string, dependsOnId: string, source: 'manual' | 'ai_suggestion') => Promise<void>;
  onClose: () => void;
}

export function DependencyPicker({ task, allTasks, dependencies, onAddDependency, onClose }: Props) {
  const [selectedId, setSelectedId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiNote, setAiNote] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<AiSuggestion[]>([]);

  const currentDeps = dependencies
    .filter((d) => d.task_id === task.id)
    .map((d) => d.depends_on_id);

  const candidateOptions = allTasks.filter(
    (t) => t.id !== task.id && !currentDeps.includes(t.id)
  );

  useEffect(() => {
    setSuggestions([]);
    setAiNote(null);
  }, [task.id]);

  async function handleAddManual() {
    if (!selectedId) return;
    setError(null);
    try {
      await onAddDependency(task.id, selectedId, 'manual');
      setSelectedId('');
    } catch (err: any) {
      // 409 = would create a cycle; the engine rejected it and left the graph unchanged.
      setError(err.message || 'Failed to add dependency');
    }
  }

  async function handleGetAiSuggestions() {
    setAiLoading(true);
    setAiNote(null);
    setError(null);
    try {
      const result = await suggestDependencies(task.id, task.title, task.description);
      setSuggestions(result.suggestions || []);
      if (result.note) setAiNote(result.note);
      if ((result.suggestions || []).length === 0 && !result.note) {
        setAiNote('No likely prerequisites found among existing tasks.');
      }
    } catch (err: any) {
      setAiNote('AI suggestions temporarily unavailable.');
    } finally {
      setAiLoading(false);
    }
  }

  async function handleConfirmSuggestion(suggestion: AiSuggestion) {
    setError(null);
    try {
      await onAddDependency(task.id, suggestion.id, 'ai_suggestion');
      setSuggestions((prev) => prev.filter((s) => s.id !== suggestion.id));
    } catch (err: any) {
      // Same cycle-detection path as manual edges — an AI suggestion can
      // still be rejected here, and the user sees exactly why.
      setError(err.message || 'AI suggestion rejected');
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal__header">
          <h3>Dependencies for "{task.title}"</h3>
          <button className="modal__close" onClick={onClose}>✕</button>
        </div>

        <div className="modal__section">
          <h4>Current prerequisites</h4>
          {currentDeps.length === 0 && <p className="muted">No prerequisites yet.</p>}
          <ul className="dep-list">
            {currentDeps.map((depId) => {
              const depTask = allTasks.find((t) => t.id === depId);
              return (
                <li key={depId}>
                  {depTask?.title || depId}{' '}
                  <span className={`badge ${depTask?.column === 'Done' ? 'badge--ready' : 'badge--blocked'}`}>
                    {depTask?.column}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>

        <div className="modal__section">
          <h4>Add a dependency manually</h4>
          <div className="row">
            <select value={selectedId} onChange={(e) => setSelectedId(e.target.value)}>
              <option value="">Select a task...</option>
              {candidateOptions.map((t) => (
                <option key={t.id} value={t.id}>{t.title}</option>
              ))}
            </select>
            <button onClick={handleAddManual} disabled={!selectedId}>Add</button>
          </div>
        </div>

        <div className="modal__section">
          <h4>AI-suggested dependencies</h4>
          <button onClick={handleGetAiSuggestions} disabled={aiLoading}>
            {aiLoading ? 'Asking Gemini...' : 'Suggest dependencies with AI'}
          </button>
          {aiNote && <p className="muted">{aiNote}</p>}
          {suggestions.length > 0 && (
            <ul className="dep-list dep-list--suggestions">
              {suggestions.map((s) => (
                <li key={s.id}>
                  <div>
                    <strong>{allTasks.find((t) => t.id === s.id)?.title || s.id}</strong>
                    <p className="muted small">{s.rationale}</p>
                  </div>
                  <button onClick={() => handleConfirmSuggestion(s)}>Confirm</button>
                </li>
              ))}
            </ul>
          )}
          <p className="muted small">
            Suggestions are never applied automatically — confirming still runs the same
            cycle-detection check as a manual dependency.
          </p>
        </div>

        {error && <div className="error-banner">{error}</div>}
      </div>
    </div>
  );
}
