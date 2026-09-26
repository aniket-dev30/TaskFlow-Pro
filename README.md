# TaskFlow Pro — Dependency-Aware Workflow and DAG Scheduling Engine

Built for the Contata Hackathon 2026 (TaskFlow Pro problem statement).

## Structure

- `backend/` — the dependency engine (cycle detection, Ready/Blocked
  derivation, no-compounding date propagation in both directions,
  rollback) + Express API + PostgreSQL. 20 passing unit tests verify the core dependency-graph behavior independently of the UI.
- `frontend/` — React + TypeScript Kanban board, drag-and-drop,
  dependency management, and Gemini-backed AI suggestions.

  ## Architecture & Data Model

### Architecture

TaskFlow Pro uses a three-layer architecture:

- **Frontend:** React + TypeScript Kanban UI. Handles task interaction,
  drag-and-drop, dependency management, and AI suggestion review.
- **Backend:** Node.js + Express REST API. Owns task validation,
  dependency validation, DAG cycle detection, Ready/Blocked derivation,
  and date propagation.
- **Database:** PostgreSQL. Persists tasks and dependency edges.

The dependency engine is kept separate from the UI so the core DAG rules
can be tested independently of any frontend code.

### Data Model

#### `tasks`

| Field         | Purpose                                             |
|---------------|-------------------------------------------------------|
| `id`          | Unique task identifier                                |
| `title`       | Task name                                             |
| `description` | Task details/context                                  |
| `column_name` | Kanban column: Backlog / InProgress / Review / Done   |
| `start_date`  | Scheduled start                                       |
| `end_date`    | Scheduled end                                         |
| `created_at`  | Creation timestamp                                    |

Ready/Blocked is NOT a stored field. It is derived at read-time from
whether every prerequisite task's `column_name` is `Done` — this keeps
readiness always consistent with the graph rather than risking it
drifting out of sync with a separately stored flag.

#### `dependencies`

| Field           | Purpose                     |
|-----------------|-------------------------------|
| `task_id`       | Dependent/downstream task     |
| `depends_on_id` | Required prerequisite task    |

Both columns are foreign keys into `tasks.id`, together forming a
directed edge list representing the dependency graph.

## Quick start

```bash
# 1. Backend
cd backend
npm install
cp .env.example .env        # set your Postgres credentials + Gemini key

# create the database first, e.g.:
psql -U postgres -c "CREATE DATABASE taskflow_pro;"

npm run migrate
npm run seed
npm start                   # http://localhost:4000

# 2. Frontend (in a second terminal)
cd frontend
npm install
cp .env.example .env

npm run dev                 # http://localhost:5173
```

## Seeded data

10 tasks with a realistic dependency graph, including two convergence
points (a diamond at `t5` and a 4-way convergence at `t9`) specifically
so the no-compounding rule can be demonstrated live: shift `t1`'s dates
and watch `t5`/`t9` shift by the correct amount, not an accumulated one.

## Verified against the brief's core rules

Each of the following was confirmed both by the automated test suite
(`backend/tests/graph.test.js`) and by manual testing on the running app:

- **No Cycles** — a direct and a multi-hop circular dependency are both
  rejected before being persisted; the existing graph is left unchanged.

- **No Compounding** — when an upstream task's dates shift, a downstream
  task with multiple converging dependency paths shifts by the correct
  single amount, not an accumulated sum. Verified for both forward
  (delay) and backward (earlier) shifts.

- **Rollback on Regression** — moving a completed task back to In Progress
  correctly re-blocks any dependents whose prerequisite is no longer
  satisfied.

- **Persistence** — task state, dependencies, dates, and board position
  survive a full browser refresh, since all state is server-backed.

- **AI-Augmented Suggestions** — Gemini-suggested dependencies are never
  auto-applied; confirming one routes through the exact same dependency
  validation and cycle-checking path as a manually added dependency.
  Circular AI suggestions are rejected identically to manual ones.

## AI-Tool Declaration

Gemini API (model: `gemini-3.1-flash-lite`) is used to suggest likely
task dependencies from a task's title and description (see
`backend/src/routes/aiSuggestions.js`).

Suggestions are grounded in the supplied task metadata and are never
auto-applied. They populate a "Suggested Dependencies" panel and only
become real graph edges after explicit user confirmation. Confirmed
suggestions are re-validated through the same dependency validation and
cycle-detection path as manually added dependencies.

Tasks with insufficient or meaningless context do not trigger a Gemini
request and do not receive speculative dependency suggestions.

If the Gemini call fails, times out, or returns malformed output, the
core board and manual dependency management remain unaffected.
During development, ChatGPT, Claude, and GitHub Copilot were also used for
development assistance including architecture discussion, code generation,
debugging, testing, security review, and documentation. Generated output was
reviewed, integrated, and tested as part of the development process.

## Key assumptions and limitations

- Single team/workspace MVP — no multi-tenant authentication.

- AI endpoint rate limiting is in-memory and per process; multi-instance
  deployments need a shared rate-limit store.

- Critical Path view is not yet implemented (optional bonus per the brief).

- Date propagation shifts both `start_date` and `end_date` by the same
  signed delta (positive or negative); it does not yet account for
  weekends/holidays or per-task duration changes independent of a shift.

- The column-update and date-propagation steps in
  `PATCH /tasks/:id/status` are two separate database operations rather
  than a single transaction; acceptable for this MVP's scale but a
  production version should wrap them together.

- AI suggestion responses are validated for the expected task ID and
  non-empty rationale, but LLM-generated suggestions remain probabilistic
  and require human review.

- AI suggestions require a `GEMINI_API_KEY`; without one, the app
  degrades gracefully and simply shows no suggestions rather than
  erroring.

## Business Value & Scalability

TaskFlow Pro helps teams manage work where task completion depends on
prerequisites and schedule changes propagate through the workflow.

The dependency-aware DAG model can support larger workflows by separating
task data, dependency relationships, and graph scheduling logic. PostgreSQL
provides persistent storage, while the backend API keeps workflow rules
centralized and reusable across clients.

For a production-scale deployment, the MVP would be extended with
authentication/authorization, multi-workspace support, shared rate limiting,
observability, and additional database/indexing optimization.

## Testing

- 20/20 backend DAG tests passing
- Cycle detection tested
- Diamond dependency / no-compounding tested
- Positive, zero, and negative date shifts tested
- Ready/Blocked transitions tested
- Rollback behavior tested
- Dependency validation and duplicate handling tested
- AI insufficient-context filtering tested
- AI timeout handling tested
- AI rate limiting tested
- Generic 500 error handling tested
- CORS configuration verified
- Frontend production build passing
