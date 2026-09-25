import { useDroppable } from '@dnd-kit/core';
import type { ColumnName, Task } from '../types';
import { COLUMN_LABELS } from '../types';
import { TaskCard } from './TaskCard';

interface Props {
  column: ColumnName;
  tasks: Task[];
  onOpenDependencies: (task: Task) => void;
}

export function Column({ column, tasks, onOpenDependencies }: Props) {
  const { setNodeRef, isOver } = useDroppable({ id: column });

  return (
    <div ref={setNodeRef} className={`column ${isOver ? 'column--over' : ''}`}>
      <div className="column__header">
        <h3>{COLUMN_LABELS[column]}</h3>
        <span className="column__count">{tasks.length}</span>
      </div>
      <div className="column__body">
        {tasks.map((task) => (
          <TaskCard key={task.id} task={task} onOpenDependencies={onOpenDependencies} />
        ))}
        {tasks.length === 0 && <div className="column__empty">No tasks</div>}
      </div>
    </div>
  );
}
