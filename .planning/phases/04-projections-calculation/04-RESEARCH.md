# Phase 4: Projections Calculation — Research

**Researched:** 2026-04-22
**Domain:** Time-series compound growth math + Hono route + Node:test test suite
**Confidence:** HIGH

---

## Summary

Phase 4 is a pure backend phase: one new file (`server/src/calc/projections.ts`), one new route
(`server/src/routes/projections.ts`), and a mount line in `index.ts`. It builds directly on the
functions already proven in Phase 3 — `locfFill`, `aggregateSummary`, `monthRange`,
`toMonthKey`, and `getRangeBounds('max', ...)` — and adds only three new concerns:

1. **Compound monthly rate formula** — `Math.pow(1 + r, 1/12) - 1` (never `r / 12`)
2. **Growth rate inheritance** — asset-level rate overrides category default; missing category → 0
3. **Projection sequence** — apply monthly compound factor `years * 12` times per asset, starting
   from the month AFTER that asset's latest data point, with its last known value as the seed

The combined response has two sibling keys: `historical` (shape = summary max range) and
`projection` (slimmer: `months`, `series`, `totals` only). The boundary between the two is clean:
`projection.months[0]` is always one month after the last element of `historical.months`.

**Primary recommendation:** Implement `projections.ts` as a pure calculation module (no I/O),
mirror the route structure of `summary.ts`, reuse every existing calc utility, and validate with
`node:test + tsx` exactly like the three Phase 3 test files. No new runtime dependencies needed.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Compound growth formula | API / Backend (calc layer) | — | Pure math, no I/O; same tier as `locfFill` |
| Growth rate resolution | API / Backend (calc layer) | — | Must access Asset + Category models |
| Historical portion | API / Backend (calc layer) | — | Reuses existing `aggregateSummary` — already there |
| Projection sequence | API / Backend (calc layer) | — | Stateless transform over data points |
| Request validation (`years`) | API / Backend (route layer) | — | Zod schema in route handler |
| Combined response assembly | API / Backend (route layer) | — | Route orchestrates calc calls, returns JSON |

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| PROJ-01 | `GET /api/v1/projections?years={n}` — default 10, max 30 | Zod `.int().min(1).max(30).default(10)` on query param; 400 on years > 30 |
| PROJ-02 | Compound monthly rate `(1 + r)^(1/12) - 1` — never `r / 12` | `Math.pow(1 + annualRate, 1/12) - 1`; see Code Examples |
| PROJ-03 | Growth rate resolution: asset overrides category | `resolveGrowthRate` function; null check + category lookup + 0 default |
| PROJ-04 | Projection starts month after asset's latest data point | Per-asset latest DP by year_month string comparison; first projection month = addOneMonth(latestDP.year_month) |
| PROJ-05 | Response includes `historical` (max summary shape) and `projection` | Reuse `aggregateSummary` for historical; new `ProjectionBlock` type for projection |
</phase_requirements>

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `node:test` | built-in (Node 22) | Test runner | Already used in Phase 3 test files [VERIFIED: codebase] |
| `tsx` | ^4.21.0 | TS test execution | `npx tsx --test` runs .test.ts without compile step [VERIFIED: package.json] |
| `zod` | ^3.24.4 | Query param validation | Same pattern as summary route [VERIFIED: codebase] |
| `@hono/zod-validator` | ^0.7.0 | Hono ↔ Zod bridge | Same `zValidator('query', schema, hook)` pattern [VERIFIED: codebase] |

### No New Dependencies
This phase requires **zero new npm packages**. All utilities already exist:
- `toMonthKey`, `monthRange` — `src/calc/utils.ts`
- `getRangeBounds` — `src/calc/ranges.ts`
- `locfFill`, `aggregateSummary` — `src/calc/summary.ts`
- `Asset`, `Category`, `DataPoint` — `src/models/index.ts`

**Installation:** none required.

---

## Architecture Patterns

