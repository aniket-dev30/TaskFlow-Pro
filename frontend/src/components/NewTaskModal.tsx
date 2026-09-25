import { useState } from 'react';

interface Props {
  onCreate: (task: {
    id: string;
    title: string;
    description?: string;
    start_date: string;
    end_date: string;
  }) => Promise<void>;
  onClose: () => void;
}

function slugify(title: string) {
  return (
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '') +
    '-' +
    Math.random().toString(36).slice(2, 6)
  );
}

export function NewTaskModal({ onCreate, onClose }: Props) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const today = new Date().toISOString().slice(0, 10);
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) {
      setError('Title is required');
      return;
    }
    if (endDate < startDate) {
      setError('End date must be on or after the start date');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await onCreate({
        id: slugify(title),
        title: title.trim(),
        description: description.trim(),
        start_date: startDate,
        end_date: endDate,
      });
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to create task');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal__header">
          <h3>New task</h3>
          <button className="modal__close" onClick={onClose}>✕</button>
        </div>
        <form onSubmit={handleSubmit} className="modal__section">
          <label>
            Title
            <input value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
          </label>
          <label>
            Description
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
          </label>
          <div className="row">
            <label>
              Start date
              <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </label>
            <label>
              End date
              <input
                type="date"
                min={startDate}
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </label>
          </div>
          {error && <div className="error-banner">{error}</div>}
          <button type="submit" disabled={submitting}>
            {submitting ? 'Creating...' : 'Create task'}
          </button>
        </form>
      </div>
    </div>
  );
}
