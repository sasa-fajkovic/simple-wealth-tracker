# Phase 2: CRUD API — Pattern Map

**Mapped:** 2026-04-22
**Files analyzed:** 4 (3 new, 1 modified)
**Analogs found:** 4 / 4 (codebase analogs for all; route files use research patterns as primary since no prior route files exist)

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `server/src/routes/categories.ts` | route/controller | CRUD + request-response | `server/src/storage/index.ts` + `server/src/bootstrap.ts` (structural) | role-match (no prior Hono route exists) |
| `server/src/routes/assets.ts` | route/controller | CRUD + request-response | `server/src/routes/categories.ts` (sibling, created same phase) | exact-sibling |
| `server/src/routes/dataPoints.ts` | route/controller | CRUD + request-response + sort | `server/src/routes/categories.ts` (sibling, created same phase) | exact-sibling |
| `server/src/index.ts` | entrypoint/config | request-response + middleware chain | `server/src/index.ts` (self — modification) | self-modification |

---

## Pattern Assignments

### `server/src/routes/categories.ts` (route/controller, CRUD)

**Primary analog:** `server/src/storage/index.ts` (import style, async/await, mutex-safe patterns)
**Secondary analog:** RESEARCH.md §Pattern 1 (verified Hono patterns — no prior route file exists to copy from)

---

#### Imports pattern
> Copy **exactly** — `.js` extensions are mandatory under NodeNext module resolution (RESEARCH §Pitfall E).

```typescript
import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { readDb, mutateDb } from '../storage/index.js'
import type { Category } from '../models/index.js'
```

**Source:** `server/src/storage/index.ts` lines 1–5 (import style); `server/src/bootstrap.ts` lines 1–7 (`.js` + `type` import convention)

---

#### Router scaffold pattern

```typescript
const router = new Hono()

// ... route registrations ...

export default router
```

**Mounted in index.ts as:** `app.route('/api/v1/categories', categoriesRouter)`

---

#### Validation hook pattern (SHARED — copy verbatim to all three route files)
> **CRITICAL:** `zValidator` without this hook returns raw Zod shape `{ success, error }`, NOT `{ error: "..." }`. Always pass hook as 3rd arg. (RESEARCH §2, §Pitfall A)

```typescript
const hook = (result: { success: boolean; error?: z.ZodError }, c: any) => {
  if (!result.success && result.error) {
    return c.json({ error: result.error.issues[0]?.message ?? 'Invalid request' }, 400 as const)
  }
}
```

---

#### Zod schema pattern (categories)

```typescript
const createSchema = z.object({
  name: z.string().min(1, 'name is required'),
  projected_yearly_growth: z.number(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'color must be a 6-digit hex color'),
})

const updateSchema = createSchema.extend({ id: z.string().optional() })
```

**Field names source:** `server/src/models/index.ts` lines 4–9 (Category interface — must match exactly)

---

#### Slug generation utility

```typescript
function toSlug(name: string): string {
  return name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
}
// "Real Estate" → "real-estate"
// "U.S. Stocks" → "us-stocks"
```

**Used in:** POST handler to generate `id` from `body.name`

---

#### GET handler pattern

```typescript
router.get('/', async (c) => {
  const db = await readDb()
  return c.json(db.categories)
})
```

**Source:** `server/src/storage/index.ts` lines 12–24 (readDb signature and usage)

---

#### POST handler pattern (readDb existence check → mutateDb)
> Pattern: readDb for duplicate check, then mutateDb for write. Two mutex acquisitions — acceptable for single-user app (RESEARCH §11).

```typescript
router.post('/', zValidator('json', createSchema, hook), async (c) => {
  const body = c.req.valid('json')
  const id = toSlug(body.name)

  const db = await readDb()
  if (db.categories.find((cat) => cat.id === id)) {
    throw new HTTPException(409, { message: `Category with id '${id}' already exists` })
  }

  const category: Category = { id, ...body }
  await mutateDb((db) => ({ ...db, categories: [...db.categories, category] }))
  return c.json(category, 201)
})
```

**mutateDb signature source:** `server/src/storage/index.ts` lines 30–46 — fn receives current `Database`, returns updated `Database`.

---

#### PUT handler pattern (ID immutability guard + readDb + mutateDb)

