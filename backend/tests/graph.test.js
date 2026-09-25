const {
  wouldCreateCycle,
  topologicalSort,
  computeReadiness,
  propagateDateShift,
} = require('../src/engine/graph');

describe('No Cycles rule', () => {
  test('rejects a direct A->B->A cycle', () => {
    const edges = [{ task_id: 'B', depends_on_id: 'A' }]; // B depends on A
    // Adding "A depends on B" would close the loop A->B->A
    expect(wouldCreateCycle(edges, 'A', 'B')).toBe(true);
  });

  test('rejects an indirect multi-hop cycle A->B->C->A', () => {
    const edges = [
      { task_id: 'B', depends_on_id: 'A' }, // B depends on A
      { task_id: 'C', depends_on_id: 'B' }, // C depends on B
    ];
    // Adding "A depends on C" closes A->B->C->A
    expect(wouldCreateCycle(edges, 'A', 'C')).toBe(true);
  });

  test('rejects a self-dependency', () => {
    expect(wouldCreateCycle([], 'A', 'A')).toBe(true);
  });

  test('allows a valid new edge that does not close a loop', () => {
    const edges = [{ task_id: 'B', depends_on_id: 'A' }];
    expect(wouldCreateCycle(edges, 'C', 'A')).toBe(false);
  });

  test('existing valid graph is unaffected by a rejected edge (no mutation)', () => {
    const edges = [{ task_id: 'B', depends_on_id: 'A' }];
    const before = JSON.stringify(edges);
    wouldCreateCycle(edges, 'A', 'B');
    expect(JSON.stringify(edges)).toBe(before);
  });

  test('AI-suggested circular dependency is rejected the same as a manual one', () => {
    // A->B, B->C already exist. AI suggests C->A (i.e. "A depends on C").
    const edges = [
      { task_id: 'B', depends_on_id: 'A' },
      { task_id: 'C', depends_on_id: 'B' },
    ];
    const aiSuggestion = { task_id: 'A', depends_on_id: 'C' };
    const rejected = wouldCreateCycle(edges, aiSuggestion.task_id, aiSuggestion.depends_on_id);
    expect(rejected).toBe(true);
    // Graph must remain exactly as it was — AI suggestions never bypass validation
    expect(edges).toEqual([
      { task_id: 'B', depends_on_id: 'A' },
      { task_id: 'C', depends_on_id: 'B' },
    ]);
  });
});

describe('Dynamic Blocked / Ready status', () => {
  test('task with an unfinished prerequisite is Blocked', () => {
    const tasks = [
      { id: 'A', column: 'InProgress' },
      { id: 'B', column: 'Backlog' },
    ];
    const edges = [{ task_id: 'B', depends_on_id: 'A' }];
    const readiness = computeReadiness(tasks, edges);
    expect(readiness.get('B')).toBe('Blocked');
  });

  test('task becomes Ready once all prerequisites are Done', () => {
    const tasks = [
      { id: 'A', column: 'Done' },
      { id: 'B', column: 'Backlog' },
    ];
    const edges = [{ task_id: 'B', depends_on_id: 'A' }];
    const readiness = computeReadiness(tasks, edges);
    expect(readiness.get('B')).toBe('Ready');
  });

  test('task with no prerequisites is always Ready', () => {
    const tasks = [{ id: 'A', column: 'Backlog' }];
    expect(computeReadiness(tasks, []).get('A')).toBe('Ready');
  });

  test('task needs ALL prerequisites done, not just one', () => {
    const tasks = [
      { id: 'A', column: 'Done' },
      { id: 'B', column: 'InProgress' },
      { id: 'C', column: 'Backlog' },
    ];
    const edges = [
      { task_id: 'C', depends_on_id: 'A' },
      { task_id: 'C', depends_on_id: 'B' },
    ];
    expect(computeReadiness(tasks, edges).get('C')).toBe('Blocked');
  });
});

describe('Rollback on Regression', () => {
  test('moving a Done task back to InProgress re-blocks its dependent', () => {
    let tasks = [
      { id: 'A', column: 'Done' },
      { id: 'B', column: 'InProgress' }, // was Ready, now being worked on
    ];
    const edges = [{ task_id: 'B', depends_on_id: 'A' }];

    expect(computeReadiness(tasks, edges).get('B')).toBe('Ready');

    // Regression: A gets moved back to InProgress
    tasks = tasks.map((t) => (t.id === 'A' ? { ...t, column: 'InProgress' } : t));

    expect(computeReadiness(tasks, edges).get('B')).toBe('Blocked');
  });
});

