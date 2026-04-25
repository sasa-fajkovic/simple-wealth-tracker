---
phase: 04-projections-calculation
plan: "03"
subsystem: server/routes
tags: [hono, route, projections, wiring, validation]
dependency_graph:
  requires:
    - 04-02  # buildProjection calc function
    - 03-01  # routes/summary.ts structure (template)
  provides:
    - GET /api/v1/projections?years= HTTP endpoint
  affects:
    - server/src/index.ts
    - server/src/routes/projections.ts
tech_stack:
  added: []
  patterns:
    - zValidator with z.coerce.number() for numeric query params (string coercion)
    - hook pattern for 400 validation errors (same as all other routes)
    - Combined historical + projection response (PROJ-05)
key_files:
  created:
    - server/src/routes/projections.ts
  modified:
    - server/src/index.ts
decisions:
  - "z.coerce.number() required for years param — query strings arrive as text, not number"
  - "No try/catch in route handler — errors propagate to app.onError already in index.ts"
  - "Historical uses getRangeBounds('max', ...) to return full data range consistently"
  - "Projection boundary guaranteed consistent — same db.dataPoints array used in both calc calls"
metrics:
  duration: "~2 minutes"
  completed: "2026-04-22T16:11:10Z"
  tasks_completed: 3
  files_changed: 2
---

# Phase 4 Plan 03: Projections Route Wiring Summary

**One-liner:** HTTP wiring for projections — zValidator-gated GET /api/v1/projections returning `{ historical, projection }` with full boundary integrity.

## What Was Built

Route `GET /api/v1/projections?years=N` wired from HTTP to calc layer. Two files changed:

1. **`server/src/routes/projections.ts`** — New Hono route handler that:
   - Validates `years` query param with `z.coerce.number().int().min(1).max(30).default(10)`
   - Returns `400` with `{"error":"..."}` on out-of-range or invalid input (T-04-04 mitigated)
   - Derives `latestMonth`/`earliestMonth` from `db.dataPoints` (same logic as `summary.ts`)
   - Calls `aggregateSummary` with `getRangeBounds('max', ...)` for the full historical block
   - Calls `buildProjection(db.assets, db.categories, db.dataPoints, years)` for projections
   - Returns `c.json({ historical, projection })` (PROJ-05)

2. **`server/src/index.ts`** — Two targeted edits:
   - Import `projectionsRouter` from `./routes/projections.js` (line 13)
   - Mount `app.route('/api/v1/projections', projectionsRouter)` before `serveStatic` (line 39 < 44)

## Smoke Test Results (All GREEN)

Server started with empty seed DB (`/tmp/wt-smoke-*.yaml`).

| Check | Expected | Actual | Result |
|-------|----------|--------|--------|
| Health check | `{"status":"ok"}` | `{"status":"ok"}` | ✅ |
| Both keys present | `historical`, `projection` | Both present | ✅ |
| Default years=10 projection months | 120 | 120 | ✅ |
| Boundary consecutive | proj[0] = hist[-1]+1mo | `2026-04` → `2026-05` | ✅ |
| years=31 → 400 | 400 | 400 | ✅ |
| years=0 → 400 | 400 | 400 | ✅ |
| years=5 → 60 months | 60 | 60 | ✅ |
| years=5 totals length | 60 | 60 | ✅ |

Error response body for years=31: `{"error":"Number must be less than or equal to 30"}` ✅

## Unit Test Results

All 46 tests GREEN (no regressions):

```
compoundMonthlyRate   3/3
resolveGrowthRate     4/4
buildProjection       9/9
getRangeBounds       11/11
locfFill              5/5
aggregateSummary      7/7
toMonthKey            3/3
monthRange            4/4
─────────────────────────
Total                46/46 PASS
```

## Commits

| Hash | Message |
|------|---------|
| `8aa6893` | feat(04-03): create GET /api/v1/projections route handler |
| `787aeaa` | feat(04-03): mount projectionsRouter at /api/v1/projections |

## Deviations from Plan

None — plan executed exactly as written.

The `node -e "import('./src/routes/projections.js')"` verification command from the plan requires `--import tsx/esm` flag to load TypeScript files; used `node --import tsx/esm` instead. This is not a deviation — it's the same tool used for all TypeScript verification in this project.

## Threat Model Coverage

| Threat ID | Status |
|-----------|--------|
| T-04-04 (Tampering — years param) | ✅ Mitigated — `z.coerce.number().int().min(1).max(30)` rejects out-of-range values; returns 400 |
| T-04-06 (DoS — years=30) | ✅ Accepted — pure in-memory, household scale |
| T-04-07 (Info Disclosure — stack traces) | ✅ Already mitigated by `app.onError` in index.ts |

## Known Stubs

None — route returns live data from `readDb()` and calc functions.

## Self-Check: PASSED

- [x] `server/src/routes/projections.ts` exists
- [x] `server/src/index.ts` contains projectionsRouter import and mount
- [x] Commit `8aa6893` exists (`feat(04-03): create GET /api/v1/projections route handler`)
- [x] Commit `787aeaa` exists (`feat(04-03): mount projectionsRouter at /api/v1/projections`)
- [x] All 46 unit tests GREEN
- [x] All 8 smoke checks GREEN
