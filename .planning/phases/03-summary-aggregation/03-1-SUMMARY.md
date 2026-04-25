---
phase: 03-summary-aggregation
plan: 01
subsystem: api
tags: [locf, month-key, gap-fill, integer-arithmetic, node-test]

# Dependency graph
requires:
  - phase: 02-crud-api
    provides: DataPoint and Asset type interfaces from server/src/models/index.ts
provides:
  - toMonthKey(year, month) — timezone-safe YYYY-MM key builder (integer arithmetic)
  - monthRange(startYM, endYM) — inclusive ordered YYYY-MM array, integer rollover
  - locfFill(months, dataPoints, assets) — LOCF gap-fill with null-seed + upsert semantics
affects:
  - 03-summary-aggregation (plans 02 and 03 depend on locfFill and monthRange)
  - 04-projections-calculation (will use monthRange for projection intervals)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Integer arithmetic for month keys — never new Date() or toISOString() (DST-safe)"
    - "null carry seed for LOCF — months before first data point emit 0, not the first value"
    - "ISO 8601 lexicographic comparison for upsert (updated_at string sort is correct)"
    - "TDD Wave 0 — test stubs written RED before source files created"

key-files:
  created:
    - server/src/calc/utils.ts
    - server/src/calc/utils.test.ts
    - server/src/calc/summary.ts
    - server/src/calc/summary.test.ts
  modified: []

key-decisions:
  - "Integer arithmetic for month keys: padStart(2,'0') instead of toISOString() prevents UTC shift for UTC+ users"
  - "null carry seed (not 0): distinguishes 'no data seen' from 'data is zero', enabling correct pre-first-dp boundary"
  - "ISO 8601 lexicographic comparison for upsert: updated_at strings are directly comparable without parsing"

patterns-established:
  - "server/src/calc/ — pure calculation layer with no I/O dependencies"
  - "node:test + node:assert/strict — standard library tests, no jest/vitest"
  - "All local imports use .js extension (NodeNext ESM requirement)"

requirements-completed:
  - SUM-02
  - SUM-03

# Metrics
duration: 7min
completed: 2026-04-22
---

# Phase 3 Plan 1: Summary Aggregation Foundation Summary

**LOCF gap-fill algorithm (`locfFill`) and integer-arithmetic month utilities (`toMonthKey`, `monthRange`) — mathematical foundation for all wealth summary aggregation**

## Performance

- **Duration:** 7 min
- **Started:** 2026-04-22T14:23:19Z
- **Completed:** 2026-04-22T14:26:14Z
- **Tasks:** 3
- **Files modified:** 4

## Accomplishments
- Created `server/src/calc/` pure calculation layer with zero I/O dependencies
- `toMonthKey` and `monthRange` use integer arithmetic only — no `Date` construction, DST-safe for all timezones
- `locfFill` implements LOCF with null-seed carry: months before an asset's first data point emit `0` (no backward carry), subsequent months carry last known value forward
- Upsert semantics: when two data points share asset_id + year_month, ISO 8601 lexicographic comparison on `updated_at` selects the winner — no parsing required
- All 12 test cases pass (7 utils + 5 locfFill)

## Task Commits

Each task was committed atomically:

1. **Task 1: Wave 0 test stubs** - `3f973bd` (test)
2. **Task 2: Implement utils.ts** - `da2f33b` (feat)
3. **Task 3: Implement summary.ts** - `6666de6` (feat)

**Plan metadata:** _(docs commit — see below)_

_Note: TDD tasks have separate test (RED) and feat (GREEN) commits_

## Files Created/Modified
- `server/src/calc/utils.ts` — `toMonthKey` + `monthRange` exports (integer arithmetic, no Date)
- `server/src/calc/utils.test.ts` — 7 test cases covering padding, year boundary, edge cases
- `server/src/calc/summary.ts` — `locfFill` export (LOCF with null-seed + upsert semantics)
- `server/src/calc/summary.test.ts` — 5 test cases covering LOCF boundary, upsert order, multi-asset independence

## Decisions Made
- **Integer arithmetic for month keys:** `String(year).padStart(4,'0') + '-' + String(month).padStart(2,'0')` — never `toISOString()` which shifts UTC at local midnight for UTC+ users
- **null carry seed:** `let carry: number | null = null` distinguishes "no data seen yet" from "value is zero", enabling correct 0-emission for pre-first-dp months via `carry ?? 0`
- **ISO 8601 upsert:** `a.updated_at > b.updated_at` (string comparison) is correct for ISO 8601 timestamps — avoids `Date.parse()` overhead

## Deviations from Plan

**Deviation: Test command run from server/ directory**
- **Found during:** Task 2 verification
- **Issue:** `node --import tsx/esm` run from project root fails with `ERR_MODULE_NOT_FOUND` because `tsx` is installed in `server/node_modules/`, not the root
- **Fix:** All test commands run from `server/` directory: `cd server && node --import tsx/esm --test src/calc/utils.test.ts`
- **Impact:** None on produced files — only affects how verification commands are executed

---

**Total deviations:** 1 (execution environment — test runner path)
**Impact on plan:** No scope change. All acceptance criteria met.

## Issues Encountered
- `tsx` not found when running from project root — must run from `server/` subdirectory. Resolved by changing to server directory before test execution.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- `toMonthKey`, `monthRange`, and `locfFill` are ready for use by Plan 03-02 (`getRangeBounds`) and Plan 03-03 (`aggregateSummary`)
- No blockers

## Known Stubs
None — all exports are fully implemented and tested.

## Threat Flags
None — pure calculation layer with no network endpoints, auth paths, or file access.

---
*Phase: 03-summary-aggregation*
*Completed: 2026-04-22*
