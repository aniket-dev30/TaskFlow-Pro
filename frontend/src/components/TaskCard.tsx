import { useDraggable } from '@dnd-kit/core';
import type { Task } from '../types';

interface Props {
  task: Task;
  onOpenDependencies: (task: Task) => void;
}

export function TaskCard({ task, onOpenDependencies }: Props) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: task.id,
  });

  const style: React.CSSProperties = {
    transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 10 : 'auto',
  };

  const isBlocked = task.depStatus === 'Blocked';

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      className={`task-card ${isBlocked ? 'task-card--blocked' : 'task-card--ready'}`}
    >
      <div className="task-card__header">
        <span className="task-card__title">{task.title}</span>
        <span className={`badge ${isBlocked ? 'badge--blocked' : 'badge--ready'}`}>
          {task.depStatus}
        </span>
      </div>
      {task.description && <p className="task-card__desc">{task.description}</p>}
      <div className="task-card__dates">
        {task.start_date} → {task.end_date}
      </div>
      <button
        className="task-card__deps-btn"
        onPointerDown={(e) => e.stopPropagation()} // don't trigger drag
        onClick={(e) => {
          e.stopPropagation();
          onOpenDependencies(task);
        }}
      >
        Dependencies
      </button>
    </div>
  );
}