```typescript
router.put('/:id', zValidator('json', updateSchema, hook), async (c) => {
  const paramId = c.req.param('id')
  const body = c.req.valid('json')

  if (body.id !== undefined && body.id !== paramId) {
    throw new HTTPException(400, { message: 'id cannot be changed' })
  }

  const db = await readDb()
  const idx = db.categories.findIndex((cat) => cat.id === paramId)
  if (idx === -1) throw new HTTPException(404, { message: 'Category not found' })

  const { id: _id, ...updateData } = body
  const updated: Category = { ...db.categories[idx], ...updateData, id: paramId }
  await mutateDb((db) => {
    const cats = [...db.categories]
    cats[idx] = updated
    return { ...db, categories: cats }
  })
  return c.json(updated)
})
```

---

#### DELETE handler pattern (referential integrity → 409)

```typescript
router.delete('/:id', async (c) => {
  const id = c.req.param('id')
  const db = await readDb()

  if (!db.categories.find((cat) => cat.id === id)) {
    throw new HTTPException(404, { message: 'Category not found' })
  }

  const inUse = db.assets.filter((a) => a.category_id === id)
  if (inUse.length > 0) {
    throw new HTTPException(409, { message: `Category is in use by ${inUse.length} asset(s)` })
  }

  await mutateDb((db) => ({ ...db, categories: db.categories.filter((cat) => cat.id !== id) }))
  return c.json({ success: true })
})
```

---

### `server/src/routes/assets.ts` (route/controller, CRUD)

**Primary analog:** `server/src/routes/categories.ts` (created same phase — identical structure)

**Differences from categories.ts:**

#### Zod schema pattern (assets)
> Field names from `server/src/models/index.ts` lines 11–19 (Asset interface)

```typescript
import { randomUUID } from 'node:crypto'

const createSchema = z.object({
  name: z.string().min(1, 'name is required'),
  category_id: z.string().min(1, 'category_id is required'),
  projected_yearly_growth: z.number().nullable(),
  location: z.string().optional(),
  notes: z.string().optional(),
})

const updateSchema = createSchema.extend({ id: z.string().optional() })
```

#### POST handler — referential integrity check (category must exist)

```typescript
router.post('/', zValidator('json', createSchema, hook), async (c) => {
  const body = c.req.valid('json')
  const id = toSlug(body.name)

  const db = await readDb()
  if (!db.categories.find((cat) => cat.id === body.category_id)) {
    throw new HTTPException(404, { message: 'Category not found' })
  }
  if (db.assets.find((a) => a.id === id)) {
    throw new HTTPException(409, { message: `Asset with id '${id}' already exists` })
  }

  const now = new Date().toISOString()
  const asset: Asset = { id, ...body, created_at: now }
  await mutateDb((db) => ({ ...db, assets: [...db.assets, asset] }))
  return c.json(asset, 201)
})
```

**`created_at` field:** `server/src/models/index.ts` line 18 — ISO 8601, immutable after create. Set with `new Date().toISOString()`.

#### DELETE handler — referential integrity check (no orphan data points)

```typescript
router.delete('/:id', async (c) => {
  const id = c.req.param('id')
  const db = await readDb()

  if (!db.assets.find((a) => a.id === id)) {
    throw new HTTPException(404, { message: 'Asset not found' })
  }

  const inUse = db.dataPoints.filter((dp) => dp.asset_id === id)
  if (inUse.length > 0) {
    throw new HTTPException(409, { message: `Asset is in use by ${inUse.length} data point(s)` })
  }

  await mutateDb((db) => ({ ...db, assets: db.assets.filter((a) => a.id !== id) }))
  return c.json({ success: true })
})
```

---

### `server/src/routes/dataPoints.ts` (route/controller, CRUD + sort)

**Primary analog:** `server/src/routes/categories.ts` (sibling — same structure, with additions)

**Key differences from categories/assets:**

#### Additional import
```typescript
import { randomUUID } from 'node:crypto'
// NOT a global in ESM — must be explicitly imported (RESEARCH §7)
```

#### Zod schema pattern (data points)
> Field names from `server/src/models/index.ts` lines 21–31 (DataPoint interface)
> `year_month` must be YYYY-MM — ALWAYS from client, NEVER computed server-side (models comment lines 24–26)

```typescript
const createSchema = z.object({
  asset_id: z.string().min(1, 'asset_id is required'),
  year_month: z.string().regex(/^\d{4}-\d{2}$/, 'year_month must be YYYY-MM'),
  value: z.number().positive('value must be greater than 0'),
  notes: z.string().optional(),
})

const updateSchema = z.object({
  id: z.string().optional(),        // detect ID change attempts
  asset_id: z.string().optional(),  // detect asset_id change attempts
  year_month: z.string().regex(/^\d{4}-\d{2}$/, 'year_month must be YYYY-MM'),
  value: z.number().positive('value must be greater than 0'),
  notes: z.string().optional(),
})
```

#### GET handler — sort descending by year_month