### System Architecture Diagram

```
GET /api/v1/projections?years=N
         │
         ▼
  [routes/projections.ts]
  zValidator('query', yearsSchema)
         │  years > 30 → 400
         │
         ▼
  readDb() ──────────────────────────────────────┐
         │                                       │
         ▼                                       ▼
  derive latestMonth / earliestMonth       [calc/projections.ts]
  (same pattern as summary route)          buildProjection(assets, categories,
         │                                   dataPoints, years)
         ▼                                       │
  getRangeBounds('max', latestMonth,             ▼
    earliestMonth)                         per asset: find latest DP
         │                                 seed = DP.value (or 0)
         ▼                                 projection months = monthRange(
  monthRange(startYM, latestMonth)           addOneMonth(latestMonth),
         │                                   addOneMonth(latestMonth) + years*12 - 1
         ▼                                 )
  locfFill(months, dataPoints, assets)           │
         │                                       ▼
         ▼                                 per month: value *= (1 + monthlyRate)
  aggregateSummary(...)                          │
         │                                       ▼
         └──────────────────┐           aggregate per category → series[] + totals[]
                            ▼
                 { historical: SummaryResponse,
                   projection: ProjectionBlock }
                            │
                            ▼
                     c.json(response)
```

### Recommended Project Structure (additions only)

```
server/src/
├── calc/
│   ├── projections.ts       # NEW: compoundMonthlyRate, resolveGrowthRate, buildProjection
│   └── projections.test.ts  # NEW: test file (node:test pattern)
├── routes/
│   └── projections.ts       # NEW: GET /api/v1/projections route handler
└── index.ts                 # EDIT: add app.route('/api/v1/projections', projectionsRouter)
```

### Pattern 1: Compound Monthly Rate

**What:** Convert an annual growth rate to per-month compound factor.
**When to use:** Once per asset per `buildProjection` call.

```typescript
// Source: PROJECT.md "Projection math" section [VERIFIED: codebase]
export function compoundMonthlyRate(annualRate: number): number {
  return Math.pow(1 + annualRate, 1 / 12) - 1
}

// Sanity check: 8% annual → ~0.6434% per month (NOT 0.6667%)
// compoundMonthlyRate(0.08) ≈ 0.006434
// annualRate / 12 = 0.006667 — WRONG, understates compounding
```

### Pattern 2: Growth Rate Resolution

**What:** Determine effective annual growth rate for an asset, with inheritance.
**When to use:** Once per asset before entering the projection loop.

```typescript
// Source: ROADMAP.md Plan 4.1 + models/index.ts Asset definition [VERIFIED: codebase]
export function resolveGrowthRate(asset: Asset, categories: Category[]): number {
  if (asset.projected_yearly_growth !== null) {
    return asset.projected_yearly_growth    // asset-level override wins
  }
  const cat = categories.find(c => c.id === asset.category_id)
  return cat?.projected_yearly_growth ?? 0  // missing category → 0
}
```

**Edge cases (all must be tested):**
- `asset.projected_yearly_growth = 0.10` → returns `0.10` (not category value)
- `asset.projected_yearly_growth = null` → returns category value
- `asset.projected_yearly_growth = null` AND category not found → returns `0`
- `asset.projected_yearly_growth = 0` (explicit zero) → returns `0` (not category value — zero is a valid override)

> ⚠️ **Null vs 0 distinction is critical.** `null` means "inherit"; `0` means "no growth, explicitly set." The check must be `!== null`, NOT a falsy check (`if (!asset.projected_yearly_growth)` would treat 0 as "inherit").

### Pattern 3: addOneMonth Helper (private)

**What:** Advance a YYYY-MM string by one month, handling December → January rollover.
**When to use:** Compute projection start month and end month.

