---
phase: 07-people-person-filter
plan: "01"
subsystem: server
tags: [persons, crud, model, migration, filter]
dependency_graph:
  requires: []
  provides:
    - GET /api/v1/persons
    - POST /api/v1/persons
    - PUT /api/v1/persons/:id
    - DELETE /api/v1/persons/:id
    - GET /api/v1/summary?person=slug
  affects:
    - server/src/routes/assets.ts
    - server/src/routes/summary.ts
tech_stack:
  added: []
  patterns:
    - db.persons ?? [] guard for backward-compatible YAML reads
    - additive bootstrap migration (never overwrites user data)
    - filteredAssets piped to both locfFill and aggregateSummary
key_files:
  created:
    - server/src/routes/persons.ts
  modified:
    - server/src/models/index.ts
    - server/src/models/seed.ts
    - server/src/bootstrap.ts
    - server/src/routes/assets.ts
    - server/src/routes/summary.ts
    - server/src/index.ts
decisions:
  - Person id is an immutable URL-safe slug derived via toSlug(name) at creation time
  - Bootstrap migration is additive — only seeds when persons absent or empty
  - Summary filter applies before LOCF so chart and totals are consistently scoped
metrics:
  duration: "~8 minutes"
  completed: "2026-04-22T20:22:05Z"
  tasks_completed: 2
  tasks_total: 2
---

# Phase 07 Plan 01: Persons Model, Seed, Migration & CRUD Summary

**One-liner:** Full Person dimension backend — typed model, 4-person seed, additive bootstrap migration, CRUD router with `db.persons ?? []` guards, `person_id` on Asset schema, and `?person=slug` filter on summary endpoint.

## Tasks Completed

| # | Name | Commit | Files |
|---|------|--------|-------|
| 1 | Extend models, seed, and bootstrap | `147c992` | models/index.ts, models/seed.ts, bootstrap.ts |
| 2 | Persons route, asset schema extension, summary filter, index mounting | `a989953` | routes/persons.ts (new), routes/assets.ts, routes/summary.ts, index.ts |

## What Was Built

### Task 1 — Models, Seed, Bootstrap

- **`server/src/models/index.ts`**: Added `Person` interface (`id: string`, `name: string`); added `person_id?: string | null` to `Asset`; added `persons: Person[]` to `Database`.
- **`server/src/models/seed.ts`**: Added `SEED_PERSONS` export — four entries: sasa, matea, elliot, oskar.
- **`server/src/bootstrap.ts`**: Fresh DB path now writes `persons: SEED_PERSONS`. Existing DB path: additive migration seeds persons when `db.persons` is absent or empty — never overwrites user data.

### Task 2 — Persons Route + Extensions

- **`server/src/routes/persons.ts`**: Full CRUD router. All handlers use `db.persons ?? []` guard. `DELETE` returns 409 with `"Person is in use by N asset(s)"` when assets reference the person. `toSlug` at module scope. `PUT` rejects id mutation with 400.
- **`server/src/routes/assets.ts`**: Added `person_id: z.string().nullable().optional()` to `createSchema`; `updateSchema` inherits via `.extend()`.
- **`server/src/routes/summary.ts`**: Added `person: z.string().optional()` to `querySchema`. Handler filters assets before calling `locfFill` and `aggregateSummary` — both receive `filteredAssets`, not `db.assets`.
- **`server/src/index.ts`**: Imports `personsRouter` and mounts at `/api/v1/persons` after `projectionsRouter`, before static serving block.

## Deviations from Plan

None — plan executed exactly as written.

## Threat Model Compliance

All mitigations in the plan's threat register were implemented:

| Threat ID | Mitigation | Status |
|-----------|-----------|--------|
| T-07-01 | `z.string().min(1)` + `toSlug()` on POST name | ✅ |
| T-07-02 | 409 guard before DELETE proceeds | ✅ |
| T-07-03 | Unknown slug returns empty/zero data (accept) | ✅ |
| T-07-04 | Migration only when `!parsed.persons || parsed.persons.length === 0` | ✅ |
| T-07-05 | PUT throws 400 if `body.id !== undefined && body.id !== paramId` | ✅ |

## Verification

```
cd server && npx tsc --noEmit   # exits 0 ✅
```

## Self-Check: PASSED

- `server/src/routes/persons.ts` — FOUND ✅
- `server/src/models/index.ts` — FOUND ✅
- `server/src/models/seed.ts` — FOUND ✅
- `server/src/bootstrap.ts` — FOUND ✅
- Commit `147c992` — FOUND ✅
- Commit `a989953` — FOUND ✅