```typescript
router.get('/', async (c) => {
  const db = await readDb()
  const sorted = [...db.dataPoints].sort((a, b) =>
    b.year_month.localeCompare(a.year_month)
  )
  return c.json(sorted)
})
```

> `localeCompare` on `YYYY-MM` works correctly — ISO format is lexicographically sortable (RESEARCH §12).

#### POST handler — UUID id, both timestamps, asset existence check

```typescript
router.post('/', zValidator('json', createSchema, hook), async (c) => {
  const body = c.req.valid('json')

  const db = await readDb()
  if (!db.assets.find((a) => a.id === body.asset_id)) {
    throw new HTTPException(404, { message: 'Asset not found' })
  }

  const now = new Date().toISOString()
  const point: DataPoint = {
    id: randomUUID(),
    ...body,
    created_at: now,
    updated_at: now,
  }
  await mutateDb((db) => ({ ...db, dataPoints: [...db.dataPoints, point] }))
  return c.json(point, 201)
})
```

**`id` generation:** `server/src/models/index.ts` line 22 — "UUID v4 via crypto.randomUUID()".

#### PUT handler — block both `id` and `asset_id` changes, update `updated_at`

```typescript
router.put('/:id', zValidator('json', updateSchema, hook), async (c) => {
  const paramId = c.req.param('id')
  const body = c.req.valid('json')

  if (body.id !== undefined && body.id !== paramId) {
    throw new HTTPException(400, { message: 'id cannot be changed' })
  }

  const db = await readDb()
  const existing = db.dataPoints.find((dp) => dp.id === paramId)
  if (!existing) throw new HTTPException(404, { message: 'Data point not found' })

  if (body.asset_id !== undefined && body.asset_id !== existing.asset_id) {
    throw new HTTPException(400, { message: 'asset_id cannot be changed' })
  }

  const { id: _id, asset_id: _aid, ...updateData } = body
  const now = new Date().toISOString()
  const updated: DataPoint = { ...existing, ...updateData, id: paramId, updated_at: now }
  await mutateDb((db) => ({
    ...db,
    dataPoints: db.dataPoints.map((dp) => dp.id === paramId ? updated : dp),
  }))
  return c.json(updated)
})
```

#### DELETE handler — no referential integrity check needed (data points are leaf nodes)

```typescript
router.delete('/:id', async (c) => {
  const id = c.req.param('id')
  const db = await readDb()

  if (!db.dataPoints.find((dp) => dp.id === id)) {
    throw new HTTPException(404, { message: 'Data point not found' })
  }

  await mutateDb((db) => ({ ...db, dataPoints: db.dataPoints.filter((dp) => dp.id !== id) }))
  return c.json({ success: true })
})
```

---

### `server/src/index.ts` (entrypoint, middleware chain) — MODIFICATION

**Analog:** `server/src/index.ts` (self — current lines 1–19)

**Current file** (`server/src/index.ts` lines 1–19):
```typescript
import { Hono } from 'hono'
import { serve } from '@hono/node-server'
import { bootstrapDatabase } from './bootstrap.js'

const app = new Hono()

app.get('/api/v1/health', (c) => c.json({ status: 'ok' }))

await bootstrapDatabase()

const PORT = Number(process.env.PORT ?? 8080)

serve({ fetch: app.fetch, port: PORT }, () => {
  console.log(`WealthTrack listening on port ${PORT}`)
})
```

**Replacement pattern** — full new content (preserve existing lines, extend with new imports/middleware):

```typescript
import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { bootstrapDatabase } from './bootstrap.js'
import categoriesRouter from './routes/categories.js'
import assetsRouter from './routes/assets.js'
import dataPointsRouter from './routes/dataPoints.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const WEB_DIST = process.env.WEB_DIST ?? resolve(__dirname, '../../web/dist')

const app = new Hono()

// 1. Error handler — MUST be registered FIRST (catches errors from all routes below)
app.onError((err, c) => {
  if (err instanceof HTTPException) {
    return c.json({ error: err.message }, err.status)
  }
  console.error(err)
  return c.json({ error: 'Internal server error' }, 500)
})

// 2. API routes
app.get('/api/v1/health', (c) => c.json({ status: 'ok' }))
app.route('/api/v1/categories', categoriesRouter)
app.route('/api/v1/assets', assetsRouter)
app.route('/api/v1/data-points', dataPointsRouter)

// 3. Static files (falls through via next() when file not found — RESEARCH §5)
// CRITICAL: import from '@hono/node-server/serve-static', NOT 'hono/middleware' (RESEARCH §Pitfall B)
app.use('*', serveStatic({ root: WEB_DIST }))

// 4. SPA catch-all — GET only, MUST be last (RESEARCH §Pitfall D)
app.get('*', async (c) => {
  try {
    const html = await readFile(resolve(WEB_DIST, 'index.html'), 'utf-8')
    return c.html(html)
  } catch {
    return c.json({ error: 'Not found' }, 404)
  }
})

await bootstrapDatabase()

const PORT = Number(process.env.PORT ?? 8080)

serve({ fetch: app.fetch, port: PORT }, () => {
  console.log(`WealthTrack listening on port ${PORT}`)
})
```