```typescript
// Source: ranges.ts subtractMonths pattern — same integer carry logic [VERIFIED: codebase]
function addOneMonth(ym: string): string {
  let [y, m] = ym.split('-').map(Number)
  m++
  if (m > 12) { m = 1; y++ }
  return toMonthKey(y, m)
}
// addOneMonth('2024-12') → '2025-01' (December rollover)
// addOneMonth('2024-06') → '2024-07'
```

### Pattern 4: buildProjection — Unified Month Array

**What:** Build per-asset projection values aligned to a single shared months[] array.
**When to use:** Core of Plan 4.2.

```typescript
// Source: ROADMAP.md Plan 4.2 description [VERIFIED: codebase]
export interface ProjectionSeries {
  category_id: string
  category_name: string
  color: string
  values: number[]   // length === months.length
}

export interface ProjectionBlock {
  months: string[]
  series: ProjectionSeries[]
  totals: number[]
}

export function buildProjection(
  assets: Asset[],
  categories: Category[],
  dataPoints: DataPoint[],
  years: number
): ProjectionBlock {
  // 1. Determine projection anchor
  const latestMonth = dataPoints.length === 0
    ? currentMonthKey()                    // fallback when no data at all
    : dataPoints.reduce((best, dp) =>
        dp.year_month > best ? dp.year_month : best,
        dataPoints[0].year_month)

  const projStart = addOneMonth(latestMonth)
  const projEnd   = addNMonths(projStart, years * 12 - 1)  // years*12 months total
  const months    = monthRange(projStart, projEnd)

  // 2. Per-asset starting value (latest DP for that asset)
  const series = categories.map(cat => {
    const catAssets = assets.filter(a => a.category_id === cat.id)
    const values = months.map(() => 0)  // pre-fill; filled per-asset below

    for (const asset of catAssets) {
      const assetDPs = dataPoints.filter(dp => dp.asset_id === asset.id)
      let seed = 0
      if (assetDPs.length > 0) {
        // Latest DP by year_month, then latest updated_at for same month
        const latestYM = assetDPs.reduce((b, dp) =>
          dp.year_month > b ? dp.year_month : b, assetDPs[0].year_month)
        const bestDP = assetDPs
          .filter(dp => dp.year_month === latestYM)
          .reduce((a, b) => (a.updated_at > b.updated_at ? a : b))
        seed = bestDP.value
      }

      const annualRate = resolveGrowthRate(asset, categories)
      const monthlyRate = compoundMonthlyRate(annualRate)
      let v = seed
      for (let i = 0; i < months.length; i++) {
        v = v * (1 + monthlyRate)
        values[i] += v   // accumulate per category
      }
    }

    return { category_id: cat.id, category_name: cat.name, color: cat.color, values }
  })

  const totals = months.map((_, i) => series.reduce((sum, s) => sum + s.values[i], 0))
  return { months, series, totals }
}
```

> **Note on `addNMonths`:** This is `addOneMonth` applied N times, or an inline version of
> `subtractMonths` with negation. Since `monthRange` already handles end-month computation
> via its own loop, a simpler approach is to just call `monthRange(projStart, ...)` with a
> manually computed end month. Or simply generate `years * 12` months starting from `projStart`
> by using monthRange with a computed endYM.

> **Implementation hint:** Rather than `addNMonths`, compute end by calling `addOneMonth`
> in a loop or by doing inline arithmetic: given `projStart = 'YYYY-MM'`,
> `projEnd = toMonthKey(y + Math.floor((m + years*12 - 1 - 1) / 12), ...)` — but the
> cleaner pattern from the codebase is to use `monthRange(start, end)` and compute end
> with simple integer arithmetic matching `subtractMonths` in reverse.

### Pattern 5: Route Handler (projections.ts route)

**What:** GET endpoint following the same structure as `summary.ts`.
**When to use:** Plan 4.3.

