---
phase: "04"
plan: "01"
subsystem: calc
tags: [projections, math, tdd, compound-interest, growth-rate]
dependency_graph:
  requires: [03-03-SUMMARY]
  provides: [compoundMonthlyRate, resolveGrowthRate]
  affects: [server/src/calc/projections.ts, server/src/calc/projections.test.ts]
tech_stack:
  added: []
  patterns:
    - Math.pow compound monthly rate formula (never annualRate/12)
    - Explicit null check for optional override (not falsy)
    - ESM stub exports for test-file module linkage
key_files:
  created:
    - server/src/calc/projections.ts
    - server/src/calc/projections.test.ts
  modified: []
decisions:
  - resolveGrowthRate uses !== null (not falsy) — explicit 0 is a valid override
  - buildProjection stub kept RED intentionally (Wave 0 — Plan 04-02 implements)
  - addOneMonth/currentMonthKey are private helpers (not exported)
metrics:
  duration: "94s"
  completed: "2026-04-22"
  tasks_completed: 3
  tasks_total: 3
  files_changed: 2
---

# Phase 4 Plan 01: Projections Math Primitives Summary

**One-liner:** Compound monthly rate via `Math.pow(1+r,1/12)-1` and `resolveGrowthRate` with explicit `!== null` override check — foundation for `buildProjection` in Plan 04-02.

## What Was Built

Created `server/src/calc/projections.ts` with two exported math primitives and stub scaffolding for `buildProjection`. Created companion test file `server/src/calc/projections.test.ts` with 8 tests across 3 describe blocks.

### compoundMonthlyRate
- Formula: `Math.pow(1 + annualRate, 1/12) - 1`
- Returns 0 for 0% annual rate (exact)
- Returns ≈0.006434 for 8% annual (not 0.006667 simple division)
- 12-month compounding returns seed × 1.08 within 0.01%

### resolveGrowthRate
- Checks `asset.projected_yearly_growth !== null` (explicit null check, not falsy)
- Falls back to category rate when null
- Falls back to 0 when category not found
- Explicit 0 on asset returns 0 (does NOT inherit category — zero-growth is intentional)

### buildProjection (stub)
- Exports correct TypeScript signature
- Throws 'not yet implemented'
- Test is RED (assert.fail) — correct Wave 0 state for Plan 04-02

## Commits

| Task | Hash | Message |
|------|------|---------|
| Task 1 | 9e57d77 | feat: Wave 0 test stubs — projections.test.ts (04-01 Task 1) |
| Task 2 | d8b5fae | feat: compoundMonthlyRate skeleton with ESM stubs (04-01 Task 2) |
| Task 3 | af88293 | feat: resolveGrowthRate — explicit null check, 0 is valid override (04-01 Task 3) |

## Test Results

| Suite | Pass | Fail | Notes |
|-------|------|------|-------|
| compoundMonthlyRate | 3 | 0 | All GREEN |
| resolveGrowthRate | 4 | 0 | All GREEN |
| buildProjection | 0 | 1 | RED stub — correct Wave 0 |
| Phase 3 regression | 30 | 0 | All GREEN |

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

| Stub | File | Line | Reason |
|------|------|------|--------|
| `buildProjection` throws 'not yet implemented' | `server/src/calc/projections.ts` | ~60 | Intentional — Plan 04-02 implements |
| `buildProjection` test: `assert.fail(...)` | `server/src/calc/projections.test.ts` | ~76 | Intentional RED — Wave 0 compliance |

## Threat Surface Scan

No new network endpoints, auth paths, file access patterns, or schema changes introduced. Pure calculation module — no threat flags.

## Self-Check: PASSED

- ✅ `server/src/calc/projections.ts` exists
- ✅ `server/src/calc/projections.test.ts` exists
- ✅ Commit 9e57d77 exists
- ✅ Commit d8b5fae exists
- ✅ Commit af88293 exists
- ✅ compoundMonthlyRate: 3/3 PASS
- ✅ resolveGrowthRate: 4/4 PASS
- ✅ buildProjection: 1/1 FAIL (correct RED)
- ✅ Phase 3 regression: 30/30 PASS
