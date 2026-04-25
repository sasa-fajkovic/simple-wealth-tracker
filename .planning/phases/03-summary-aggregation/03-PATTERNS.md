# Phase 3: Summary Aggregation — Pattern Map

**Mapped:** 2026-04-23
**Files analyzed:** 7 new/modified files
**Analogs found:** 3 / 7 (4 files have no project analog — pure calc + tests are first of their kind)

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `server/src/calc/utils.ts` | utility | transform | *(none — first pure calc file)* | no analog |
| `server/src/calc/ranges.ts` | utility | transform | `server/src/calc/utils.ts` (sibling, same phase) | role-match |
| `server/src/calc/summary.ts` | service | transform | `server/src/calc/utils.ts` (sibling, same phase) | role-match |
| `server/src/routes/summary.ts` | route/controller | request-response | `server/src/routes/dataPoints.ts` | exact |
| `server/src/calc/utils.test.ts` | test | — | *(none — first test file in project)* | no analog |
| `server/src/calc/ranges.test.ts` | test | — | *(none — first test file in project)* | no analog |
| `server/src/calc/summary.test.ts` | test | — | *(none — first test file in project)* | no analog |
| `server/src/index.ts` *(modified)* | config/entrypoint | — | itself (lines 9–11, 33–35) | exact |

---

## Pattern Assignments

### `server/src/calc/utils.ts` (utility, transform)

**Analog:** None in project. Pattern is self-contained pure TypeScript — no imports needed.

**Module shape** — copy this exactly:
```typescript
// server/src/calc/utils.ts
// No imports — pure arithmetic, no I/O, no project dependencies

// toMonthKey — zero-pads year and month to produce YYYY-MM
// NEVER use toISOString().slice(0,7) — UTC shift corrupts month keys for UTC+ users (models/index.ts line 24)
export function toMonthKey(year: number, month: number): string {
  return String(year).padStart(4, '0') + '-' + String(month).padStart(2, '0')
}

// monthRange — inclusive ordered YYYY-MM array using integer arithmetic ONLY
// NEVER use new Date(y, m, 1) — produces wrong months at DST boundaries in some timezones
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

**TypeScript config constraints** (from `server/tsconfig.json`):
- `"noUnusedLocals": true` — every declared variable must be used; prefix unused with `_`
- `"noUnusedParameters": true` — same rule for function parameters
- `"strict": true` — no implicit `any`, strict null checks
- `"module": "NodeNext"` — all local imports MUST use `.js` extension (even for `.ts` source files)

---

### `server/src/calc/ranges.ts` (utility, transform)

**Analog:** `server/src/calc/utils.ts` (sibling written in same phase). One import from sibling.

**Full module pattern**:
```typescript
// server/src/calc/ranges.ts
// NodeNext: .js extension required even though source is .ts
import { toMonthKey } from './utils.js'

// Integer-arithmetic month subtraction — NEVER new Date()
function subtractMonths(ym: string, n: number): string {
  let [y, m] = ym.split('-').map(Number)
  m -= n
  while (m <= 0) { m += 12; y-- }
  return toMonthKey(y, m)
}