```typescript
// Source: routes/summary.ts pattern [VERIFIED: codebase]
import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { readDb } from '../storage/index.js'
import { toMonthKey, monthRange } from '../calc/utils.js'
import { getRangeBounds } from '../calc/ranges.js'
import { locfFill, aggregateSummary } from '../calc/summary.js'
import { buildProjection } from '../calc/projections.js'

const router = new Hono()

const querySchema = z.object({
  years: z.coerce.number().int().min(1).max(30).default(10)
})
const hook = (result: { success: boolean; error?: z.ZodError }, c: any) => {
  if (!result.success && result.error) {
    return c.json({ error: result.error.issues[0]?.message ?? 'Invalid years' }, 400 as const)
  }
}

router.get('/', zValidator('query', querySchema, hook), async (c) => {
  const { years } = c.req.valid('query')
  const db = await readDb()

  const now = new Date()
  const currentMonth = toMonthKey(now.getFullYear(), now.getMonth() + 1)

  const latestMonth = db.dataPoints.length === 0
    ? currentMonth
    : db.dataPoints.reduce((best, dp) =>
        dp.year_month > best ? dp.year_month : best, db.dataPoints[0].year_month)

  const earliestMonth = db.dataPoints.length === 0
    ? currentMonth
    : db.dataPoints.reduce((best, dp) =>
        dp.year_month < best ? dp.year_month : best, db.dataPoints[0].year_month)

  // Historical: max range (all data)
  const { startYM, endYM } = getRangeBounds('max', latestMonth, earliestMonth)
  const histMonths = monthRange(startYM, endYM)
  const locfData = locfFill(histMonths, db.dataPoints, db.assets)
  const historical = aggregateSummary(db.assets, db.categories, locfData, histMonths)

  // Projection: years * 12 months starting the month after latestMonth
  const projection = buildProjection(db.assets, db.categories, db.dataPoints, years)

  return c.json({ historical, projection })
})

export default router
```

### Pattern 6: Zod coerce for query param

**What:** Query strings are always strings. `z.coerce.number()` converts `"10"` → `10`.
**When to use:** The `years` query param.

```typescript
// Source: Zod v3 coerce pattern [VERIFIED: existing zod dep in package.json]
z.coerce.number().int().min(1).max(30).default(10)
// "10"  → 10  ✓
// "31"  → 31  → .max(30) fails → 400
// ""    → NaN → .int() fails → 400
// absent → default 10 ✓
```

### Pattern 7: Mount in index.ts

```typescript
// Source: server/src/index.ts — existing route mount pattern [VERIFIED: codebase]
import projectionsRouter from './routes/projections.js'
// ...
app.route('/api/v1/projections', projectionsRouter)
// Mount BEFORE serveStatic and SPA catch-all
```

### Anti-Patterns to Avoid

- **`annualRate / 12`:** Simple division. Understates growth by ~2% over 10 years at 7%. Always use `Math.pow(1 + r, 1/12) - 1`. [VERIFIED: STATE.md + PROJECT.md]
- **`if (!asset.projected_yearly_growth)`:** Falsy check treats explicit `0` as "inherit". Use `!== null`. [VERIFIED: models/index.ts — type is `number | null`]
- **`new Date().toISOString().slice(0,7)`:** UTC shift corrupts month keys for UTC+ users. Always use `toMonthKey(y, m+1)` with integer parts. [VERIFIED: STATE.md key decisions]
- **Overlapping months:** `projection.months[0]` MUST be one month after `historical.months.at(-1)`. If the route calls `buildProjection` which derives its own `latestMonth` from `dataPoints`, the boundary is guaranteed consistent — both functions read from the same `dataPoints` array.
- **Series set mismatch:** `historical.series` and `projection.series` must have the same `category_id` set. `aggregateSummary` iterates `categories[]`; `buildProjection` must do the same.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Month iteration | Custom date loop | `monthRange(start, end)` from utils.ts | Already DST-safe, tested, handles year boundary |
| Month key formatting | String concatenation | `toMonthKey(y, m)` from utils.ts | `padStart` handled, no DST risk |
| Month arithmetic (add/subtract) | `new Date()` manipulation | Integer carry loop (same pattern as `subtractMonths` in ranges.ts) | Avoids all DST and UTC offset edge cases |
| Historical series | Re-implementing LOCF | `locfFill` + `aggregateSummary` | Already tested and correct |
| Validation | Manual `if` checks on query params | Zod + `zValidator` hook | Same pattern as summary route, API-01 compliant |

