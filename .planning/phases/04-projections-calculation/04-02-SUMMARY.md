---
phase: "04"
plan: "02"
subsystem: calc
tags: [projections, compound-growth, tdd, typescript]
dependency_graph:
  requires:
    - "04-01"  # compoundMonthlyRate + resolveGrowthRate
    - "03-01"  # monthRange + toMonthKey in utils.ts
  provides:
    - buildProjection export
    - ProjectionSeries interface
    - ProjectionBlock interface
  affects:
    - "04-03"  # projection route consumes buildProjection
tech_stack:
  added: []
  patterns:
    - integer-carry month arithmetic (no new Date() in projection loop)
    - lexicographic ISO 8601 upsert comparison for updated_at
    - categories.map() pattern (mirrors aggregateSummary series construction)
key_files:
  created: []
  modified:
    - server/src/calc/projections.ts
    - server/src/calc/projections.test.ts
decisions:
  - "projStart = addOneMonth(latestMonth) — never latestMonth itself (off-by-one guard, PROJ-04)"
  - "projEnd via integer carry loop on em — no new Date() needed"
  - "seed selection: lexicographic max year_month, then max updated_at for ties (mirrors locfFill upsert rule)"
  - "zero seed × any rate = zero — assets with no DPs project as zero"
metrics:
  duration: "112s"
  completed: "2026-04-22"
  tasks: 2
  files_modified: 2
---

# Phase 04 Plan 02: buildProjection Implementation Summary

**One-liner:** Compound-growth projection engine using integer-carry month arithmetic, lexicographic seed upsert, and per-category series aggregation.

## What Was Built

`buildProjection(assets, categories, dataPoints, years)` assembles the math primitives from Plan 04-01 into the unified `ProjectionBlock` response shape:

- **`months[]`** — `years * 12` YYYY-MM strings starting `addOneMonth(latestDP.year_month)`
- **`series[]`** — one `ProjectionSeries` per category (including empty ones with all-zero values)
- **`totals[]`** — per-month sum across all series

`ProjectionSeries` and `ProjectionBlock` stub interfaces replaced with full definitions.

## Task Summary

| Task | Name | Commit | Type |
|------|------|--------|------|
| 1 | Implement buildProjection + interfaces | afaaa27 | feat |
| 2 | Replace RED stub with 9 GREEN tests | 630b0ae | test |

## Test Results

| Suite | Tests | Result |
|-------|-------|--------|
| compoundMonthlyRate | 3/3 | ✅ GREEN |
| resolveGrowthRate | 4/4 | ✅ GREEN |
| buildProjection | 9/9 | ✅ GREEN |
| Phase 3 regression (utils, summary, ranges) | 30/30 | ✅ GREEN |
| **Total** | **46/46** | **✅ ALL GREEN** |

### buildProjection Tests (9)

1. `years=1 generates exactly 12 projection months`
2. `years=30 generates exactly 360 projection months` — PROJ-04 verification
3. `projection months[0] is one month after latestDP year_month — no overlap`
4. `December boundary: projection months[0] after 2024-12 is 2025-01`
5. `12-month compound at 8% annual: final value = seed * 1.08 within 0.01` — PROJ-02 verification
6. `asset with no data points: all projected values are 0 (seed=0)`
7. `seed upsert: among same year_month DPs, latest updated_at wins`
8. `empty category (no assets) produces all-zero values[] entry in series`
9. `totals[i] equals sum of all series values at index i`

## Key Implementation Details

### Month anchor and start
```typescript
const latestMonth = dataPoints.length === 0
  ? currentMonthKey()   // last resort only — no new Date() in normal path
  : dataPoints.reduce((best, dp) => dp.year_month > best ? dp.year_month : best, dataPoints[0].year_month)
const projStart = addOneMonth(latestMonth)  // PROJ-04: no overlap with historical
```

### projEnd via integer carry (no new Date())
```typescript
let [ey, em] = projStart.split('-').map(Number)
em += years * 12 - 1
while (em > 12) { em -= 12; ey++ }
const projEnd = toMonthKey(ey, em)
```

### Seed selection (upsert rule)
```typescript
const latestYM = assetDPs.reduce((best, dp) => dp.year_month > best ? dp.year_month : best, assetDPs[0].year_month)
const bestDP = assetDPs.filter(dp => dp.year_month === latestYM)
  .reduce((a, b) => a.updated_at > b.updated_at ? a : b)
seed = bestDP.value
```

## Deviations from Plan

None — plan executed exactly as written.

## Threat Mitigations Applied

| Threat ID | Mitigation |
|-----------|------------|
| T-04-03 | Test 3: `months[0]` after `'2024-06'` DP is `'2024-07'` — off-by-one regression guard |
| T-04-05 | Accepted: 360 iterations × realistic asset count is sub-100ms |

## Known Stubs

None — `buildProjection` fully implemented with no placeholder values.

## Self-Check: PASSED
