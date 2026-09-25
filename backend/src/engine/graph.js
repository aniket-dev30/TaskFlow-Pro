/**
 * TaskFlow Pro — Dependency Engine
 *
 * Pure, framework-free graph logic. No DB, no HTTP, no UI.
 * This is deliberately isolated so it can be built and unit-tested on
 * Day 1 before any frontend or persistence code exists.
 *
 * Data shapes:
 *   task:      { id, title, column, start_date, end_date }
 *              column is one of: 'Backlog' | 'InProgress' | 'Review' | 'Done'
 *   edge:      { task_id, depends_on_id }
 *              means: task_id cannot start until depends_on_id is Done.
 */

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Build an adjacency map of "prerequisite -> dependents".
 * adj[X] = [Y, Z, ...] means X is a prerequisite of Y and Z.
 */
function buildAdjacency(edges) {
  const adj = new Map();
  for (const { task_id, depends_on_id } of edges) {
    if (!adj.has(depends_on_id)) adj.set(depends_on_id, []);
    adj.get(depends_on_id).push(task_id);
  }
  return adj;
}

/**
 * Build a reverse map "dependent -> its prerequisites".
 * parents[Y] = [X1, X2, ...] means Y depends on X1 and X2.
 */
function buildParents(edges) {
  const parents = new Map();
  for (const { task_id, depends_on_id } of edges) {
    if (!parents.has(task_id)) parents.set(task_id, []);
    parents.get(task_id).push(depends_on_id);
  }
  return parents;
}

/**
 * Rule: No Cycles.
 * Returns true if adding (task_id depends_on_id) would create a circular
 * dependency, given the currently-persisted edges. Does NOT mutate edges.
 *
 * Logic: adding this edge introduces prerequisite-edge depends_on_id -> task_id
 * in the adjacency graph. That closes a cycle iff task_id can already reach
 * depends_on_id via existing edges (a path back would complete the loop).
 */
function wouldCreateCycle(edges, taskId, dependsOnId) {
  if (taskId === dependsOnId) return true; // self-dependency is a trivial cycle

  const adj = buildAdjacency(edges);
  const visited = new Set();
  const stack = [taskId];

  while (stack.length) {
    const current = stack.pop();
    if (current === dependsOnId) return true;
    if (visited.has(current)) continue;
    visited.add(current);
    const next = adj.get(current) || [];
    for (const n of next) stack.push(n);
  }
  return false;
}

/**
 * Kahn's algorithm topological sort.
 * Throws if the graph has a cycle (should never happen if wouldCreateCycle
 * is enforced on every write, but this is a defensive backstop).
 */
function topologicalSort(taskIds, edges) {
  const adj = buildAdjacency(edges);
  const inDegree = new Map(taskIds.map((id) => [id, 0]));

  for (const { task_id } of edges) {
    if (inDegree.has(task_id)) {
      inDegree.set(task_id, (inDegree.get(task_id) || 0) + 1);
    }
  }

  const queue = taskIds.filter((id) => inDegree.get(id) === 0);
  const order = [];

  while (queue.length) {
    const node = queue.shift();
    order.push(node);
    for (const next of adj.get(node) || []) {
      inDegree.set(next, inDegree.get(next) - 1);
      if (inDegree.get(next) === 0) queue.push(next);
    }
  }

  if (order.length !== taskIds.length) {
    throw new Error('Graph contains a cycle — topological sort impossible');
  }
  return order;
}

/**
 * Rule: Dynamic Blocked / Ready status.
 * A task is Ready only if every prerequisite's column is 'Done'.
 * Tasks already In Progress / Review / Done keep their own column as-is;
 * this only computes the *derived* readiness flag used by the board to
 * decide whether a Backlog task can be picked up.
 */
function computeReadiness(tasks, edges) {
  const parents = buildParents(edges);
  const columnById = new Map(tasks.map((t) => [t.id, t.column]));
  const result = new Map();

  for (const task of tasks) {
    const prereqs = parents.get(task.id) || [];
    const allDone = prereqs.every((pid) => columnById.get(pid) === 'Done');
    result.set(task.id, allDone ? 'Ready' : 'Blocked');
  }
  return result;
}

/**
 * Rule: Rollback on Regression.
 * Given the full task list and edges, re-derive readiness from scratch.
 * Because readiness is always DERIVED (never stored as an independent
 * flag), moving a task from Done back to InProgress automatically causes
 * every dependent whose prerequisite is no longer satisfied to become
 * Blocked the next time this function runs — no special-case code needed.
 */
function recomputeAfterChange(tasks, edges) {
  return computeReadiness(tasks, edges);
}

function addDays(dateStr, days) {
  const d = new Date(dateStr);
  return new Date(d.getTime() + days * MS_PER_DAY).toISOString().slice(0, 10);
}

/**
 * Rule: No Compounding.
 *
 * When `changedTaskId`'s schedule shifts by `deltaDays`, every downstream
 * task must shift by the MAXIMUM delay arriving through any single valid
 * path — never the SUM across multiple converging paths.
 *
 * Algorithm: single pass over topological order starting at the changed
 * task. delay[X] accumulates as the max of delay[X] and delay[parent] for
 * every parent of X, so a diamond (A -> B -> D, A -> C -> D) converges to
 * exactly one +N shift at D, not +2N.
 *
 * Returns a Map<taskId, updatedTask> for every task whose dates changed
 * (the changed task itself plus all affected downstream tasks).
 */
function propagateDateShift(tasks, edges, changedTaskId, deltaDays) {
  if (deltaDays === 0) return new Map();

  const taskIds = tasks.map((t) => t.id);
  const order = topologicalSort(taskIds, edges);
  const parents = buildParents(edges);
  const delay = new Map();
  delay.set(changedTaskId, deltaDays);

  // Only need to walk nodes from changedTaskId onward in topo order,
  // but walking the full order is correct and simple — delay stays unset
  // for anything not reachable from the change.
  for (const nodeId of order) {
    const prereqs = parents.get(nodeId) || [];
    for (const p of prereqs) {
      const incoming = delay.get(p);
      if (incoming === undefined) continue;

      // An unset delay is different from a zero delay: negative shifts must
      // still be able to reach a downstream node.
      const current = delay.get(nodeId);
      if (current === undefined || incoming > current) {
        delay.set(nodeId, incoming);
      }
    }
  }

  const tasksById = new Map(tasks.map((t) => [t.id, t]));
  const updates = new Map();

  for (const [taskId, shift] of delay.entries()) {
    if (shift === 0) continue;
    const original = tasksById.get(taskId);
    if (!original) continue;
    updates.set(taskId, {
      ...original,
      start_date: addDays(original.start_date, shift),
      end_date: addDays(original.end_date, shift),
    });
  }

  return updates;
}

module.exports = {
  wouldCreateCycle,
  topologicalSort,
  computeReadiness,
  recomputeAfterChange,
  propagateDateShift,
  buildAdjacency,
  buildParents,
};