**Key insight:** This phase adds ~100 lines of new pure logic. The rest is wiring. Resist the temptation to reimpliment anything from Phase 3.

---

## Common Pitfalls

### Pitfall 1: Simple Division Monthly Rate
**What goes wrong:** `annualRate / 12` produces 0.006667 for 8% annual instead of 0.006434.
**Why it happens:** Linear approximation ignores compounding effect within the year.
**How to avoid:** Only use `Math.pow(1 + annualRate, 1/12) - 1`. The test `compoundMonthlyRate(0.08) ≈ 0.006434` catches this immediately.
**Warning signs:** After 12 projection months at 8%, the total should equal `startValue * 1.08` exactly. If it's `startValue * 1.08` within 0.01%, formula is correct.

### Pitfall 2: Null vs Falsy for Growth Rate Override
**What goes wrong:** `if (!asset.projected_yearly_growth)` treats `0` (explicit no-growth) as "inherit from category." An asset in a Cash category with 0% growth override would silently inherit the category's 2% rate.
**Why it happens:** JavaScript's falsy coercion — `0` is falsy.
**How to avoid:** Always `asset.projected_yearly_growth !== null`. Verified by the model type `number | null`.
**Warning signs:** Test case: asset with `projected_yearly_growth: 0`, category with `projected_yearly_growth: 0.05` → effective rate must be `0`, not `0.05`.

### Pitfall 3: Month Boundary Overlap
**What goes wrong:** `projection.months[0]` equals `historical.months.at(-1)` — the same month appears in both halves. Frontend renders it twice, spiking the chart.
**Why it happens:** Off-by-one: using `latestMonth` as both the end of historical and start of projection.
**How to avoid:** Projection months array must start at `addOneMonth(latestMonth)`, not `latestMonth`.
**Warning signs:** ROADMAP verification check: "`projection.months[0]` is one month after `historical.months` last element."

### Pitfall 4: `currentMonth` Anchor for No-Data Assets
**What goes wrong:** Using `new Date()` for projection start when DB has data, causing a gap if `latestMonth` is in the past.
**Why it happens:** Confusing "current wall-clock month" with "latest data month."
**How to avoid:** `buildProjection` derives `latestMonth` from `dataPoints` array (same as route does for historical). The projection months array starts from `addOneMonth(that latestMonth)`. Assets with no data points get seed=0 but their first projected month is still aligned with the global projection start.
**Warning signs:** Test: if latestMonth=2024-06 but actual month is 2024-09, projection must start at 2024-07, not 2024-10.

### Pitfall 5: Missing Category in Growth Rate Resolution
**What goes wrong:** `categories.find(c => c.id === asset.category_id)` returns `undefined` if a category was deleted after assets were created. Without a guard, `cat.projected_yearly_growth` throws a TypeError.
**Why it happens:** Referential integrity is only enforced on DELETE (Category DELETE rejects with 409 if assets exist). Data loaded from YAML could theoretically be inconsistent.
**How to avoid:** Use optional chaining: `cat?.projected_yearly_growth ?? 0`. Default to 0, not an error.
**Warning signs:** Test case with `asset.category_id = 'nonexistent'` must return 0, not throw.

### Pitfall 6: `z.coerce` Required for Numeric Query Params
**What goes wrong:** `z.number()` without `.coerce` always fails because query strings are always `string` type.
**Why it happens:** HTTP query params are strings. `years=10` arrives as `"10"`, not `10`.
**How to avoid:** `z.coerce.number().int().min(1).max(30).default(10)` — coerce first, then validate.
**Warning signs:** `years=10` returns 400 "Expected number, received string" — missing `.coerce`.

