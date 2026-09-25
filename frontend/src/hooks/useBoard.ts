import { useState, useEffect, useCallback } from 'react';
import type { BoardState, ColumnName } from '../types';
import { fetchBoard, updateTaskStatus, addDependency, createTask as apiCreateTask } from '../api/client';

export function useBoard() {
  const [board, setBoard] = useState<BoardState>({ tasks: [], dependencies: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setError(null);
      const data = await fetchBoard();
      setBoard(data);
    } catch (err: any) {
      setError(err.message || 'Failed to load board');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const moveTask = useCallback(
    async (taskId: string, column: ColumnName) => {
      // Optimistic update so drag-and-drop feels instant; refresh() below
      // reconciles with the server's derived readiness afterward.
      setBoard((prev) => ({
        ...prev,
        tasks: prev.tasks.map((t) => (t.id === taskId ? { ...t, column } : t)),
      }));
      try {
        await updateTaskStatus(taskId, column);
      } catch (err: any) {
        setError(err.message || 'Failed to move task');
      } finally {
        // Always re-sync with the server: moving one task can flip
        // Ready/Blocked on any number of other tasks (rollback rule).
        await refresh();
      }
    },
    [refresh]
  );

  const shiftTaskDates = useCallback(
    async (taskId: string, column: ColumnName, dateShiftDays: number) => {
      try {
        await updateTaskStatus(taskId, column, dateShiftDays);
      } catch (err: any) {
        setError(err.message || 'Failed to shift dates');
      } finally {
        await refresh();
      }
    },
    [refresh]
  );

  const addTaskDependency = useCallback(
    async (taskId: string, dependsOnId: string, source: 'manual' | 'ai_suggestion' = 'manual') => {
      await addDependency(taskId, dependsOnId, source); // let caller catch 409s
      await refresh();
    },
    [refresh]
  );

  const createTask = useCallback(
    async (task: {
      id: string;
      title: string;
      description?: string;
      column?: ColumnName;
      start_date: string;
      end_date: string;
    }) => {
      await apiCreateTask(task);
      await refresh();
    },
    [refresh]
  );

  return { board, loading, error, setError, moveTask, shiftTaskDates, addTaskDependency, createTask, refresh };
}
