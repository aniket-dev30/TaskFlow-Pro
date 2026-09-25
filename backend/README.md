# TaskFlow Pro — Backend (Day 1: Dependency Engine)

The dependency engine is built and unit-tested independently of any UI,
per the sprint plan. This is what exists after Day 1.

## What's here

- `src/engine/graph.js` — pure, framework-free DAG logic:
  - Cycle detection (No Cycles rule)
  - Ready/Blocked derivation (Dynamic Blocked/Ready)
  - No-compounding date propagation (No Compounding rule)
  - Rollback (recomputes readiness from scratch — no special-case code needed)
- `tests/graph.test.js` — 17 passing unit tests, including:
  - the diamond-graph no-compounding case (A→B→D, A→C→D, D shifts +3 not +6)
  - direct and multi-hop cycle rejection
  - an AI-suggested circular dependency being rejected exactly like a manual one
- `src/db/` — Postgres schema, connection pool, and repository layer
- `src/routes/` — Express endpoints wiring the tested engine to real HTTP calls
- `migrations/schema.sql` + `migrations/seed.js` — schema and 10 realistic seeded tasks with a genuine dependency graph (includes two convergence points for demoing no-compounding)

## Setup

```bash
npm install
cp .env.example .env   # fill in your Postgres credentials + Gemini API key
createdb taskflow_pro  # or equivalent for your Postgres setup
npm run migrate
npm run seed
npm start               # starts the API on :4000
```

## Run the engine tests (no database required)

```bash
npm test
```

## API

- `GET /tasks` — full board state with derived readiness attached
- `POST /tasks` — create a task
- `PATCH /tasks/:id/status` — move a task's column; triggers propagation (if `dateShiftDays` provided) and board-wide readiness recompute
- `POST /dependencies` — add an edge; rejected with 409 if it would create a cycle
- `POST /ai/suggest-dependencies` — Gemini 3.1 Flash-Lite-backed suggestions; returns `{ suggestions: [] }` gracefully if the AI call fails or no API key is set

## Key assumption

Single-workspace MVP — no multi-tenant auth in this build. AI-generated
suggestions are never auto-applied: they always flow through the same
`POST /dependencies` cycle-detection path as a manual edge.