### Pitfall 7: `years * 12` Month Count
**What goes wrong:** Generating `years * 12 + 1` months (off by one).
**Why it happens:** Using `monthRange(start, addNMonths(start, years*12))` includes both endpoints — that's `years*12 + 1` months.
**How to avoid:** End month = `addNMonths(start, years*12 - 1)`. Then `monthRange(start, end)` generates exactly `years*12` months.
**Warning signs:** `years=30` must produce exactly 360 months, not 361.

---

## Code Examples

### compoundMonthlyRate — verified arithmetic
```typescript
// Source: PROJECT.md, STATE.md key decisions [VERIFIED: codebase]
// compoundMonthlyRate(0.08) = Math.pow(1.08, 1/12) - 1 ≈ 0.0064340
// After 12 months: seed * (1 + 0.0064340)^12 = seed * 1.08 exactly
export function compoundMonthlyRate(annualRate: number): number {
  return Math.pow(1 + annualRate, 1 / 12) - 1
}
```

### addOneMonth (private helper)
```typescript
// Source: ranges.ts subtractMonths pattern — reversed [VERIFIED: codebase]
function addOneMonth(ym: string): string {
  let [y, m] = ym.split('-').map(Number)
  m++
  if (m > 12) { m = 1; y++ }
  return toMonthKey(y, m)
}
// addOneMonth('2024-12') → '2025-01'
// addOneMonth('2024-06') → '2024-07'
```

### Node:test projection test file structure
```typescript
// Source: server/src/calc/summary.test.ts pattern [VERIFIED: codebase]
import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { compoundMonthlyRate, resolveGrowthRate, buildProjection } from './projections.js'
import type { Asset, Category, DataPoint } from '../models/index.js'

describe('compoundMonthlyRate', () => {
  test('8% annual → ~0.006434 per month', () => {
    const rate = compoundMonthlyRate(0.08)
    assert.ok(Math.abs(rate - 0.006434) < 0.000001)
  })
  test('after 12 months at 8%, value equals startValue * 1.08', () => {
    const monthly = compoundMonthlyRate(0.08)
    const result = 1000 * Math.pow(1 + monthly, 12)
    assert.ok(Math.abs(result - 1080) < 0.01)
  })
  test('0% annual → 0 monthly rate', () => {
    assert.equal(compoundMonthlyRate(0), 0)
  })
})
```

### Run tests (from server/ directory)
```bash
# Single test file (quick):
npx tsx --test src/calc/projections.test.ts

# All calc tests:
npx tsx --test src/calc/*.test.ts
```

---

## How the Historical Portion is Built

The historical block in the projections response is **identical** to what `GET /api/v1/summary?range=max` returns:

1. `getRangeBounds('max', latestMonth, earliestMonth)` → `{ startYM: earliestMonth, endYM: latestMonth }`
2. `monthRange(startYM, endYM)` → all months from first ever data point to latest
3. `locfFill(months, db.dataPoints, db.assets)` → LOCF-filled per-asset map
4. `aggregateSummary(db.assets, db.categories, locfData, months)` → full `SummaryResponse`

The `historical` key in the response IS a `SummaryResponse` (includes summary card fields: `current_total`, `period_delta_abs`, `period_delta_pct`, `category_breakdown`). This is consistent with PROJ-05: "same shape as summary max range."

**When DB has no data points:** `latestMonth = earliestMonth = currentMonth`. The historical block is a single month with all zeros. The projection starts at `currentMonth + 1`.

---

## How Series Are Structured in the Combined Response

Both `historical.series[]` and `projection.series[]` iterate the `categories[]` array in the same order. Each element has the same `{ category_id, category_name, color, values[] }` shape. The category set is identical in both halves.

