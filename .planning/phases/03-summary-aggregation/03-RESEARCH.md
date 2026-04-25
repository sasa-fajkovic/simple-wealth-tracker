# Phase 3: Summary Aggregation — Research

**Researched:** 2026-04-23
**Domain:** Pure calculation layer (LOCF gap-filling, time-range math, aggregation) + Hono GET endpoint wiring
**Confidence:** HIGH

---

## Summary

Phase 3 adds a pure, read-only calculation layer to the existing Hono backend. No new storage patterns are introduced — the phase is entirely built on top of `readDb()` from Phase 1. Three new files go into `server/src/calc/` (utils, ranges, summary) and one new route file goes into `server/src/routes/summary.ts`. The route is mounted in `index.ts` with the same `app.route(...)` pattern already used by categories, assets, and data points.

The trickiest correctness constraints are: (1) LOCF carry must be seeded as `null` so months before an asset's first data point emit `0`, not the asset's first known value; (2) month iteration must use integer arithmetic (`m > 12 → m=1, y++`) rather than `new Date()` to avoid DST boundary bugs; (3) `period_delta_pct` and `pct_of_total` must guard divide-by-zero explicitly (return `0`, not `NaN`). These are well-bounded, pure functions that are straightforwardly unit-testable.

The implementation is pure TypeScript with no new npm dependencies. All validation uses the existing `zod ^3.24.4` and `@hono/zod-validator ^0.7.0` already installed. Query parameter validation uses `zValidator('query', schema, hook)` following the same hook pattern established in Phase 2.

**Primary recommendation:** Implement as three distinct files — `calc/utils.ts`, `calc/ranges.ts`, `calc/summary.ts` — keeping pure functions separate from route wiring. All edge cases (empty DB, no data per asset, divide-by-zero) must be handled in the pure calc layer, not in the route handler.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Month key generation / iteration | API / Backend (`calc/utils.ts`) | — | Pure arithmetic, no I/O, no DB |
| Range bound resolution | API / Backend (`calc/ranges.ts`) | — | Date math from `latestMonth`/`earliestMonth` params |
| LOCF gap-fill algorithm | API / Backend (`calc/summary.ts`) | — | Stateless transform of DataPoint[] into Map |
| Summary aggregation (totals, delta, breakdown) | API / Backend (`calc/summary.ts`) | — | Combines LOCF data with Category metadata |
| Route wiring + query validation | API / Backend (`routes/summary.ts`) | — | Calls `readDb`, invokes calc layer, returns JSON |
| Storage reads | DB / Storage (`storage/index.ts`) | — | Already built in Phase 1; Phase 3 only calls `readDb()` |

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| SUM-01 | `GET /api/v1/summary?range=` — accepts `ytd`, `6m`, `1y`, `2y`, `3y`, `5y`, `10y`, `max`; defaults to `1y` | `zValidator('query', rangeSchema, hook)` with `z.enum([...]).default('1y')` |
| SUM-02 | Per asset per month: select data point with latest `updated_at` (upsert semantics) | `locfFill` inner loop: filter by `asset_id + year_month`, sort by `updated_at` descending, take first |
| SUM-03 | LOCF gap-filling: carry forward last known value; use 0 if no prior value | Seed carry as `null`; emit `0` when carry is null; emit carry value when carry is non-null |
| SUM-04 | Response includes `months[]`, `series[]` (per category with `values[]`), `totals[]` | `aggregateSummary` output shape — see Response Shape section |
| SUM-05 | Response includes `current_total`, `period_delta_abs`, `period_delta_pct`, `category_breakdown[]` | Guard divide-by-zero for both `period_delta_pct` and `pct_of_total` |

</phase_requirements>

---

## Standard Stack

### Core (no new dependencies — all already installed)

| Library | Version | Purpose | Source |
|---------|---------|---------|--------|
| `hono` | `^4.12.14` | Router, `HTTPException` | `server/package.json` [VERIFIED: file] |
| `@hono/zod-validator` | `^0.7.0` | `zValidator('query', schema, hook)` | `server/package.json` [VERIFIED: file] |
| `zod` | `^3.24.4` | Query param schema (`z.enum`) | `server/package.json` [VERIFIED: file] |
| `node:test` | built-in (Node 25.9.0) | Unit test runner for calc functions | `node --version` [VERIFIED: bash] |
| `tsx` | `^4.21.0` | Run TypeScript tests without compile step | `server/package.json` [VERIFIED: file] |