export function getRangeBounds(
  range: string,
  latestMonth: string,
  earliestMonth?: string,   // required for 'max'; defaults to latestMonth if undefined
): { startYM: string; endYM: string } {
  const currentYear = new Date().getFullYear()   // only used for 'ytd'

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
      throw new Error(`Unknown range: ${range}`)  // defensive; zod prevents this in practice
  }
}
```

**Off-by-one rule:** `Nm` means N months total → subtract `N-1`. `6m` → `subtractMonths(latest, 5)`. Verify: `monthRange(start, end).length === N`.

---

### `server/src/calc/summary.ts` (service, transform)

**Analog:** None for the LOCF/aggregation logic itself. Import pattern follows NodeNext `.js` convention established in all existing route files.

**Imports pattern** — type-only imports from models (no runtime cost):
```typescript
// server/src/calc/summary.ts
// Type-only imports — no runtime side effects, no I/O
import type { DataPoint, Asset, Category } from '../models/index.js'
```

**Interface definition** — define `SummaryResponse` in this file (no separate types file):
```typescript
export interface SummaryResponse {
  months: string[]
  series: {
    category_id: string
    category_name: string
    color: string
    values: number[]       // one per month, length === months.length, never null
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
```

**LOCF function** — critical: seed carry as `null`, not `0` or `undefined`:
```typescript
// Returns Map<assetId → Map<monthKey → filledValue>>
export function locfFill(
  months: string[],
  dataPoints: DataPoint[],
  assets: Asset[],
): Map<string, Map<string, number>> {
  const result = new Map<string, Map<string, number>>()

  for (const asset of assets) {
    const assetMap = new Map<string, number>()
    let carry: number | null = null  // null = no data seen yet → emit 0 (NOT backward fill)

    for (const month of months) {
      // SUM-02: upsert semantics — latest updated_at wins for same asset+month
      const candidates = dataPoints.filter(
        (dp) => dp.asset_id === asset.id && dp.year_month === month,
      )
      if (candidates.length > 0) {
        // ISO strings are lexicographically comparable — same pattern as DP-01 sort
        candidates.sort((a, b) => b.updated_at.localeCompare(a.updated_at))
        carry = candidates[0].value
      }
      // SUM-03: before first data point → 0 (not the first known value); after → carry forward
      assetMap.set(month, carry ?? 0)
    }

    result.set(asset.id, assetMap)
  }

  return result
}
```

**Aggregation function** — guard divide-by-zero in TWO places:
```typescript
export function aggregateSummary(
  locfData: Map<string, Map<string, number>>,
  categories: Category[],
  assets: Asset[],
  months: string[],
): SummaryResponse {
  const series = categories.map((cat) => {
    const catAssets = assets.filter((a) => a.category_id === cat.id)
    const values = months.map((month) =>
      catAssets.reduce((sum, asset) => sum + (locfData.get(asset.id)?.get(month) ?? 0), 0)
    )
    return { category_id: cat.id, category_name: cat.name, color: cat.color, values }
  })

  const totals = months.map((_, i) => series.reduce((sum, s) => sum + s.values[i], 0))

  const current_total = totals[totals.length - 1] ?? 0
  const first_total = totals[0] ?? 0
  const period_delta_abs = current_total - first_total
  // GUARD 1: divide-by-zero when DB is empty or first month total is 0
  const period_delta_pct = first_total === 0 ? 0 : (period_delta_abs / first_total) * 100

  const category_breakdown = series.map((s) => {
    const value = s.values[s.values.length - 1] ?? 0
    // GUARD 2: divide-by-zero when all assets are 0
    const pct_of_total = current_total === 0 ? 0 : (value / current_total) * 100
    return { category_id: s.category_id, category_name: s.category_name, color: s.color, value, pct_of_total }
  })

  return { months, series, totals, current_total, period_delta_abs, period_delta_pct, category_breakdown }
}
```

---

### `server/src/routes/summary.ts` (route/controller, request-response)

**Analog:** `server/src/routes/dataPoints.ts` (lines 1–8 imports; lines 11–15 hook; lines 36–42 GET pattern)

**Imports pattern** (copy from `dataPoints.ts` lines 1–7, adapt):
```typescript
// server/src/routes/summary.ts
import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { readDb } from '../storage/index.js'             // readDb only — Phase 3 is read-only
import { toMonthKey, monthRange } from '../calc/utils.js'
import { getRangeBounds } from '../calc/ranges.js'
import { locfFill, aggregateSummary } from '../calc/summary.js'
```

**Hook pattern** (copy verbatim from `categories.ts` lines 11–16 — identical across all routes):
```typescript
const router = new Hono()

// MANDATORY: hook returns {"error":"..."} shape (API-01 compliance)
// Same hook used in categories.ts, assets.ts, dataPoints.ts — do not deviate
const hook = (result: { success: boolean; error?: z.ZodError }, c: any) => {
  if (!result.success && result.error) {
    return c.json({ error: result.error.issues[0]?.message ?? 'Invalid request' }, 400 as const)
  }
}
```

**Query schema** (note: `zValidator('query', ...)` not `zValidator('json', ...)`):
```typescript
const VALID_RANGES = ['ytd', '6m', '1y', '2y', '3y', '5y', '10y', 'max'] as const
const querySchema = z.object({
  range: z.enum(VALID_RANGES).default('1y'),   // missing param → '1y', invalid → 400
})
```

**GET handler** (analog: `dataPoints.ts` line 36–42 GET pattern, adapted for query + calc):
```typescript
router.get('/', zValidator('query', querySchema, hook), async (c) => {
  const { range } = c.req.valid('query')
  const db = await readDb()

  // Resolve latestMonth and earliestMonth — defensive: empty DB defaults to current month
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

export default router
```

**Error handling** — NO `try/catch` in this handler. All errors propagate to the global `app.onError` registered in `index.ts` lines 23–29. This is the same pattern used by all existing route files — none wrap `readDb()` in try/catch.

---

### `server/src/index.ts` *(modified — 2 lines only)*

**Analog:** itself — lines 9–11 (existing imports) and lines 33–35 (existing route mounts).

**Import to add** (after line 11, matching existing import style):
```typescript
// Add after: import dataPointsRouter from './routes/dataPoints.js'
import summaryRouter from './routes/summary.js'
```

**Route mount to add** (after line 35, matching existing mount style):
```typescript
// Add after: app.route('/api/v1/data-points', dataPointsRouter)
app.route('/api/v1/summary', summaryRouter)
```

---

### `server/src/calc/utils.test.ts` (test, Wave 0)

**Analog:** None in project — first test file. Use Node.js built-in `node:test` + `node:assert/strict`.

**Run command** (from `03-VALIDATION.md`):
```
node --import tsx/esm --test server/src/calc/utils.test.ts
```

**Test file pattern** — copy this structure exactly for all three test files:
```typescript
// server/src/calc/utils.test.ts
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { toMonthKey, monthRange } from './utils.js'

describe('toMonthKey', () => {
  test('pads single-digit month', () => {
    assert.equal(toMonthKey(2024, 5), '2024-05')
  })
  test('handles December', () => {
    assert.equal(toMonthKey(2024, 12), '2024-12')
  })
  test('handles January', () => {
    assert.equal(toMonthKey(2025, 1), '2025-01')
  })
})

describe('monthRange', () => {
  test('returns inclusive array', () => {
    assert.deepEqual(monthRange('2024-11', '2025-01'), ['2024-11', '2024-12', '2025-01'])
  })
  test('single month', () => {
    assert.deepEqual(monthRange('2024-06', '2024-06'), ['2024-06'])
  })
  test('6m is exactly 6 months', () => {
    // Regression guard for off-by-one (Pitfall 2)
    assert.equal(monthRange('2024-11', '2025-04').length, 6)
  })
  test('crosses year boundary correctly', () => {
    const r = monthRange('2024-10', '2025-03')
    assert.equal(r.length, 6)
    assert.equal(r[0], '2024-10')
    assert.equal(r[5], '2025-03')
  })
})
```

---

### `server/src/calc/ranges.test.ts` (test, Wave 0)

**Analog:** `utils.test.ts` (sibling test file in same phase — copy structure).

**Key stubs required** (from `03-VALIDATION.md` tasks 3-02-01, 3-02-02):
```typescript
// server/src/calc/ranges.test.ts
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { getRangeBounds } from './ranges.js'

describe('getRangeBounds', () => {
  // Use a fixed latestMonth to make tests deterministic
  const latest = '2025-04'
  const earliest = '2023-01'

  test('6m: exactly 6 inclusive months', () => {
    const { startYM, endYM } = getRangeBounds('6m', latest)
    // monthRange(startYM, endYM).length should be 6 — validate bounds directly
    assert.equal(endYM, '2025-04')
    assert.equal(startYM, '2024-11')
  })
  test('1y: exactly 12 inclusive months', () => {
    const { startYM, endYM } = getRangeBounds('1y', latest)
    assert.equal(endYM, '2025-04')
    assert.equal(startYM, '2024-05')
  })
  test('ytd: starts at Jan of current year', () => {
    const { startYM } = getRangeBounds('ytd', latest)
    assert.equal(startYM, `${new Date().getFullYear()}-01`)
  })
  test('max: uses earliestMonth', () => {
    const { startYM, endYM } = getRangeBounds('max', latest, earliest)
    assert.equal(startYM, earliest)
    assert.equal(endYM, latest)
  })
  test('max: falls back to latestMonth when no earliestMonth', () => {
    const { startYM, endYM } = getRangeBounds('max', latest)
    assert.equal(startYM, latest)
    assert.equal(endYM, latest)
  })
  test('unknown range throws', () => {
    assert.throws(() => getRangeBounds('bad', latest), /Unknown range/)
  })
})
```

---

### `server/src/calc/summary.test.ts` (test, Wave 0)

**Analog:** `utils.test.ts` structure. Requires fixture data — define minimal inline, not from files.

**Critical test cases** (from `03-VALIDATION.md` tasks 3-01-02, 3-01-03, 3-03-01, 3-03-02, 3-03-03):
```typescript
// server/src/calc/summary.test.ts
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { locfFill } from './summary.js'
import { aggregateSummary } from './summary.js'
import type { DataPoint, Asset, Category } from '../models/index.js'

// Minimal fixtures — inline, no file I/O
const asset1: Asset = { id: 'a1', name: 'A1', category_id: 'cat1', projected_yearly_growth: null, created_at: '2024-01-01T00:00:00Z' }
const cat1: Category = { id: 'cat1', name: 'Cat1', projected_yearly_growth: 0.08, color: '#6366f1' }

function makeDP(assetId: string, ym: string, value: number, updatedAt?: string): DataPoint {
  return { id: `${assetId}-${ym}`, asset_id: assetId, year_month: ym, value, notes: undefined, created_at: '2024-01-01T00:00:00Z', updated_at: updatedAt ?? '2024-01-01T00:00:00Z' }
}

describe('locfFill', () => {
  test('SUM-03: months before first data point emit 0, not the first value', () => {
    const months = ['2024-01', '2024-02', '2024-03']
    const dps = [makeDP('a1', '2024-02', 1000)]
    const result = locfFill(months, dps, [asset1])
    assert.equal(result.get('a1')!.get('2024-01'), 0)   // before first dp → 0
    assert.equal(result.get('a1')!.get('2024-02'), 1000) // first dp
    assert.equal(result.get('a1')!.get('2024-03'), 1000) // LOCF carry
  })

  test('SUM-02: upsert — latest updated_at wins for same asset+month', () => {
    const months = ['2024-01']
    const dps = [
      makeDP('a1', '2024-01', 1000, '2024-01-10T00:00:00Z'),
      makeDP('a1', '2024-01', 2000, '2024-01-20T00:00:00Z'),  // newer
    ]
    const result = locfFill(months, dps, [asset1])
    assert.equal(result.get('a1')!.get('2024-01'), 2000)
  })

  test('asset with no data points: all months emit 0', () => {
    const months = ['2024-01', '2024-02']
    const result = locfFill(months, [], [asset1])
    assert.equal(result.get('a1')!.get('2024-01'), 0)
    assert.equal(result.get('a1')!.get('2024-02'), 0)
  })
})

describe('aggregateSummary', () => {
  test('SUM-04: series[].values.length === months.length', () => {
    const months = ['2024-01', '2024-02', '2024-03']
    const locfData = locfFill(months, [], [asset1])
    const result = aggregateSummary(locfData, [cat1], [asset1], months)
    assert.equal(result.series[0].values.length, 3)
    assert.equal(result.months.length, 3)
    assert.equal(result.totals.length, 3)
  })

  test('SUM-05: period_delta_pct is 0 (not NaN/Infinity) when first_total is 0', () => {
    const months = ['2024-01', '2024-02']
    const locfData = locfFill(months, [], [asset1])
    const result = aggregateSummary(locfData, [cat1], [asset1], months)
    assert.equal(result.period_delta_pct, 0)
    assert.ok(Number.isFinite(result.period_delta_pct))
  })

  test('SUM-05: pct_of_total is 0 when current_total is 0', () => {
    const months = ['2024-01']
    const locfData = locfFill(months, [], [asset1])
    const result = aggregateSummary(locfData, [cat1], [asset1], months)
    assert.equal(result.category_breakdown[0].pct_of_total, 0)
  })
})
```

---

## Shared Patterns

### Import Extension Rule
**Source:** All existing route files (e.g., `server/src/routes/categories.ts` line 5)
**Apply to:** All 4 new `calc/` and `routes/` files
```typescript
// Always .js even though source is .ts — required by NodeNext moduleResolution
import { readDb } from '../storage/index.js'
import { toMonthKey } from './utils.js'
```

### Hook (zValidator error shape)
**Source:** `server/src/routes/categories.ts` lines 11–16
**Apply to:** `routes/summary.ts`
```typescript
const hook = (result: { success: boolean; error?: z.ZodError }, c: any) => {
  if (!result.success && result.error) {
    return c.json({ error: result.error.issues[0]?.message ?? 'Invalid request' }, 400 as const)
  }
}
```

### Global Error Handling (no local try/catch in routes)
**Source:** `server/src/index.ts` lines 23–29
**Apply to:** `routes/summary.ts` — do NOT add try/catch; let `HTTPException` propagate
```typescript
// Global handler in index.ts catches all HTTPException from sub-routers
app.onError((err, c) => {
  if (err instanceof HTTPException) {
    return c.json({ error: err.message }, err.status)
  }
  console.error(err)
  return c.json({ error: 'Internal server error' }, 500)
})
```

### `export default router` (route file termination)
**Source:** `server/src/routes/categories.ts` line 96, `assets.ts` line 101, `dataPoints.ts` line 112
**Apply to:** `routes/summary.ts` — always the last line
```typescript
export default router
```

### `node:test` Test Runner Pattern
**Source:** Node.js built-in (no project analog exists yet)
**Apply to:** All three `calc/*.test.ts` files
```typescript
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
// Run: node --import tsx/esm --test server/src/calc/<file>.test.ts
```

---

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `server/src/calc/utils.ts` | utility | transform | No calc/ directory exists in the project yet |
| `server/src/calc/ranges.ts` | utility | transform | Same — sibling in same phase; `utils.ts` is its only reference |
| `server/src/calc/summary.ts` | service | transform | Same — first aggregation/LOCF function in project |
| `server/src/calc/utils.test.ts` | test | — | No test files exist in project source (only in node_modules) |
| `server/src/calc/ranges.test.ts` | test | — | Same |
| `server/src/calc/summary.test.ts` | test | — | Same |

**For calc files:** Use the algorithm patterns documented in `03-RESEARCH.md` Patterns 1–6 verbatim. They are fully specified and verified against the requirements.

**For test files:** Use `node:test` + `node:assert/strict` as shown above. No config file needed.

---

## Metadata

**Analog search scope:** `server/src/routes/`, `server/src/storage/`, `server/src/models/`, `server/src/`
**Files scanned:** 7 (categories.ts, assets.ts, dataPoints.ts, index.ts, storage/index.ts, models/index.ts, bootstrap.ts)
**No path aliases** — project uses relative imports throughout (`../`, `./`)
**Pattern extraction date:** 2026-04-23
