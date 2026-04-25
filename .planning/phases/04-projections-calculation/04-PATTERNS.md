# Phase 4: Projections Calculation — Pattern Map

**Mapped:** 2026-04-22
**Files analyzed:** 4 new/modified files
**Analogs found:** 4 / 4

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `server/src/calc/projections.ts` | utility (pure calc) | transform | `server/src/calc/summary.ts` | exact |
| `server/src/calc/projections.test.ts` | test | batch | `server/src/calc/summary.test.ts` | exact |
| `server/src/routes/projections.ts` | route/controller | request-response | `server/src/routes/summary.ts` | exact |
| `server/src/index.ts` (edit) | config/entry | request-response | `server/src/index.ts` lines 8–37 | exact (self) |

---

## Pattern Assignments

---

### `server/src/calc/projections.ts` (utility, transform)

**Analog:** `server/src/calc/summary.ts`

**Imports pattern** (`summary.ts` lines 1–2):
```typescript
// server/src/calc/summary.ts lines 1-2
import type { DataPoint, Asset, Category } from '../models/index.js'
```
> `projections.ts` needs all three types. Use the same `.js` extension on local imports — TypeScript ESM requires it.

**Inline private helper pattern** (`ranges.ts` lines 13–18 — `subtractMonths` reversed):
```typescript
// server/src/calc/ranges.ts lines 13-18 (subtractMonths — reverse this for addOneMonth)
function subtractMonths(ym: string, n: number): string {
  let [y, m] = ym.split('-').map(Number)
  m -= n
  while (m <= 0) { m += 12; y-- }
  return toMonthKey(y, m)
}

// ── addOneMonth (private) — same integer carry, reversed direction:
function addOneMonth(ym: string): string {
  let [y, m] = ym.split('-').map(Number)
  m++
  if (m > 12) { m = 1; y++ }
  return toMonthKey(y, m)
}
```
> `addOneMonth` is NOT exported — it is private to `projections.ts`. Mirror the `subtractMonths` pattern: parse with `.split('-').map(Number)`, integer carry, then `toMonthKey`.

**Interface definition pattern** (`summary.ts` lines 49–57 — `SummaryResponse`):
```typescript
// server/src/calc/summary.ts lines 49-57
export interface SummaryResponse {
  months: string[]
  series: { category_id: string; category_name: string; color: string; values: number[] }[]
  totals: number[]
  current_total: number
  period_delta_abs: number
  period_delta_pct: number
  category_breakdown: { category_id: string; category_name: string; color: string; value: number; pct_of_total: number }[]
}

// ── ProjectionSeries and ProjectionBlock follow the same interface style:
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
```
> `ProjectionBlock` is slimmer than `SummaryResponse` — no `current_total`, `period_delta_abs`, etc. Only `months`, `series`, `totals`.

**Core pattern — per-category map with reduce** (`summary.ts` lines 75–89):
```typescript
// server/src/calc/summary.ts lines 75-89
const series = categories.map(cat => {
  const catAssets = assets.filter(a => a.category_id === cat.id)
  const values = months.map(month => {
    return catAssets.reduce((sum, asset) => {
      const assetMap = locfData.get(asset.id)
      return sum + (assetMap?.get(month) ?? 0)
    }, 0)
  })
  return { category_id: cat.id, category_name: cat.name, color: cat.color, values }
})

const totals = months.map((_, i) =>
  series.reduce((sum, s) => sum + s.values[i], 0)
)
```
> `buildProjection` uses the same `categories.map(cat => ...)` outer structure and the same `totals` derivation. The inner body differs: instead of LOCF lookup it runs the compound growth loop per asset.