> **No new `npm install` required for Phase 3 implementation.** `node:test` (Node's built-in test runner) requires no installation and works with `tsx` for TypeScript.

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `node:test` | vitest | vitest is faster/better DX but requires installing a new devDep; `node:test` + tsx is zero-install for a project this simple |
| `z.enum([...]).default('1y')` | manual `c.req.query()` + switch | zValidator gives consistent error shape automatically; matches Phase 2 hook pattern |

---

## Architecture Patterns

### System Architecture Diagram

```
GET /api/v1/summary?range=1y
         │
         ▼
routes/summary.ts
  │  zValidator('query', rangeSchema, hook)
  │  → unknown range → 400 {"error":"..."}
  │
  ├─► readDb()  ────────────────► storage/index.ts (mutex-guarded YAML read)
  │     └── db.dataPoints, db.assets, db.categories
  │
  ├─► findLatestMonth(db.dataPoints)
  │     └── max(year_month) or current month if empty
  │
  ├─► findEarliestMonth(db.dataPoints)  [for max range only]
  │     └── min(year_month) or latestMonth if empty
  │
  ├─► calc/ranges.ts: getRangeBounds(range, latestMonth, earliestMonth?)
  │     └── { startYM, endYM }
  │
  ├─► calc/utils.ts: monthRange(startYM, endYM)
  │     └── string[]  e.g. ["2024-05","2024-06",...,"2025-04"]
  │
  ├─► calc/summary.ts: locfFill(months, db.dataPoints, db.assets)
  │     └── Map<assetId, Map<monthKey, number>>
  │
  ├─► calc/summary.ts: aggregateSummary(locfData, db.categories, months)
  │     └── { months, series, totals, current_total,
  │           period_delta_abs, period_delta_pct, category_breakdown }
  │
  └─► c.json(response, 200)
```

### Recommended Project Structure

```
server/src/
  calc/
    utils.ts        # toMonthKey(y, m), monthRange(start, end) — pure, no imports from project
    ranges.ts       # getRangeBounds(range, latestMonth, earliestMonth?) — pure
    summary.ts      # locfFill(...), aggregateSummary(...) — pure (imports models for types only)
  routes/
    summary.ts      # GET /api/v1/summary?range= — wires calc layer to HTTP
    categories.ts   # (existing)
    assets.ts       # (existing)
    dataPoints.ts   # (existing)
  index.ts          # add: import summaryRouter + app.route('/api/v1/summary', summaryRouter)
```

> `calc/` functions have no runtime side effects and no I/O — this makes them trivially unit-testable. The route file is the only layer with `readDb()` calls.

---

### Pattern 1: Query Parameter Validation with zValidator

[VERIFIED: server/src/routes/categories.ts — hook pattern identical]

```typescript
// Source: server/src/routes/categories.ts (hook pattern — copy verbatim)
// server/src/routes/summary.ts

import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { readDb } from '../storage/index.js'

const router = new Hono()

const hook = (result: { success: boolean; error?: z.ZodError }, c: any) => {
  if (!result.success && result.error) {
    return c.json({ error: result.error.issues[0]?.message ?? 'Invalid request' }, 400 as const)
  }
}

const VALID_RANGES = ['ytd', '6m', '1y', '2y', '3y', '5y', '10y', 'max'] as const
const querySchema = z.object({
  range: z.enum(VALID_RANGES).default('1y'),
})

router.get('/', zValidator('query', querySchema, hook), async (c) => {
  const { range } = c.req.valid('query')
  // ...
})

export default router
```

**Key:** `zValidator('query', ...)` validates `c.req.query()` params, not JSON body. Same hook ensures `{"error":"..."}` shape on bad input (API-01). `z.enum([...]).default('1y')` handles missing `range` param automatically.

---

### Pattern 2: Month Key Utilities

[VERIFIED: server/src/models/index.ts comment lines 24–26, ROADMAP.md Plan 3.1]

```typescript
// server/src/calc/utils.ts

// toMonthKey — zero-pads to produce YYYY-MM
// Source: models/index.ts MODEL-03 comment: "built from getFullYear()/getMonth() — no toISOString()"
export function toMonthKey(year: number, month: number): string {
  return String(year).padStart(4, '0') + '-' + String(month).padStart(2, '0')
}

// monthRange — generates ordered YYYY-MM array using integer arithmetic ONLY
// Source: ROADMAP.md Plan 3.1 ⚠️ note: "if (m > 12) { m = 1; y++ }" — never new Date()
export function monthRange(startYM: string, endYM: string): string[] {
  const [sy, sm] = startYM.split('-').map(Number)
  const [ey, em] = endYM.split('-').map(Number)
  const months: string[] = []
  let y = sy, m = sm
  while (y < ey || (y === ey && m <= em)) {
    months.push(toMonthKey(y, m))
    m++
    if (m > 12) { m = 1; y++ }
  }
  return months
}
```

**Critical:** `new Date(y, m, 1)` can produce wrong month at DST boundaries in some timezones. Integer arithmetic is always correct.

---

### Pattern 3: LOCF Gap-Fill Algorithm

[VERIFIED: ROADMAP.md Plan 3.1, SUM-02, SUM-03]

```typescript
// server/src/calc/summary.ts
import type { DataPoint, Asset } from '../models/index.js'

// Returns Map<assetId → Map<monthKey → filledValue>>
export function locfFill(
  months: string[],
  dataPoints: DataPoint[],
  assets: Asset[],
): Map<string, Map<string, number>> {
  const result = new Map<string, Map<string, number>>()

  for (const asset of assets) {
    const assetMap = new Map<string, number>()
    let carry: number | null = null  // null = no data seen yet → emit 0

    for (const month of months) {
      // SUM-02: upsert semantics — latest updated_at wins for same asset+month
      const candidates = dataPoints.filter(
        (dp) => dp.asset_id === asset.id && dp.year_month === month,
      )
      if (candidates.length > 0) {
        // Sort descending by updated_at (ISO strings are lexicographically comparable)
        candidates.sort((a, b) => b.updated_at.localeCompare(a.updated_at))
        carry = candidates[0].value
      }
      // SUM-03: before first data point → 0 (not first value); after → carry forward
      assetMap.set(month, carry ?? 0)
    }

    result.set(asset.id, assetMap)
  }

  return result
}
```

**Critical LOCF boundary:** Seed carry as `null`. Only set carry when a data point is found. When carry is `null`, emit `0`. This is a forward-only carry — no backward fill.

---

### Pattern 4: Range Bounds Calculation

[VERIFIED: ROADMAP.md Plan 3.2, SUM-01]

```typescript
// server/src/calc/ranges.ts
import { toMonthKey } from './utils.js'

// Subtracts N months from a YYYY-MM string using integer arithmetic
function subtractMonths(ym: string, n: number): string {
  let [y, m] = ym.split('-').map(Number)
  m -= n
  while (m <= 0) { m += 12; y-- }
  return toMonthKey(y, m)
}

export function getRangeBounds(
  range: string,
  latestMonth: string,
  earliestMonth?: string,   // required for 'max'; equals latestMonth if not provided
): { startYM: string; endYM: string } {
  const now = new Date()
  const currentYear = now.getFullYear()

  switch (range) {
    case 'ytd':
      return { startYM: toMonthKey(currentYear, 1), endYM: latestMonth }
    case '6m':
      return { startYM: subtractMonths(latestMonth, 5), endYM: latestMonth }   // 6 inclusive
    case '1y':
      return { startYM: subtractMonths(latestMonth, 11), endYM: latestMonth }  // 12 inclusive
    case '2y':
      return { startYM: subtractMonths(latestMonth, 23), endYM: latestMonth }
    case '3y':
      return { startYM: subtractMonths(latestMonth, 35), endYM: latestMonth }
    case '5y':
      return { startYM: subtractMonths(latestMonth, 59), endYM: latestMonth }
    case '10y':
      return { startYM: subtractMonths(latestMonth, 119), endYM: latestMonth }
    case 'max':
      return { startYM: earliestMonth ?? latestMonth, endYM: latestMonth }
    default:
      throw new Error(`Unknown range: ${range}`)  // never reached — zod validated
  }
}
```

**Inclusive month counting:** `6m` means 6 months total (Nov, Dec, Jan, Feb, Mar, Apr) → subtract 5, not 6.

---

### Pattern 5: Response Shape and Aggregation

[VERIFIED: REQUIREMENTS.md SUM-04, SUM-05, ROADMAP.md Plan 3.3]

```typescript
// server/src/calc/summary.ts (continued)
import type { Category } from '../models/index.js'

export interface SummaryResponse {
  months: string[]
  series: {
    category_id: string
    category_name: string
    color: string
    values: number[]       // one per month, length === months.length, no nulls/gaps
  }[]
  totals: number[]         // sum across all categories per month
  current_total: number    // totals[totals.length - 1]
  period_delta_abs: number // totals[last] - totals[0]  (can be negative)
  period_delta_pct: number // (delta / totals[0]) * 100, or 0 if totals[0] === 0
  category_breakdown: {
    category_id: string
    category_name: string
    color: string
    value: number          // last month value for this category
    pct_of_total: number   // value / current_total * 100, or 0 if current_total === 0
  }[]
}

export function aggregateSummary(
  locfData: Map<string, Map<string, number>>,
  categories: Category[],
  assets: import('../models/index.js').Asset[],
  months: string[],
): SummaryResponse {
  // Build series: one entry per category (sum assets in category per month)
  const series = categories.map((cat) => {
    const catAssets = assets.filter((a) => a.category_id === cat.id)
    const values = months.map((month) => {
      return catAssets.reduce((sum, asset) => {
        return sum + (locfData.get(asset.id)?.get(month) ?? 0)
      }, 0)
    })
    return { category_id: cat.id, category_name: cat.name, color: cat.color, values }
  })

  // totals: sum across all series per month
  const totals = months.map((_, i) =>
    series.reduce((sum, s) => sum + s.values[i], 0)
  )

  const current_total = totals[totals.length - 1] ?? 0
  const first_total = totals[0] ?? 0
  const period_delta_abs = current_total - first_total
  // Guard divide-by-zero (SUM-05 + ROADMAP Plan 3.3)
  const period_delta_pct = first_total === 0 ? 0 : (period_delta_abs / first_total) * 100

  const category_breakdown = series.map((s) => {
    const value = s.values[s.values.length - 1] ?? 0
    // Guard divide-by-zero
    const pct_of_total = current_total === 0 ? 0 : (value / current_total) * 100
    return {
      category_id: s.category_id,
      category_name: s.category_name,
      color: s.color,
      value,
      pct_of_total,
    }
  })

  return { months, series, totals, current_total, period_delta_abs, period_delta_pct, category_breakdown }
}
```

---

### Pattern 6: Route Handler — Full Wiring

[VERIFIED: server/src/routes/categories.ts structure, server/src/index.ts mount pattern]

```typescript
// server/src/routes/summary.ts — complete route handler skeleton

router.get('/', zValidator('query', querySchema, hook), async (c) => {
  const { range } = c.req.valid('query')
  const db = await readDb()

  // Resolve latestMonth and earliestMonth from data
  const allMonths = db.dataPoints.map((dp) => dp.year_month)
  const latestMonth = allMonths.length > 0
    ? allMonths.reduce((a, b) => (a > b ? a : b))
    : toMonthKey(new Date().getFullYear(), new Date().getMonth() + 1)
  const earliestMonth = allMonths.length > 0
    ? allMonths.reduce((a, b) => (a < b ? a : b))
    : latestMonth

  const { startYM, endYM } = getRangeBounds(range, latestMonth, earliestMonth)
  const months = monthRange(startYM, endYM)
  const locfData = locfFill(months, db.dataPoints, db.assets)
  const response = aggregateSummary(locfData, db.categories, db.assets, months)

  return c.json(response)
})
```

**Mount in index.ts** (add after existing routes):
```typescript
import summaryRouter from './routes/summary.js'
// ...
app.route('/api/v1/summary', summaryRouter)
```

---

### Anti-Patterns to Avoid

- **`new Date()` for month iteration:** `new Date(y, m, 1)` silently produces wrong months at DST boundaries. Always use integer arithmetic. [VERIFIED: ROADMAP.md ⚠️ note, models/index.ts comment]
- **`toISOString().slice(0,7)` for month keys:** UTC shift corrupts month keys for UTC+ users at midnight. Already documented in models/index.ts. [VERIFIED: models/index.ts lines 24–26]
- **Backward LOCF fill:** Before first data point, the carry is `null` → emit `0`. Do NOT use the first known value for prior months — that overstates historical wealth. [VERIFIED: ROADMAP.md Plan 3.1 ⚠️ note]
- **Division before zero-check:** `period_delta_pct = delta / first_total * 100` → `NaN`/`Infinity` when `first_total = 0`. Guard explicitly. [VERIFIED: ROADMAP.md Plan 3.3]
- **Missing `.js` import extension:** All local imports must use `.js` — `import { readDb } from '../storage/index.js'` — required by NodeNext module resolution. [VERIFIED: server/src/routes/categories.ts line 5]
- **Throwing inside `mutateDb` callback:** Phase 3 is read-only (`readDb` only) so this doesn't apply here, but noted for reference.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Query param validation + error shape | Custom `c.req.query()` switch | `zValidator('query', schema, hook)` | Hook gives correct `{"error":"..."}` shape for free; same pattern as Phase 2 |
| Month key zero-padding | Custom string manipulation | `String(y).padStart(4,'0')` + `String(m).padStart(2,'0')` | One-liner; no library needed |
| Upsert semantics | Separate "upsert" storage operation | Filter by `asset_id + year_month`, sort by `updated_at` descending, take first | DataPoints are immutable records; upsert is a query-time concept |

**Key insight:** The entire phase is pure functions + one endpoint. No new libraries, no new storage patterns. The complexity is algorithmic (LOCF correctness, range boundary math), not infrastructural.

---

## Common Pitfalls

### Pitfall 1: LOCF Backward Fill Bug
**What goes wrong:** Using `carry = dataPoints.find(dp for that asset).value` (first known value) for months before the first data point, instead of `0`.
**Why it happens:** "Carry forward" intuitively feels like "carry in both directions." But LOCF is forward-only.
**How to avoid:** Seed carry as `null` (not `undefined`, not `0`). Only set carry when a data point is found. Emit `carry ?? 0`.
**Warning signs:** Unit test: month before first data point should be `0`, not the first data point's value.

### Pitfall 2: Off-by-One in Range Month Count
**What goes wrong:** `6m` returns 5 months or 7 months instead of 6.
**Why it happens:** Confusing "subtract N months" with "N months inclusive."
**How to avoid:** `6m` = 6 months total = `subtractMonths(latestMonth, 5)`. Always verify: `monthRange(start, end).length === expectedCount`.
**Warning signs:** `range=6m` and `months[].length !== 6` in unit test.

### Pitfall 3: Divide-by-Zero in Delta Percentages
**What goes wrong:** `period_delta_pct = NaN` or `Infinity` when database starts with zero data (all totals are 0).
**Why it happens:** `0 / 0 === NaN` in JavaScript.
**How to avoid:** `first_total === 0 ? 0 : (period_delta_abs / first_total) * 100`. Same guard for `pct_of_total`.
**Warning signs:** Frontend receives `{"period_delta_pct": null}` (JSON serialization of NaN) or Infinity.

### Pitfall 4: YTD Start Month
**What goes wrong:** `ytd` starts at the month before Jan (e.g., Dec of prior year) or at the current month instead of Jan.
**How to avoid:** `startYM = toMonthKey(currentYear, 1)` — Jan of the year of `latestMonth` (or current year). `monthRange` is inclusive on both ends, so Jan is always included.

### Pitfall 5: `max` Range with No Data
**What goes wrong:** Crash when `db.dataPoints` is empty — `max` finds no `earliestMonth`.
**How to avoid:** Derive `latestMonth` and `earliestMonth` defensively in the route handler. When `dataPoints.length === 0`, both default to current month. LOCF fills everything as `0`. Response is valid (single month, all zeros).

### Pitfall 6: Assets with No Data Points in LOCF
**What goes wrong:** `locfFill` throws or skips assets with zero data points.
**How to avoid:** LOCF iterates over ALL assets from `db.assets`. For an asset with no data points, `candidates` is always empty, carry stays `null`, all months emit `0`. This is correct and intentional.

### Pitfall 7: Category Without Assets Causing Aggregation Gaps
**What goes wrong:** A category with no assets produces a `series` entry with all-zero `values` — which is correct and must NOT throw.
**How to avoid:** `catAssets.filter(...)` returns `[]` → `reduce` over empty array with seed `0` → all months `0`. Safe.

---

## Code Examples

### Complete `calc/utils.ts`
```typescript
// Source: ROADMAP.md Plan 3.1 + models/index.ts MODEL-03 comment

export function toMonthKey(year: number, month: number): string {
  return String(year).padStart(4, '0') + '-' + String(month).padStart(2, '0')
}

export function monthRange(startYM: string, endYM: string): string[] {
  const [sy, sm] = startYM.split('-').map(Number)
  const [ey, em] = endYM.split('-').map(Number)
  const months: string[] = []
  let y = sy, m = sm
  while (y < ey || (y === ey && m <= em)) {
    months.push(toMonthKey(y, m))
    m++
    if (m > 12) { m = 1; y++ }
  }
  return months
}
```

### Upsert Selection (inline, inside `locfFill`)
```typescript
// Source: REQUIREMENTS.md SUM-02 — latest updated_at wins for same asset+month
const candidates = dataPoints.filter(
  (dp) => dp.asset_id === asset.id && dp.year_month === month,
)
if (candidates.length > 0) {
  // ISO strings are lexicographically comparable (same as year_month sort in DP-01)
  candidates.sort((a, b) => b.updated_at.localeCompare(a.updated_at))
  carry = candidates[0].value
}
```

---

## State of the Art

| Old Approach | Current Approach | Impact |
|--------------|------------------|--------|
| `new Date()` for month iteration | Integer arithmetic (`m > 12 → m=1, y++`) | No DST bugs in any timezone |
| `annualRate / 12` for compound interest | `(1 + r)^(1/12) - 1` (Phase 4) | Not applicable to Phase 3, but same rigor applies |
| Mutable carry variable | `null`-seeded carry with explicit zero emission | Correct LOCF boundary behavior |

---

## Open Questions (RESOLVED)

1. **`ytd` when latestMonth is in a prior year (backfilled data)**
   - What we know: `ytd` uses `currentYear` from `new Date()`, not from `latestMonth.split('-')[0]`
   - What's unclear: if a user backfills data for 2023 and `latestMonth = '2023-12'`, should `ytd` use 2023 or 2024?
   - RESOLVED: **Use `currentYear` from `new Date()`** — `ytd` = "year to date" = current calendar year. If `startYM > endYM`, clamp `startYM = endYM` to return a single month rather than an empty array. Implemented in Plan 03-02 Task 2.

2. **`series` ordering — categories not referenced by any asset**
   - What we know: `aggregateSummary` iterates `db.categories` — categories with no assets produce all-zero series entries
   - What's unclear: should these be included or filtered out?
   - RESOLVED: **Include them** — filtering would cause frontend to receive fewer series entries than expected and could break chart rendering for new categories with no data yet. Implemented in Plan 03-03 Task 1.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Runtime | ✓ | 25.9.0 | — |
| tsx | TS test execution | ✓ | ^4.21.0 | — |
| `node:test` | Unit test runner | ✓ | built-in (Node 22+) | — |
| hono | Route handler | ✓ | ^4.12.14 (installed) | — |
| zod | Query validation | ✓ | ^3.24.4 (installed) | — |

**Missing dependencies with no fallback:** None — Phase 3 requires no new packages.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Node.js built-in `node:test` + `tsx` (TypeScript execution) |
| Config file | None — no config file needed for `node:test` |
| Quick run command | `node --import tsx/esm --test server/src/calc/*.test.ts` |
| Full suite command | `node --import tsx/esm --test server/src/calc/*.test.ts server/src/routes/*.test.ts` |

> **No new devDependency required.** `tsx` is already installed. `node:test` is built-in to Node 22+. Test files live alongside their source files in `server/src/calc/`.

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SUM-01 | Unknown range returns 400 | unit (route) | `node --import tsx/esm --test server/src/routes/summary.test.ts` | ❌ Wave 0 |
| SUM-01 | Default range `1y` when omitted | unit (route) | same | ❌ Wave 0 |
| SUM-02 | Two data points same asset+month → latest updated_at wins | unit (locfFill) | `node --import tsx/esm --test server/src/calc/summary.test.ts` | ❌ Wave 0 |
| SUM-03 | Month before first data point → 0 (not first value) | unit (locfFill) | `node --import tsx/esm --test server/src/calc/summary.test.ts` | ❌ Wave 0 |
| SUM-03 | Asset with no data points → all zeros | unit (locfFill) | same | ❌ Wave 0 |
| SUM-03 | Gap after last data point → carry forward last value | unit (locfFill) | same | ❌ Wave 0 |
| SUM-04 | `series[].values.length === months.length` | unit (aggregateSummary) | same | ❌ Wave 0 |
| SUM-04 | `totals.length === months.length` | unit (aggregateSummary) | same | ❌ Wave 0 |
| SUM-05 | `current_total` equals sum of all last-month category values | unit (aggregateSummary) | same | ❌ Wave 0 |
| SUM-05 | `period_delta_abs` negative when wealth decreased | unit (aggregateSummary) | same | ❌ Wave 0 |
| SUM-05 | `period_delta_pct = 0` when first total is 0 | unit (aggregateSummary) | same | ❌ Wave 0 |
| SUM-05 | `pct_of_total` values sum to ~100% (float tolerance) | unit (aggregateSummary) | same | ❌ Wave 0 |
| utils | `toMonthKey(2024,1) === "2024-01"` | unit | `node --import tsx/esm --test server/src/calc/utils.test.ts` | ❌ Wave 0 |
| utils | `monthRange("2024-11","2025-02")` returns 4 months in order | unit | same | ❌ Wave 0 |
| utils | `range=6m` → exactly 6 months | unit (ranges) | `node --import tsx/esm --test server/src/calc/ranges.test.ts` | ❌ Wave 0 |
| utils | `range=ytd` starts at Jan of current year | unit (ranges) | same | ❌ Wave 0 |

### Suggested Test Cases (pure functions are ideal — no mocking needed)

**`calc/utils.test.ts`:**
```typescript
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { toMonthKey, monthRange } from './utils.js'

test('toMonthKey pads single-digit month', () => {
  assert.equal(toMonthKey(2024, 1), '2024-01')
  assert.equal(toMonthKey(2024, 12), '2024-12')
})

test('monthRange includes start and end months', () => {
  const r = monthRange('2024-11', '2025-02')
  assert.deepEqual(r, ['2024-11', '2024-12', '2025-01', '2025-02'])
})

test('monthRange wraps year correctly', () => {
  const r = monthRange('2024-12', '2025-01')
  assert.deepEqual(r, ['2024-12', '2025-01'])
})
```

**`calc/summary.test.ts` — critical LOCF cases:**
```typescript
test('LOCF: months before first data point → 0', () => {
  const months = ['2024-01', '2024-02', '2024-03']
  const assets = [{ id: 'a1', category_id: 'c1', ... }]
  const dataPoints = [{ asset_id: 'a1', year_month: '2024-03', value: 1000, updated_at: '...', ... }]
  const result = locfFill(months, dataPoints, assets)
  assert.equal(result.get('a1')?.get('2024-01'), 0)   // before first — must be 0
  assert.equal(result.get('a1')?.get('2024-02'), 0)   // before first — must be 0
  assert.equal(result.get('a1')?.get('2024-03'), 1000) // on data point
})

test('LOCF: carry forward after last data point', () => {
  // ... set up one data point in Feb, verify Mar carries 1000
})

test('LOCF upsert: latest updated_at wins for same asset+month', () => {
  // Two data points for same asset+month — one with later updated_at
  // Verify the later one's value is used
})

test('period_delta_pct = 0 when first total is 0', () => {
  // Empty DB → all totals 0 → period_delta_pct must be 0, not NaN
})
```

### Sampling Rate
- **Per task commit:** `node --import tsx/esm --test server/src/calc/*.test.ts`
- **Per wave merge:** `node --import tsx/esm --test server/src/calc/*.test.ts` (all calc unit tests)
- **Phase gate:** Full test suite green + manual smoke test of endpoint before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `server/src/calc/utils.test.ts` — covers `toMonthKey`, `monthRange`
- [ ] `server/src/calc/ranges.test.ts` — covers `getRangeBounds` for all 8 ranges
- [ ] `server/src/calc/summary.test.ts` — covers `locfFill` (LOCF correctness) + `aggregateSummary` (divide-by-zero, sums)

*(Route-level tests are optional for Phase 3 — the pure calc functions carry all the correctness risk.)*

---

## Security Domain

> `security_enforcement` not set to false in config.json — evaluating ASVS applicability.

| ASVS Category | Applies | Control |
|---------------|---------|---------|
| V2 Authentication | No | No auth in v1 (by design — single household, trust the network) |
| V3 Session Management | No | No sessions |
| V4 Access Control | No | Single-user app, no access control needed |
| V5 Input Validation | **Yes** | `zValidator('query', rangeSchema, hook)` — enum validation rejects unknown ranges |
| V6 Cryptography | No | Read-only endpoint, no crypto |

**Threat patterns for this stack:**

| Pattern | STRIDE | Mitigation |
|---------|--------|------------|
| Invalid `range` param causing server error | Tampering | `z.enum([...])` rejects unknown values with 400 before handler runs |
| Extremely large computed arrays (e.g., fabricated `max` range) | DoS | Not applicable — `range` is enum-constrained; `max` is bounded by actual data |
| NaN/Infinity in JSON response | Information Disclosure | Explicit divide-by-zero guards return `0` — no `NaN` leaks to client |

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `ytd` uses `currentYear` from `new Date()` at request time (not from `latestMonth`'s year) | Pattern 4 (ranges) | If backfilled historical data is the norm, `ytd` could return an empty range when latest data is in a prior year — needs a clamp guard |
| A2 | `series` includes all categories (even ones with no assets / all-zero values) | Pattern 5 | Frontend may not expect zero-value series entries; could affect chart rendering |
| A3 | `node --import tsx/esm --test` is the correct invocation for tsx + node:test | Validation Architecture | May need `--loader tsx` or different flag depending on tsx version; validate before Wave 0 |

---

## Sources

### Primary (HIGH confidence)
- `server/src/routes/categories.ts` — zValidator hook pattern, route structure, import conventions [VERIFIED: file]
- `server/src/index.ts` — `app.route(...)` mount pattern [VERIFIED: file]
- `server/src/models/index.ts` — DataPoint/Asset/Category interfaces, MODEL-03 comment [VERIFIED: file]
- `server/src/storage/index.ts` — `readDb()` signature and usage [VERIFIED: file]
- `server/package.json` — exact installed dependency versions [VERIFIED: file]
- `.planning/ROADMAP.md` Plan 3.1–3.3 — algorithmic constraints, file names, verification criteria [VERIFIED: file]
- `.planning/REQUIREMENTS.md` SUM-01–05 — exact requirement text [VERIFIED: file]

### Secondary (MEDIUM confidence)
- Node.js `node:test` built-in module availability — inferred from `node --version` returning 25.9.0 [VERIFIED: bash]
- `tsx` availability for running TypeScript tests — present in `node_modules/.bin/tsx` [VERIFIED: bash]

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all packages already installed, verified against package.json
- Architecture: HIGH — patterns copied from existing Phase 2 route files; calc layer is pure functions
- Pitfalls: HIGH — sourced from ROADMAP.md explicit ⚠️ notes and models comments; algorithmic edge cases reasoned from first principles
- Test framework: MEDIUM — `node:test` + tsx invocation pattern is assumed but not smoke-tested

**Research date:** 2026-04-23
**Valid until:** 2026-05-23 (stable stack, no fast-moving dependencies)
