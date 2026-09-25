export type ColumnName = 'Backlog' | 'InProgress' | 'Review' | 'Done';
export type DepStatus = 'Ready' | 'Blocked';

export interface Task {
  id: string;
  title: string;
  description: string;
  column: ColumnName;
  start_date: string;
  end_date: string;
  depStatus: DepStatus;
}

export interface Dependency {
  task_id: string;
  depends_on_id: string;
}

export interface BoardState {
  tasks: Task[];
  dependencies: Dependency[];
}

export interface AiSuggestion {
  id: string;
  rationale: string;
}

export const COLUMNS: ColumnName[] = ['Backlog', 'InProgress', 'Review', 'Done'];

export const COLUMN_LABELS: Record<ColumnName, string> = {
  Backlog: 'Backlog',
  InProgress: 'In Progress',
  Review: 'Review',
  Done: 'Done',
};