Frontend joins them on `category_id` to draw a single continuous line per category (historical solid, projected dashed). If a category has zero values throughout both portions, it still appears in both `series[]` arrays (matching `aggregateSummary`'s "all categories included" rule from SUM-04).

**Response type shape:**
```typescript
interface ProjectionsResponse {
  historical: SummaryResponse          // full summary shape including cards
  projection: {
    months: string[]
    series: { category_id: string; category_name: string; color: string; values: number[] }[]
    totals: number[]
  }
}
```

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | `node:test` (Node.js built-in, Node 22) |
| Execution | `npx tsx --test <file>` from `server/` directory |
| Config file | none — no config needed |
| Quick run command | `npx tsx --test src/calc/projections.test.ts` |
| Full suite command | `npx tsx --test src/calc/*.test.ts` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| PROJ-02 | `compoundMonthlyRate(0.08) ≈ 0.006434` | unit | `npx tsx --test src/calc/projections.test.ts` | ❌ Wave 0 |
| PROJ-02 | `compoundMonthlyRate(0.08)` ≠ `0.08/12` | unit | `npx tsx --test src/calc/projections.test.ts` | ❌ Wave 0 |
| PROJ-03 | Null growth rate inherits from category | unit | `npx tsx --test src/calc/projections.test.ts` | ❌ Wave 0 |
| PROJ-03 | Explicit 0 does NOT inherit from category | unit | `npx tsx --test src/calc/projections.test.ts` | ❌ Wave 0 |
| PROJ-03 | Missing category → 0 (no throw) | unit | `npx tsx --test src/calc/projections.test.ts` | ❌ Wave 0 |
| PROJ-04 | Projection first month = latestDP + 1 month | unit | `npx tsx --test src/calc/projections.test.ts` | ❌ Wave 0 |
| PROJ-04 | No data points → seed=0, start=currentMonth+1 | unit | `npx tsx --test src/calc/projections.test.ts` | ❌ Wave 0 |
| PROJ-01 | `years=30` → 360 projection months | unit | `npx tsx --test src/calc/projections.test.ts` | ❌ Wave 0 |
| PROJ-01 | `years=31` → 400 from endpoint | integration | manual / Hono test client | ❌ Wave 0 |
| PROJ-05 | `projection.months[0]` = `historical.months.at(-1)` + 1m | unit | `npx tsx --test src/calc/projections.test.ts` | ❌ Wave 0 |
| PROJ-05 | Both `historical` and `projection` keys present | integration | manual / Hono test client | ❌ Wave 0 |

### Sampling Rate

- **Per task commit:** `npx tsx --test src/calc/projections.test.ts`
- **Per wave merge:** `npx tsx --test src/calc/*.test.ts`
- **Phase gate:** Full calc suite green before `/gsd-verify-work`

### Wave 0 Gaps

- [ ] `server/src/calc/projections.test.ts` — covers PROJ-01 through PROJ-05 (pure unit tests)
- [ ] Framework already installed — no install step needed (`node:test` built-in, `tsx` in devDependencies)

---

## Security Domain

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | Single-household, no auth by design |
| V3 Session Management | no | No sessions |
| V4 Access Control | no | No users |
| V5 Input Validation | yes | Zod `.int().min(1).max(30).default(10)` on `years` param |
| V6 Cryptography | no | No crypto in this phase |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Oversized `years` param (e.g. `years=999`) — could cause large array allocation | DoS | Zod `.max(30)` rejects at validation layer, returns 400 |
| Non-integer `years` (e.g. `years=1.5`) | Tampering | Zod `.int()` rejects with 400 |
| Missing `years` param | — | Zod `.default(10)` handles gracefully |

---

## Open Questions (RESOLVED)

1. **`buildProjection` signature: receives `latestMonth` from caller or derives it internally?**
   - What we know: Plan 4.2 signature is `buildProjection(assets, categories, dataPoints, years)` — no `latestMonth` param
   - What's clear: Function must derive `latestMonth` from `dataPoints` internally, same logic as the route
   - RESOLVED: Derive internally. This keeps the function pure (no ambient state) and the no-data-point fallback to `new Date()` stays encapsulated. The boundary with `historical` is guaranteed consistent because both the historical assembly and `buildProjection` read from the same `dataPoints` array.

2. **`historical` response type: full `SummaryResponse` or trimmed?**
   - What we know: PROJ-05 says "same shape as summary max range" — `SummaryResponse` includes summary card fields
   - What's clear: Include all fields. It costs nothing extra (they're computed in `aggregateSummary` anyway) and gives the frontend the same rich data it gets from `/summary`.
   - RESOLVED: Type `historical` as `SummaryResponse` in the projections response.