**`latestMonth` derivation pattern** (`summary.ts` lines 31–36):
```typescript
// server/src/routes/summary.ts lines 31-36
const latestMonth = db.dataPoints.length === 0
  ? currentMonth
  : db.dataPoints.reduce((best, dp) =>
      dp.year_month > best ? dp.year_month : best,
      db.dataPoints[0].year_month
    )
```
> `buildProjection` must derive `latestMonth` from the `dataPoints` parameter using the **identical** reduce pattern (not from the route's `currentMonth`). When `dataPoints` is empty, fall back to a `toMonthKey`-based current month.

**Null-vs-falsy guard** (`models/index.ts` line 14 — type declaration):
```typescript
// server/src/models/index.ts line 14
projected_yearly_growth: number | null   // null = inherit from parent Category; NOT optional (?)
```
> The `resolveGrowthRate` check MUST be `asset.projected_yearly_growth !== null`, not `if (!asset.projected_yearly_growth)`. Explicit `0` is a valid override — falsy check would silently inherit category rate.

**LOCF upsert pattern** (`summary.ts` lines 35–36 — used for per-asset seed):
```typescript
// server/src/calc/summary.ts lines 35-36
const best = monthDPs.reduce((a, b) => (a.updated_at > b.updated_at ? a : b))
carry = best.value
```
> When finding each asset's latest data point to use as the projection seed, apply the same two-level selection: first find the lexicographically greatest `year_month`, then among ties use the greatest `updated_at`.

---

### `server/src/calc/projections.test.ts` (test, batch)

**Analog:** `server/src/calc/summary.test.ts` (primary) and `server/src/calc/utils.test.ts` (secondary)

**Import block** (`utils.test.ts` lines 1–3):
```typescript
// server/src/calc/utils.test.ts lines 1-3
import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { toMonthKey, monthRange } from './utils.js'
```
> Use exactly this import structure. `node:test` and `node:assert/strict` are built-in (Node 22). Import target functions from `./projections.js` (`.js` extension required for ESM).

**Fixture helper pattern** (`summary.test.ts` lines 8–32):
```typescript
// server/src/calc/summary.test.ts lines 8-32
function makeAsset(id: string, categoryId = 'cat1'): Asset {
  return {
    id,
    name: id,
    category_id: categoryId,
    projected_yearly_growth: null,
    created_at: '2024-01-01T00:00:00.000Z',
  }
}

function makeDP(
  assetId: string,
  yearMonth: string,
  value: number,
  updatedAt: string
): DataPoint {
  return {
    id: `dp-${assetId}-${yearMonth}`,
    asset_id: assetId,
    year_month: yearMonth,
    value,
    created_at: '2024-01-01T00:00:00.000Z',
    updated_at: updatedAt,
  }
}
```
> Replicate this fixture helper pattern verbatim. `projections.test.ts` will need the same `makeAsset`, `makeDP`, and `makeCategory` helpers. Note `makeAsset` uses `projected_yearly_growth: null` as default — tests that exercise asset-level override must explicitly pass a number.

**`describe`/`test` structure** (`summary.test.ts` lines 36–90):
```typescript
// server/src/calc/summary.test.ts lines 36-46
describe('locfFill', () => {
  test('months before first data point are 0 — no backward carry', () => {
    const asset = makeAsset('a1')
    const dp = makeDP('a1', '2024-03', 1000, '2024-03-01T00:00:00.000Z')
    const months = ['2024-01', '2024-02', '2024-03', '2024-04']
    const result = locfFill(months, [dp], [asset])
    const a1 = result.get('a1')!
    assert.equal(a1.get('2024-01'), 0, 'before first dp: must be 0')
  })
```
> One `describe` block per exported function. Test names are full sentences describing the expected behaviour, not just the input. Use `assert.equal` for scalars, `assert.ok(Math.abs(...) < tolerance)` for floats, and inline comments for the "why."

**Float tolerance pattern** (`utils.test.ts` — adapted for projections):
```typescript
// Pattern from utils.test.ts adapted — use assert.ok with Math.abs for floating-point
assert.ok(Math.abs(rate - 0.006434) < 0.000001, '8% annual → ~0.006434 monthly')
// For 12-month compound check:
assert.ok(Math.abs(result - 1080) < 0.01, 'after 12 months at 8%, value = seed * 1.08')
```
> Never use `assert.equal` on floats from `Math.pow`. Always use `assert.ok(Math.abs(actual - expected) < tolerance)`.

**Required test coverage** (from RESEARCH.md PROJ-02/PROJ-03/PROJ-04):

| `describe` block | Key `test` cases |
|---|---|
| `compoundMonthlyRate` | `0%→0`, `8%→≈0.006434`, `12-month compound = seed*1.08` |
| `resolveGrowthRate` | asset override wins, null inherits category, null + no category → 0, explicit `0` is NOT null |
| `buildProjection` | zero assets → empty series, correct month count (`years*12`), projection starts month after latestDP, no overlap with historical, seed taken from latest DP (upsert), 0 seed for asset with no DPs, 12-month compound accuracy |

---

### `server/src/routes/projections.ts` (route/controller, request-response)

**Analog:** `server/src/routes/summary.ts` (exact match)

**Full import block** (`summary.ts` lines 1–8):
```typescript
// server/src/routes/summary.ts lines 1-8
import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { readDb } from '../storage/index.js'
import { toMonthKey, monthRange } from '../calc/utils.js'
import { getRangeBounds } from '../calc/ranges.js'
import { locfFill, aggregateSummary } from '../calc/summary.js'
```
> Add `import { buildProjection } from '../calc/projections.js'` after the `summary.js` import. All other imports are identical.

**Zod query schema with coerce** (`summary.ts` lines 13–14 — adapted):
```typescript
// server/src/routes/summary.ts lines 13-14 (range enum pattern)
const rangeValues = ['ytd', '6m', '1y', '2y', '3y', '5y', '10y', 'max'] as const
const querySchema = z.object({ range: z.enum(rangeValues).default('1y') })

// ── projections.ts uses coerce for numeric param:
const querySchema = z.object({
  years: z.coerce.number().int().min(1).max(30).default(10)
})
```
> Query params arrive as strings. `z.coerce.number()` converts `"10"` → `10` before `.int()` and `.max(30)` validate. Without `.coerce`, any request returns 400 "Expected number, received string."

**Hook pattern** (`summary.ts` lines 17–21):
```typescript
// server/src/routes/summary.ts lines 17-21
const hook = (result: { success: boolean; error?: z.ZodError }, c: any) => {
  if (!result.success && result.error) {
    return c.json({ error: result.error.issues[0]?.message ?? 'Invalid range' }, 400 as const)
  }
}
```
> Copy this hook verbatim, changing the fallback message to `'Invalid years'`. The `400 as const` type assertion is required for Hono's type inference.

**Router setup and `c.req.valid`** (`summary.ts` lines 10, 23–24):
```typescript
// server/src/routes/summary.ts lines 10, 23-24
const router = new Hono()

router.get('/', zValidator('query', querySchema, hook), async (c) => {
  const { range } = c.req.valid('query')
```
> Replace `{ range }` with `{ years }`. The `zValidator('query', ...)` call and `c.req.valid('query')` are identical.

**`readDb` + latestMonth/earliestMonth derivation** (`summary.ts` lines 25–44):
```typescript
// server/src/routes/summary.ts lines 25-44
const db = await readDb()

const now = new Date()
const currentMonth = toMonthKey(now.getFullYear(), now.getMonth() + 1)

const latestMonth = db.dataPoints.length === 0
  ? currentMonth
  : db.dataPoints.reduce((best, dp) =>
      dp.year_month > best ? dp.year_month : best,
      db.dataPoints[0].year_month
    )

const earliestMonth = db.dataPoints.length === 0
  ? currentMonth
  : db.dataPoints.reduce((best, dp) =>
      dp.year_month < best ? dp.year_month : best,
      db.dataPoints[0].year_month
    )
```
> Copy this block **without modification** — the projections route needs both values for the historical `getRangeBounds('max', ...)` call. `toMonthKey(now.getFullYear(), now.getMonth() + 1)` is the correct pattern (never `toISOString().slice(0,7)`).

**Historical + projection assembly and `c.json`** (`summary.ts` lines 45–50 — adapted):
```typescript
// server/src/routes/summary.ts lines 45-49 (base pattern)
const { startYM, endYM } = getRangeBounds(range, latestMonth, earliestMonth)
const months = monthRange(startYM, endYM)
const locfData = locfFill(months, db.dataPoints, db.assets)
return c.json(aggregateSummary(db.assets, db.categories, locfData, months))

// ── projections.ts extends this to two blocks:
const { startYM, endYM } = getRangeBounds('max', latestMonth, earliestMonth)
const histMonths = monthRange(startYM, endYM)
const locfData = locfFill(histMonths, db.dataPoints, db.assets)
const historical = aggregateSummary(db.assets, db.categories, locfData, histMonths)

const projection = buildProjection(db.assets, db.categories, db.dataPoints, years)

return c.json({ historical, projection })
```

**Export** (`summary.ts` line 52):
```typescript
// server/src/routes/summary.ts line 52
export default router
```

---

### `server/src/index.ts` (edit — route mounting)

**Analog:** `server/src/index.ts` lines 8–37 (self)

**Existing import block to mirror** (`index.ts` lines 9–12):
```typescript
// server/src/index.ts lines 9-12
import categoriesRouter from './routes/categories.js'
import assetsRouter from './routes/assets.js'
import dataPointsRouter from './routes/dataPoints.js'
import summaryRouter from './routes/summary.js'
```
> Add `import projectionsRouter from './routes/projections.js'` as the next line after `summaryRouter`.

**Existing mount block to extend** (`index.ts` lines 33–37):
```typescript
// server/src/index.ts lines 33-37
app.get('/api/v1/health', (c) => c.json({ status: 'ok' }))
app.route('/api/v1/categories', categoriesRouter)
app.route('/api/v1/assets', assetsRouter)
app.route('/api/v1/data-points', dataPointsRouter)
app.route('/api/v1/summary', summaryRouter)
```
> Add `app.route('/api/v1/projections', projectionsRouter)` immediately after the `summaryRouter` line and **before** the `serveStatic` middleware on line 42. API routes must all be registered before the static file handler.

---

## Shared Patterns

### `toMonthKey` — safe month formatting
**Source:** `server/src/calc/utils.ts` lines 7–9
**Apply to:** `projections.ts` (calc), `projections.ts` (route) via import
```typescript
// server/src/calc/utils.ts lines 7-9
export function toMonthKey(year: number, month: number): string {
  return String(year).padStart(4, '0') + '-' + String(month).padStart(2, '0')
}
```
> **Never** use `new Date().toISOString().slice(0, 7)` — UTC offset corrupts month keys for UTC+ users at local midnight. Always use `toMonthKey(y, m)` with integer parts.

### Integer month arithmetic (no `new Date()`)
**Source:** `server/src/calc/ranges.ts` lines 13–18 and `server/src/calc/utils.ts` lines 19–24
**Apply to:** `addOneMonth` private helper inside `projections.ts`
```typescript
// Pattern: split → integer arithmetic → carry → toMonthKey
let [y, m] = ym.split('-').map(Number)
m++
if (m > 12) { m = 1; y++ }
return toMonthKey(y, m)
```
> Same carry pattern used in `subtractMonths` (ranges.ts) and `monthRange` (utils.ts). No `Date` objects — DST-safe.

### Zod validation hook (API-01 compliance)
**Source:** `server/src/routes/summary.ts` lines 17–21 and `server/src/routes/dataPoints.ts` lines 12–15
**Apply to:** `server/src/routes/projections.ts`
```typescript
// server/src/routes/dataPoints.ts lines 12-15
const hook = (result: { success: boolean; error?: z.ZodError }, c: any) => {
  if (!result.success && result.error) {
    return c.json({ error: result.error.issues[0]?.message ?? 'Invalid request' }, 400 as const)
  }
}
```
> All routes use this identical hook shape. The only variation is the fallback message string. The `400 as const` is mandatory for Hono TypeScript inference.

### `readDb` + reduce-based date derivation
**Source:** `server/src/routes/summary.ts` lines 25–43
**Apply to:** `server/src/routes/projections.ts`
```typescript
// server/src/routes/summary.ts lines 25-43
const db = await readDb()
const now = new Date()
const currentMonth = toMonthKey(now.getFullYear(), now.getMonth() + 1)
const latestMonth = db.dataPoints.length === 0
  ? currentMonth
  : db.dataPoints.reduce((best, dp) =>
      dp.year_month > best ? dp.year_month : best,
      db.dataPoints[0].year_month
    )
const earliestMonth = db.dataPoints.length === 0
  ? currentMonth
  : db.dataPoints.reduce((best, dp) =>
      dp.year_month < best ? dp.year_month : best,
      db.dataPoints[0].year_month
    )
```
> Copy verbatim. YYYY-MM strings compare lexicographically correctly so `>` / `<` works without parsing.

### `export default router` convention
**Source:** Every route file in `server/src/routes/`
**Apply to:** `server/src/routes/projections.ts` (last line)
```typescript
export default router
```

---

## No Analog Found

All four files have strong analogs in the existing codebase. No files require falling back to RESEARCH.md patterns exclusively.

---

## Key Anti-Patterns (Do Not Copy)

| Anti-Pattern | Wrong | Correct Analog | Location |
|---|---|---|---|
| Simple monthly rate | `annualRate / 12` | `Math.pow(1 + annualRate, 1/12) - 1` | RESEARCH.md Pattern 1 |
| Falsy null check | `if (!asset.projected_yearly_growth)` | `asset.projected_yearly_growth !== null` | `models/index.ts` line 14 |
| UTC month key | `new Date().toISOString().slice(0,7)` | `toMonthKey(y, now.getMonth() + 1)` | `utils.ts` lines 7–9 |
| Off-by-one month count | `addNMonths(start, years*12)` as end | `addNMonths(start, years*12 - 1)` as end | RESEARCH.md Pitfall 7 |
| Overlap boundary | `projStart = latestMonth` | `projStart = addOneMonth(latestMonth)` | RESEARCH.md Pitfall 3 |

---

## Metadata

**Analog search scope:** `server/src/calc/`, `server/src/routes/`, `server/src/models/`, `server/src/index.ts`
**Files scanned:** 9
**Pattern extraction date:** 2026-04-22
