import { useState } from 'react';
import { DndContext, type DragEndEvent } from '@dnd-kit/core';
import { COLUMNS } from '../types';
import type { Task, ColumnName } from '../types';
import { useBoard } from '../hooks/useBoard';
import { Column } from './Column';
import { DependencyPicker } from './DependencyPicker';
import { NewTaskModal } from './NewTaskModal';

export function Board() {
  const { board, loading, error, setError, moveTask, shiftTaskDates, addTaskDependency, createTask } = useBoard();
  const [depPickerTask, setDepPickerTask] = useState<Task | null>(null);
  const [showNewTask, setShowNewTask] = useState(false);

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over) return;
    const taskId = String(active.id);
    const targetColumn = over.id as ColumnName;
    const task = board.tasks.find((t) => t.id === taskId);
    if (!task || task.column === targetColumn) return;

    const shiftInput = window.prompt(
      `Move "${task.title}" to ${targetColumn}.\nShift its dates by how many days? (0 = no change)`,
      '0'
    );
    const shiftDays = shiftInput ? parseInt(shiftInput, 10) : 0;

    if (shiftDays && !Number.isNaN(shiftDays)) {
      shiftTaskDates(taskId, targetColumn, shiftDays);
    } else {
      moveTask(taskId, targetColumn);
    }
  }

  if (loading) return <div className="app-loading">Loading board...</div>;

  return (
    <div className="app">
      <header className="app__header">
        <h1>TaskFlow Pro</h1>
        <button onClick={() => setShowNewTask(true)}>+ New Task</button>
      </header>

      {error && (
        <div className="error-banner error-banner--top">
          {error} <button onClick={() => setError(null)}>✕</button>
        </div>
      )}

      <DndContext onDragEnd={handleDragEnd}>
        <div className="board">
          {COLUMNS.map((col) => (
            <Column
              key={col}
              column={col}
              tasks={board.tasks.filter((t) => t.column === col)}
              onOpenDependencies={setDepPickerTask}
            />
          ))}
        </div>
      </DndContext>

      {depPickerTask && (
        <DependencyPicker
          task={depPickerTask}
          allTasks={board.tasks}
          dependencies={board.dependencies}
          onAddDependency={addTaskDependency}
          onClose={() => setDepPickerTask(null)}
        />
      )}

      {showNewTask && (
        <NewTaskModal onCreate={createTask} onClose={() => setShowNewTask(false)} />
      )}
    </div>
  );
}