describe('No Compounding — the diamond graph case', () => {
  // A -> B -> D
  // A -> C -> D
  // A shifts +3 days. D must shift +3, NOT +6.
  const tasks = [
    { id: 'A', column: 'InProgress', start_date: '2026-01-01', end_date: '2026-01-05' },
    { id: 'B', column: 'Backlog', start_date: '2026-01-06', end_date: '2026-01-10' },
    { id: 'C', column: 'Backlog', start_date: '2026-01-06', end_date: '2026-01-10' },
    { id: 'D', column: 'Backlog', start_date: '2026-01-11', end_date: '2026-01-15' },
  ];
  const edges = [
    { task_id: 'B', depends_on_id: 'A' },
    { task_id: 'C', depends_on_id: 'A' },
    { task_id: 'D', depends_on_id: 'B' },
    { task_id: 'D', depends_on_id: 'C' },
  ];

  test('D shifts by exactly +3 days, not +6', () => {
    const updates = propagateDateShift(tasks, edges, 'A', 3);
    expect(updates.get('D').end_date).toBe('2026-01-18'); // +3, not +18 (+6 shift)
    expect(updates.get('D').start_date).toBe('2026-01-14');
  });

  test('B and C each shift by +3 independently', () => {
    const updates = propagateDateShift(tasks, edges, 'A', 3);
    expect(updates.get('B').start_date).toBe('2026-01-09');
    expect(updates.get('C').start_date).toBe('2026-01-09');
  });

  test('A itself is included in the update set', () => {
    const updates = propagateDateShift(tasks, edges, 'A', 3);
    expect(updates.get('A').start_date).toBe('2026-01-04');
  });

  test('a longer chain (A->D->E) propagates the same +3, not an accumulating +3 per hop', () => {
    const chainTasks = [
      ...tasks,
      { id: 'E', column: 'Backlog', start_date: '2026-01-16', end_date: '2026-01-20' },
    ];
    const chainEdges = [...edges, { task_id: 'E', depends_on_id: 'D' }];
    const updates = propagateDateShift(chainTasks, chainEdges, 'A', 3);
    expect(updates.get('E').start_date).toBe('2026-01-19'); // +3, same as D
  });

  test('unrelated tasks are not shifted at all', () => {
    const unrelated = [...tasks, { id: 'Z', column: 'Backlog', start_date: '2026-02-01', end_date: '2026-02-05' }];
    const updates = propagateDateShift(unrelated, edges, 'A', 3);
    expect(updates.has('Z')).toBe(false);
  });

  test('propagates a negative shift through the diamond', () => {
    const updates = propagateDateShift(tasks, edges, 'A', -3);
    expect(updates.get('B').start_date).toBe('2026-01-03');
    expect(updates.get('C').end_date).toBe('2026-01-07');
    expect(updates.get('D').start_date).toBe('2026-01-08');
    expect(updates.get('D').end_date).toBe('2026-01-12');
  });

  test('does not change dates for a zero shift', () => {
    expect(propagateDateShift(tasks, edges, 'A', 0)).toEqual(new Map());
  });

  test('shifts each date by exactly one day for a +1 shift', () => {
    const updates = propagateDateShift(tasks, edges, 'A', 1);
    expect(updates.get('A').start_date).toBe('2026-01-02');
    expect(updates.get('A').end_date).toBe('2026-01-06');
    expect(updates.get('D').start_date).toBe('2026-01-12');
    expect(updates.get('D').end_date).toBe('2026-01-16');
  });
});

describe('Topological sort', () => {
  test('produces a valid order respecting all edges', () => {
    const taskIds = ['A', 'B', 'C', 'D'];
    const edges = [
      { task_id: 'B', depends_on_id: 'A' },
      { task_id: 'C', depends_on_id: 'A' },
      { task_id: 'D', depends_on_id: 'B' },
      { task_id: 'D', depends_on_id: 'C' },
    ];
    const order = topologicalSort(taskIds, edges);
    const pos = Object.fromEntries(order.map((id, i) => [id, i]));
    expect(pos['A']).toBeLessThan(pos['B']);
    expect(pos['A']).toBeLessThan(pos['C']);
    expect(pos['B']).toBeLessThan(pos['D']);
    expect(pos['C']).toBeLessThan(pos['D']);
  });
});