**Middleware registration order is critical** — see RESEARCH §6.

---

## Shared Patterns

### Storage Access (readDb / mutateDb)
**Source:** `server/src/storage/index.ts` lines 12–46
**Apply to:** All three route files

```typescript
// Import (mandatory .js extension — NodeNext)
import { readDb, mutateDb } from '../storage/index.js'

// Read pattern — returns full Database under mutex
const db = await readDb()

// Mutate pattern — fn receives current Database, returns updated Database
// fn must NEVER return c.json() — different scope (RESEARCH §Pitfall G)
await mutateDb((db) => ({ ...db, categories: [...db.categories, newItem] }))
```

---

### HTTPException Error Throwing
**Source:** RESEARCH §4 (verified against `node_modules/hono`)
**Apply to:** All three route files — every business-logic error

```typescript
import { HTTPException } from 'hono/http-exception'

throw new HTTPException(404, { message: 'Category not found' })   // not found
throw new HTTPException(409, { message: 'Category is in use by 3 asset(s)' })  // conflict
throw new HTTPException(400, { message: 'id cannot be changed' })  // immutability
```

**Caught by:** `app.onError` in `index.ts` → returns `c.json({ error: err.message }, err.status)`

---

### Type Imports from Models
**Source:** `server/src/models/index.ts` lines 1–37
**Apply to:** All three route files

```typescript
import type { Category } from '../models/index.js'   // for categories.ts
import type { Asset } from '../models/index.js'       // for assets.ts
import type { DataPoint } from '../models/index.js'   // for dataPoints.ts
import type { Database } from '../models/index.js'    // if needed inside mutateDb callback
```

**Field name contract** (must not diverge from models):
- Category: `id`, `name`, `projected_yearly_growth`, `color`
- Asset: `id`, `name`, `category_id`, `projected_yearly_growth` (nullable!), `location?`, `notes?`, `created_at`
- DataPoint: `id`, `asset_id`, `year_month`, `value`, `notes?`, `created_at`, `updated_at`

---

### Async Top-Level Await Pattern
**Source:** `server/src/index.ts` line 13 (`await bootstrapDatabase()`)
**Source:** `server/src/bootstrap.ts` line 9 (`export async function bootstrapDatabase()`)

All route handlers use `async (c) => { ... }` — consistent with the project's top-level await ESM style.

---

## No Analog Found

No files are completely without structural analog. However, the **route files** have no prior Hono route in this codebase — the patterns come entirely from RESEARCH.md (itself verified against `node_modules` source and official docs):

| File | Role | Data Flow | Reason |
|---|---|---|---|
| `server/src/routes/categories.ts` | route/controller | CRUD | First route file — no prior route analog in codebase |
| `server/src/routes/assets.ts` | route/controller | CRUD | Second route file — categories.ts is its own analog once created |
| `server/src/routes/dataPoints.ts` | route/controller | CRUD+sort | Third route file — categories.ts is its analog once created |

---

## Critical Constraints Summary (from models/index.ts)

| Field | Constraint | Source |
|---|---|---|
| `Category.id` | URL-safe slug, immutable after create | models line 5 |
| `Asset.id` | URL-safe slug, immutable after create | models line 12 |
| `Asset.projected_yearly_growth` | `number \| null` — NOT optional (`?`) | models line 14 |
| `DataPoint.id` | UUID v4 via `crypto.randomUUID()` | models line 22 |
| `DataPoint.year_month` | `YYYY-MM`, always from client — NEVER `toISOString()` | models lines 24–26 |
| `DataPoint.created_at` / `updated_at` | ISO 8601 — set server-side with `new Date().toISOString()` | models lines 29–30 |

---

## Metadata

**Analog search scope:** `server/src/` (all files), `web/src/` (API call patterns — none exist yet)
**Files scanned:** `server/src/index.ts`, `server/src/storage/index.ts`, `server/src/models/index.ts`, `server/src/bootstrap.ts`, `web/src/` (empty — no API files yet)
**Pattern extraction date:** 2026-04-22

## PATTERN MAPPING COMPLETE