3. **Empty database edge case for projection**
   - What we know: When `dataPoints = []`, `latestMonth = currentMonth` (from `new Date()`). `buildProjection` produces a projection starting next month, with all-zero series.
   - What's unclear: Whether this is a useful response or should be a special case
   - RESOLVED: Return it as-is (consistent behavior, no special-casing). The frontend renders an all-zero projection, which is correct for a user with no data.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `historical` in projections response includes all `SummaryResponse` fields (cards) | How the historical portion is built | Low risk — "same shape as summary max range" is explicit in PROJ-05; if trimmed, planner adjusts type only |
| A2 | `buildProjection` global projection start = `addOneMonth(latestMonth across ALL dataPoints)` — not per-asset | Pattern 4 | If per-asset start months were needed, the months[] array design changes significantly; ROADMAP Plan 4.3 language implies a single shared months[] array |

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Test runner, server | ✓ | 22.x (inferred from `@types/node ^22`) | — |
| tsx | Test execution | ✓ | ^4.21.0 (in devDependencies) | — |
| node:test | Test runner | ✓ | built-in | — |

No missing dependencies. No new packages needed.

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `annualRate / 12` (simple division) | `Math.pow(1 + r, 1/12) - 1` (compound) | Project inception | ~2% accuracy difference over 10 years at 7% |
| Jest / Vitest for Node.js testing | `node:test` (built-in since Node 18) | Node 18+ | Zero install, no config, same describe/test API |

---

## Sources

### Primary (HIGH confidence)
- `server/src/calc/summary.ts` — locfFill, aggregateSummary, SummaryResponse type [VERIFIED: codebase read]
- `server/src/calc/utils.ts` — toMonthKey, monthRange [VERIFIED: codebase read]
- `server/src/calc/ranges.ts` — getRangeBounds, subtractMonths pattern [VERIFIED: codebase read]
- `server/src/routes/summary.ts` — route pattern to follow [VERIFIED: codebase read]
- `server/src/index.ts` — route mount pattern [VERIFIED: codebase read]
- `server/src/models/index.ts` — Asset.projected_yearly_growth type is `number | null` [VERIFIED: codebase read]
- `.planning/PROJECT.md` — projection math formula decision [VERIFIED: document read]
- `.planning/STATE.md` — key technical decisions including null vs 0, compound formula [VERIFIED: document read]
- `.planning/ROADMAP.md` Plan 4.1–4.3 — full plan descriptions [VERIFIED: document read]
- `.planning/REQUIREMENTS.md` PROJ-01–05 — formal requirements [VERIFIED: document read]
- `server/src/calc/summary.test.ts` — test structure and patterns [VERIFIED: codebase read]
- `server/package.json` — dependency versions [VERIFIED: codebase read]

### Tertiary (LOW confidence — not needed, all verified from codebase)
None required. All findings sourced directly from the existing codebase.

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all deps already installed, verified from package.json and test files
- Architecture: HIGH — direct continuation of Phase 3 patterns, no new design decisions
- Math correctness: HIGH — formula verified in PROJECT.md, STATE.md, ROADMAP.md × 3 sources
- Pitfalls: HIGH — sourced from existing codebase decisions and test patterns

**Research date:** 2026-04-22
**Valid until:** 2026-05-22 (stable codebase, no moving targets)
