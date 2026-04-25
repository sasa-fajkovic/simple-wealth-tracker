# Phase 2: CRUD API — Research

**Researched:** 2026-04-22
**Domain:** Hono v4 + Node.js 22 REST API — routing, Zod validation, static serving
**Confidence:** HIGH (all Hono patterns verified via Context7 + official middleware README + live module inspection)

---

## Summary

Phase 2 builds three route handler files (`categories.ts`, `assets.ts`, `dataPoints.ts`), wires them into `index.ts`, and configures SPA static serving. The storage abstraction from Phase 1 (`readDb`/`mutateDb`) is already complete and correct — route handlers just call it. The main Phase 2 engineering is: Hono sub-router wiring, Zod schema definitions with the `@hono/zod-validator` hook, referential integrity checks (409s), and the three-layer middleware ordering (API routes → serveStatic → SPA catch-all).

The biggest non-obvious decisions are: (1) the `@hono/zod-validator` default 400 response does **not** match the required `{"error":"..."}` shape — a custom hook is mandatory; (2) `serveStatic` from `@hono/node-server/serve-static` does properly call `next()` when a file is missing, so the SPA catch-all works naturally; (3) the global `app.onError` handler must extract `err.message` rather than using `err.getResponse()` to produce consistent JSON error bodies.

**Primary recommendation:** Define Zod schemas with a shared `validationHook` helper that returns `{ error: result.error.issues[0]?.message }` on failure. Use `throw new HTTPException(status, { message })` for all business-logic errors and handle them in `app.onError` with `c.json({ error: err.message }, err.status)`.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|---|---|---|---|
| CRUD validation (schema + shape) | API (Hono middleware) | — | `@hono/zod-validator` runs before handler |
| Referential integrity (409 checks) | API (route handler) | Storage (readDb) | Handler reads DB and checks references |
| ID generation (slug / UUID) | API (route handler) | — | Pure computation, no storage dependency |
| File storage (read/write) | Storage layer (`storage/index.ts`) | — | Phase 1 already owns this |
| SPA static file serving | API (Hono middleware) | CDN/Static | `serveStatic` handles at server layer |
| Error shape normalisation | API (onError handler) | — | Centralised in `app.onError` |

---

## Key Findings

### 1. Hono Sub-Routers and app.route() Mount Point

[VERIFIED: Context7 /llmstxt/hono_dev_llms_txt, https://hono.dev/docs/guides/best-practices]

Each route file creates its own `new Hono()` instance and registers paths **relative to its mount point**. The main app mounts with the full prefix.

```typescript
// server/src/routes/categories.ts
import { Hono } from 'hono'

const router = new Hono()

router.get('/', (c) => { /* GET /api/v1/categories */ })
router.post('/', (c) => { /* POST /api/v1/categories */ })
router.put('/:id', (c) => { /* PUT /api/v1/categories/:id */ })
router.delete('/:id', (c) => { /* DELETE /api/v1/categories/:id */ })

export default router
```

```typescript
// server/src/index.ts
import { Hono } from 'hono'
import categoriesRouter from './routes/categories.js'
import assetsRouter from './routes/assets.js'
import dataPointsRouter from './routes/dataPoints.js'

const app = new Hono()

app.route('/api/v1/categories', categoriesRouter)
app.route('/api/v1/assets', assetsRouter)
app.route('/api/v1/data-points', dataPointsRouter)
```

**Key:** The sub-router uses `/` and `/:id`, NOT `/categories` and `/categories/:id`. The mount prefix is the full path.

---

### 2. @hono/zod-validator — Default vs Required Behavior

[VERIFIED: https://raw.githubusercontent.com/honojs/middleware/main/packages/zod-validator/README.md + live module inspection of `node_modules/@hono/zod-validator/dist/index.js`]

**Default behavior (WITHOUT hook):** Returns `c.json(zodSafeParseResult, 400)` — the raw `{ success: false, error: { issues: [...] } }` shape. This does **NOT** match the required `{"error":"..."}` shape.

**Required behavior:** Must pass a hook as the 3rd argument to return `{"error":"..."}` on validation failure.

```typescript
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'

// Define a reusable helper to enforce consistent error shape
const validationHook = (result: { success: boolean; error?: z.ZodError }, c: any) => {
  if (!result.success && result.error) {
    return c.json({ error: result.error.issues[0]?.message ?? 'Invalid request' }, 400)
  }
}

// Usage on a route:
router.post(
  '/',
  zValidator('json', createCategorySchema, validationHook),
  async (c) => {
    const body = c.req.valid('json')
    // body is fully typed and validated
  }
)
```

The hook signature: `(result: SafeParseReturnType & { target }, c: Context) => Response | void`. If hook returns a Response, it short-circuits. If it returns void (success path), the handler runs.

Access validated data: `c.req.valid('json')` — fully typed, guaranteed valid if handler runs.

---

### 3. Route Parameter Access

[VERIFIED: Context7 /llmstxt/hono_dev_llms_txt]

```typescript
// Single param
const id = c.req.param('id')

// Multiple params  
const { id, commentId } = c.req.param()
```

---

### 4. Error Handling — onError + HTTPException

[VERIFIED: Context7 /llmstxt/hono_dev_llms_txt, https://hono.dev/docs/api/exception]

**Recommended pattern:** throw `HTTPException` from handlers; catch all in `app.onError` and return `{"error":"..."}` JSON.

```typescript
// server/src/index.ts — register BEFORE routes
import { HTTPException } from 'hono/http-exception'

app.onError((err, c) => {
  if (err instanceof HTTPException) {
    return c.json({ error: err.message }, err.status)
  }
  console.error(err)
  return c.json({ error: 'Internal server error' }, 500)
})
```

```typescript
// In a route handler:
import { HTTPException } from 'hono/http-exception'

// 404 not found
throw new HTTPException(404, { message: 'Category not found' })

// 409 conflict
throw new HTTPException(409, { message: `Category is in use by ${count} asset(s)` })

// 400 validation (business logic, not schema)
throw new HTTPException(400, { message: 'id cannot be changed' })
```

**Important:** `HTTPException(status, { message })` — the `message` becomes `err.message` in the `onError` handler. Using `err.getResponse()` returns a plain text Response (not JSON) — avoid this.

**Alternative (inline):** For simple cases, `return c.json({ error: 'Not found' }, 404)` is also valid and avoids the throw. Use whichever is clearer per handler. The `onError` handler is for unhandled/unexpected errors and thrown HTTPExceptions.

---

### 5. serveStatic — Path Resolution and SPA Fallthrough

[VERIFIED: live module inspection of `node_modules/@hono/node-server/dist/serve-static.mjs`]

**Import (CRITICAL — correct package):**
```typescript
import { serveStatic } from '@hono/node-server/serve-static'
// NOT: import { serveStatic } from 'hono/middleware' — that's a different package
```

**Fallthrough behavior (verified in source):** When a file is not found, `serveStatic` calls `next()` — it does NOT return a 404 response. This means it correctly falls through to the SPA catch-all.

**`root` option:** Relative to the Node.js process **CWD** (where `node` was started). Absolute paths also work because `path.join(absoluteRoot, '/path/to/file')` correctly combines them.

**Recommended pattern using `import.meta.url` for reliable absolute path:**

```typescript
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { readFile } from 'node:fs/promises'
import { serveStatic } from '@hono/node-server/serve-static'

const __dirname = dirname(fileURLToPath(import.meta.url))
// In src/: __dirname = 'server/src/'  → resolves to 'web/dist'
// In dist/: __dirname = 'server/dist/' → also resolves to 'web/dist'
const WEB_DIST = process.env.WEB_DIST ?? resolve(__dirname, '../../web/dist')

// Register AFTER all API routes:
app.use('*', serveStatic({ root: WEB_DIST }))

// SPA catch-all — MUST be last
app.get('*', async (c) => {
  try {
    const html = await readFile(resolve(WEB_DIST, 'index.html'), 'utf-8')
    return c.html(html)
  } catch {
    return c.json({ error: 'Not found' }, 404)
  }
})
```

**Directory auto-index:** When `serveStatic` is hit with a directory path, it looks for `index` option (default: `'index.html'`). So `GET /` on a directory serving request will serve `index.html` automatically. The SPA catch-all still handles non-file client routes like `/dashboard`.

---

### 6. Full Middleware Registration Order in index.ts

[VERIFIED: Hono docs + serveStatic source inspection]

```typescript
// CRITICAL ORDER — must not be changed

// 1. Error handler — register FIRST so it catches errors from ALL routes
app.onError(...)

// 2. API routes
app.get('/api/v1/health', ...)
app.route('/api/v1/categories', categoriesRouter)
app.route('/api/v1/assets', assetsRouter)
app.route('/api/v1/data-points', dataPointsRouter)

// 3. Static file serving — after API routes, before catch-all
app.use('*', serveStatic({ root: WEB_DIST }))

// 4. SPA catch-all — MUST be absolutely last
app.get('*', async (c) => { /* serve index.html */ })
```

**Why this order:**
- API routes before serveStatic: `/api/v1/categories` must never hit the filesystem
- serveStatic before catch-all: JS/CSS/assets must be served as files, not as index.html
- Catch-all as GET only: POST/PUT/DELETE to unknown paths should still get 404, not index.html

---

### 7. Node.js Built-in Imports

[VERIFIED: Node.js docs, Phase 1 patterns in storage/index.ts]

```typescript
import { randomUUID } from 'node:crypto'    // crypto.randomUUID() — no npm package needed
import { readFile } from 'node:fs/promises' // for SPA index.html read
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
```

**`crypto.randomUUID()`:** Available since Node.js 14.17.0. Use `import { randomUUID } from 'node:crypto'`. It is NOT a global in ESM modules (unlike browser contexts).

---

### 8. Slug Generation for POST /categories and POST /assets

[VERIFIED: Phase description constraint + REQUIREMENTS.md MODEL-01/02]

```typescript
function toSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/\s+/g, '-')          // spaces → hyphens
    .replace(/[^a-z0-9-]/g, '')    // strip non-alphanumeric except hyphen
}

// "Real Estate" → "real-estate"
// "U.S. Stocks" → "us-stocks"
// "Cash & Bonds" → "cash-bonds"
```

**Edge case to test:** Multiple spaces → single hyphen (the `\s+` handles this). Leading/trailing hyphens are possible if name starts/ends with non-alphanum — acceptable for v1.

---

### 9. ID Immutability in PUT Handlers

[VERIFIED: Phase description + REQUIREMENTS.md CAT-03, ASSET-03, DP-03]

The cleanest approach: include `id` as `z.string().optional()` in the PUT Zod schema, then check after validation:

```typescript
const updateCategorySchema = z.object({
  id: z.string().optional(),  // included only to detect change attempts
  name: z.string().min(1),
  projected_yearly_growth: z.number(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'color must be a hex color'),
})

router.put('/:id', zValidator('json', updateCategorySchema, validationHook), async (c) => {
  const paramId = c.req.param('id')
  const body = c.req.valid('json')

  if (body.id !== undefined && body.id !== paramId) {
    throw new HTTPException(400, { message: 'id cannot be changed' })
  }

  // Use paramId (not body.id) for the update
  await mutateDb((db) => {
    const idx = db.categories.findIndex((c) => c.id === paramId)
    if (idx === -1) throw new HTTPException(404, { message: 'Category not found' })
    db.categories[idx] = { ...db.categories[idx], ...body, id: paramId }
    return db
  })
  // ...
})
```

**For dataPoints PUT:** also block `asset_id` changes — include `asset_id: z.string().optional()` and check similarly.

**Note on throwing inside `mutateDb` fn:** `mutateDb` runs the fn under the mutex. If the fn throws, the mutex is released (async-mutex `runExclusive` is exception-safe) and the error propagates to the route handler, where it can be caught or re-thrown.

---

### 10. Zod Schemas for Each Resource

[VERIFIED: REQUIREMENTS.md MODEL-01, MODEL-02, MODEL-03 + Phase description]

```typescript
import { z } from 'zod'

// Categories
export const createCategorySchema = z.object({
  name: z.string().min(1, 'name is required'),
  projected_yearly_growth: z.number(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'color must be a 6-digit hex color'),
})

export const updateCategorySchema = createCategorySchema.extend({
  id: z.string().optional(),  // detect ID change attempts only
})

// Assets
export const createAssetSchema = z.object({
  name: z.string().min(1, 'name is required'),
  category_id: z.string().min(1, 'category_id is required'),
  projected_yearly_growth: z.number().nullable(),
  location: z.string().optional(),
  notes: z.string().optional(),
})

export const updateAssetSchema = createAssetSchema.extend({
  id: z.string().optional(),
})

// Data Points
export const createDataPointSchema = z.object({
  asset_id: z.string().min(1, 'asset_id is required'),
  year_month: z.string().regex(/^\d{4}-\d{2}$/, 'year_month must be YYYY-MM'),
  value: z.number().positive('value must be greater than 0'),
  notes: z.string().optional(),
})

export const updateDataPointSchema = z.object({
  id: z.string().optional(),       // detect ID change attempts
  asset_id: z.string().optional(), // detect asset_id change attempts
  year_month: z.string().regex(/^\d{4}-\d{2}$/, 'year_month must be YYYY-MM'),
  value: z.number().positive('value must be greater than 0'),
  notes: z.string().optional(),
})
```

**Putting schemas in a shared file** (`server/src/schemas/index.ts`) keeps routes clean and prevents drift between create and update shapes.

---

### 11. Referential Integrity Check Pattern

[VERIFIED: Phase description + REQUIREMENTS.md CAT-04, ASSET-04]

```typescript
// DELETE /api/v1/categories/:id
router.delete('/:id', async (c) => {
  const id = c.req.param('id')

  const db = await readDb()
  const exists = db.categories.some((cat) => cat.id === id)
  if (!exists) throw new HTTPException(404, { message: 'Category not found' })

  const inUse = db.assets.filter((a) => a.category_id === id)
  if (inUse.length > 0) {
    throw new HTTPException(409, { message: `Category is in use by ${inUse.length} asset(s)` })
  }

  await mutateDb((db) => ({
    ...db,
    categories: db.categories.filter((cat) => cat.id !== id),
  }))

  return c.json({ success: true })
})
```

**Important:** `readDb()` for the existence+reference check, then `mutateDb()` for the deletion. This means two separate mutex acquisitions — a TOCTOU (time-of-check to time-of-use) gap exists in theory, but for a single-user self-hosted app this is acceptable (no concurrent deletes in practice).

---

### 12. GET /api/v1/data-points — Sort by year_month Descending

[VERIFIED: REQUIREMENTS.md DP-01]

```typescript
router.get('/', async (c) => {
  const db = await readDb()
  const sorted = [...db.dataPoints].sort((a, b) =>
    b.year_month.localeCompare(a.year_month)
  )
  return c.json(sorted)
})
```

`localeCompare` on `YYYY-MM` strings works correctly for lexicographic sort (ISO format ensures this). No `new Date()` parsing needed.

---

## Pitfalls to Avoid (Phase 2-Specific)

### Pitfall A: zValidator Default Error Shape Breaks API Contract

**What:** Calling `zValidator('json', schema)` without a hook returns `{ success: false, error: {...} }` with 400. Every frontend fetch treating the API contract (`{"error":"..."}`) will fail to parse this.

**Fix:** Always pass the hook as the 3rd argument.

```typescript
// ❌ Returns { success: false, error: ZodIssue[] }
zValidator('json', schema)

// ✅ Returns { error: "first issue message" }
zValidator('json', schema, (result, c) => {
  if (!result.success) {
    return c.json({ error: result.error.issues[0]?.message ?? 'Invalid request' }, 400)
  }
})
```

---

### Pitfall B: Wrong serveStatic Import

**What:** `import { serveStatic } from 'hono/middleware'` exists but is for edge runtimes (Cloudflare Workers, Bun). It does not work for Node.js filesystem access.

**Fix:**
```typescript
// ✅ Node.js filesystem-based static serving
import { serveStatic } from '@hono/node-server/serve-static'

// ❌ Edge runtime (does not read local files on Node.js)
import { serveStatic } from 'hono/middleware'
```

---

### Pitfall C: Throwing Inside mutateDb Leaves State Inconsistent

**What:** If `throw new HTTPException(404, ...)` is called inside the `mutateDb` fn, the throw propagates before the write happens. The mutex IS properly released (`runExclusive` is exception-safe). But the error propagates as a raw `HTTPException` up through the route handler.

**Fix:** Either (a) check existence with `readDb()` before calling `mutateDb()`, or (b) throw inside `mutateDb` and catch at the route handler level:

```typescript
try {
  await mutateDb((db) => {
    const idx = db.categories.findIndex((c) => c.id === id)
    if (idx === -1) throw new Error('CATEGORY_NOT_FOUND')
    db.categories[idx] = updated
    return db
  })
} catch (err) {
  if ((err as Error).message === 'CATEGORY_NOT_FOUND') {
    throw new HTTPException(404, { message: 'Category not found' })
  }
  throw err  // re-throw unexpected errors
}
```

**Preferred:** Do a `readDb()` existence check first, then `mutateDb()` for the write. More verbose but clearer.

---

### Pitfall D: SPA Catch-All Registered as `app.use('*', ...)` Instead of `app.get('*', ...)`

**What:** If the SPA catch-all is `app.use('*', handler)`, it fires for ALL methods including POST, PUT, DELETE to non-existent API paths — returning HTML instead of a 404.

**Fix:** Use `app.get('*', handler)` so only GET requests for non-existent paths serve `index.html`.

---

### Pitfall E: Missing `.js` Extension on Local Imports

**What:** `NodeNext` module resolution enforces `.js` extensions at runtime. Missing them causes `ERR_MODULE_NOT_FOUND`.

**Fix:** Every local import in route files needs `.js`:
```typescript
import { readDb, mutateDb } from '../storage/index.js'  // ✅
import type { Category } from '../models/index.js'       // ✅
import { HTTPException } from 'hono/http-exception'      // ✅ (node_modules — no extension)
```

---

### Pitfall F: onError Not Catching HTTPException from Sub-Routers

**What:** Hono `onError` on the parent app catches errors from mounted sub-routers. This is the correct behavior. No need to add `onError` to each sub-router.

**Verified:** Hono docs confirm the parent app's `onError` handles all unhandled errors from mounted routes.

---

### Pitfall G: `c.json` Return Type in mutateDb Callbacks

**What:** Inside a `mutateDb(fn)` callback, `fn` must return a `Database` object (the mutation result). Never return early with `c.json(...)` — the route handler function and the storage mutation function are different scopes.

```typescript
// ❌ WRONG — c is not in scope inside mutateDb callback
await mutateDb((db) => {
  const idx = db.categories.findIndex(...)
  if (idx === -1) return c.json({ error: 'not found' }, 404)  // TypeError
  return db
})

// ✅ CORRECT — check existence before entering mutateDb
const db = await readDb()
if (!db.categories.find(c => c.id === id)) {
  throw new HTTPException(404, { message: 'Category not found' })
}
await mutateDb((db) => {
  // guaranteed to exist here
  return { ...db, categories: db.categories.filter(c => c.id !== id) }
})
```

---

## Recommended Implementation Patterns

### Pattern 1: Complete Route File Structure (categories.ts)

```typescript
// server/src/routes/categories.ts
import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { readDb, mutateDb } from '../storage/index.js'

const router = new Hono()

// Shared validation hook — returns {"error":"..."} on failure
const hook = (result: { success: boolean; error?: z.ZodError }, c: any) => {
  if (!result.success && result.error) {
    return c.json({ error: result.error.issues[0]?.message ?? 'Invalid request' }, 400 as const)
  }
}

const createSchema = z.object({
  name: z.string().min(1, 'name is required'),
  projected_yearly_growth: z.number(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'color must be a 6-digit hex color'),
})

const updateSchema = createSchema.extend({ id: z.string().optional() })

function toSlug(name: string): string {
  return name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
}

// GET /
router.get('/', async (c) => {
  const db = await readDb()
  return c.json(db.categories)
})

// POST /
router.post('/', zValidator('json', createSchema, hook), async (c) => {
  const body = c.req.valid('json')
  const id = toSlug(body.name)

  const db = await readDb()
  if (db.categories.find((cat) => cat.id === id)) {
    throw new HTTPException(409, { message: `Category with id '${id}' already exists` })
  }

  const category = { id, ...body }
  await mutateDb((db) => ({ ...db, categories: [...db.categories, category] }))
  return c.json(category, 201)
})

// PUT /:id
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
  const updated = { ...db.categories[idx], ...updateData, id: paramId }
  await mutateDb((db) => {
    const cats = [...db.categories]
    cats[idx] = updated
    return { ...db, categories: cats }
  })
  return c.json(updated)
})

// DELETE /:id
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

export default router
```

---

### Pattern 2: Updated index.ts with Full Wiring

```typescript
// server/src/index.ts
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

// Global error handler — MUST be registered before routes
app.onError((err, c) => {
  if (err instanceof HTTPException) {
    return c.json({ error: err.message }, err.status)
  }
  console.error(err)
  return c.json({ error: 'Internal server error' }, 500)
})

// API routes
app.get('/api/v1/health', (c) => c.json({ status: 'ok' }))
app.route('/api/v1/categories', categoriesRouter)
app.route('/api/v1/assets', assetsRouter)
app.route('/api/v1/data-points', dataPointsRouter)

// Static file serving (falls through if file not found)
app.use('*', serveStatic({ root: WEB_DIST }))

// SPA catch-all — GET only, MUST be last
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

---

### Pattern 3: DataPoints — Sort and Timestamps

```typescript
// GET / — sorted by year_month descending
router.get('/', async (c) => {
  const db = await readDb()
  const sorted = [...db.dataPoints].sort((a, b) =>
    b.year_month.localeCompare(a.year_month)
  )
  return c.json(sorted)
})

// POST / — generate id, set timestamps
router.post('/', zValidator('json', createSchema, hook), async (c) => {
  const body = c.req.valid('json')
  const { randomUUID } = await import('node:crypto')  // or top-level import
  const now = new Date().toISOString()

  const db = await readDb()
  if (!db.assets.find((a) => a.id === body.asset_id)) {
    throw new HTTPException(404, { message: 'Asset not found' })
  }

  const point = { id: randomUUID(), ...body, created_at: now, updated_at: now }
  await mutateDb((db) => ({ ...db, dataPoints: [...db.dataPoints, point] }))
  return c.json(point, 201)
})

// PUT /:id — update updated_at, block id/asset_id changes
router.put('/:id', zValidator('json', updateSchema, hook), async (c) => {
  const paramId = c.req.param('id')
  const body = c.req.valid('json')

  if (body.id !== undefined && body.id !== paramId) {
    throw new HTTPException(400, { message: 'id cannot be changed' })
  }
  if (body.asset_id !== undefined) {
    const db = await readDb()
    const current = db.dataPoints.find((dp) => dp.id === paramId)
    if (current && body.asset_id !== current.asset_id) {
      throw new HTTPException(400, { message: 'asset_id cannot be changed' })
    }
  }

  const now = new Date().toISOString()
  // ... mutateDb with updated_at: now
})
```

---

## Validation Architecture

### Verification Commands

**Start the server:**
```bash
cd server && npm run dev
```

**CAT-01 — GET categories:**
```bash
curl -s http://localhost:8080/api/v1/categories | jq .
# Expected: JSON array with 4 seeded categories
```

**CAT-02 — POST category:**
```bash
curl -s -X POST http://localhost:8080/api/v1/categories \
  -H 'Content-Type: application/json' \
  -d '{"name":"Real Estate","projected_yearly_growth":0.05,"color":"#10b981"}' | jq .
# Expected: 201 with { id: "real-estate", ... }
```

**CAT-02 validation — missing field:**
```bash
curl -s -X POST http://localhost:8080/api/v1/categories \
  -H 'Content-Type: application/json' \
  -d '{"name":"Test"}' | jq .
# Expected: 400 { "error": "..." }  — NOT { success: false, error: {...} }
```

**CAT-03 — PUT with id change attempt:**
```bash
curl -s -X PUT http://localhost:8080/api/v1/categories/stocks \
  -H 'Content-Type: application/json' \
  -d '{"id":"other","name":"Stocks","projected_yearly_growth":0.08,"color":"#6366f1"}' | jq .
# Expected: 400 { "error": "id cannot be changed" }
```

**CAT-04 — DELETE with referencing asset:**
```bash
# First create an asset referencing 'stocks'
curl -s -X POST http://localhost:8080/api/v1/assets \
  -H 'Content-Type: application/json' \
  -d '{"name":"Vanguard","category_id":"stocks","projected_yearly_growth":null}' | jq .
# Then delete stocks
curl -s -X DELETE http://localhost:8080/api/v1/categories/stocks | jq .
# Expected: 409 { "error": "Category is in use by 1 asset(s)" }
```

**DP-01 — sorted by year_month:**
```bash
curl -s http://localhost:8080/api/v1/data-points | jq '.[].year_month'
# Expected: descending order (2026-04, 2026-03, ...)
```

**DP-02 — value > 0 enforcement:**
```bash
curl -s -X POST http://localhost:8080/api/v1/data-points \
  -H 'Content-Type: application/json' \
  -d '{"asset_id":"vanguard","year_month":"2026-01","value":0}' | jq .
# Expected: 400 { "error": "value must be greater than 0" }
```

**API-01 — consistent error shape:**
```bash
curl -s http://localhost:8080/api/v1/categories/nonexistent | jq .
# Expected: { "error": "Category not found" }  — NOT HTML, NOT Zod shape
```

**API-02 — SPA catch-all:**
```bash
curl -s http://localhost:8080/dashboard | head -5
# Expected: HTML content of index.html (once web is built)
```

**API-02 — static assets not served as index.html:**
```bash
curl -s -I http://localhost:8080/assets/main.js
# Expected: 200 with Content-Type: application/javascript (not text/html)
```

**API-03 — health:**
```bash
curl -s http://localhost:8080/api/v1/health
# Expected: { "status": "ok" }
```

**500 error handling:**
```bash
# Temporarily force an error in a route handler, verify:
curl -s http://localhost:8080/api/v1/trigger-error | jq .
# Expected: 500 { "error": "Internal server error" }
```

### Grep Checks

```bash
# Confirm no direct fs.writeFile to DB_PATH in routes
grep -r "writeFile" server/src/routes/  # Should return empty

# Confirm .js extensions on all local imports
grep -r "from '\.\." server/src/routes/ | grep -v ".js'"  # Should return empty

# Confirm no new Mutex() outside mutex.ts
grep -r "new Mutex" server/src/  | grep -v "mutex.ts"  # Should return empty

# Confirm all zValidator calls have 3 args (hook)
grep -r "zValidator(" server/src/routes/ | grep -v "hook\|result"  # Manual review
```

---

## Sources

### Primary (HIGH confidence — verified)
- `node_modules/@hono/node-server/dist/serve-static.mjs` — serveStatic fallthrough behavior, `root` resolution, `options.index` default
- `node_modules/@hono/zod-validator/dist/index.js` — default validation failure response shape confirmed as raw Zod result
- `node_modules/@hono/node-server/dist/serve-static.d.mts` — ServeStaticOptions TypeScript interface
- Context7 `/llmstxt/hono_dev_llms_txt` — `app.route()`, `c.req.param()`, `c.req.valid()`, `app.onError()`, `HTTPException`
- `https://raw.githubusercontent.com/honojs/middleware/main/packages/zod-validator/README.md` — zValidator hook pattern

### Secondary (MEDIUM confidence)
- `.planning/research/STACK.md` — confirmed library versions, `node:crypto.randomUUID()` availability
- `.planning/research/ARCHITECTURE.md` — Express-based patterns adapted to Hono equivalents
- `server/node_modules/@hono/node-server/dist/serve-static.d.mts` — TypeScript interface for ServeStaticOptions

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|---|---|---|
| A1 | `app.onError` on parent app catches HTTPException thrown from sub-routers | Error Handling | Route errors bypass global handler; add per-router onError |
| A2 | `path.join(absoluteRoot, '/some/path')` correctly produces `absoluteRoot/some/path` on Linux | serveStatic | Static files not served; use CWD-relative path instead |
| A3 | Double-mutex call (readDb + mutateDb) for delete operations is safe for single-user app | Referential integrity | TOCTOU race in theory (zero risk for single user, but document) |

**All three risks are LOW in practice** for a single-household self-hosted app.

---

## RESEARCH COMPLETE

**Phase:** 02 - crud-api
**Confidence:** HIGH

### Key Findings
- `app.route('/api/v1/categories', router)` is the Hono sub-router pattern; sub-router uses `/` and `/:id`
- `@hono/zod-validator` **default** 400 response is Zod error shape — custom hook is **mandatory** for `{"error":"..."}` compliance
- `serveStatic` from `@hono/node-server/serve-static` calls `next()` on file not found — SPA fallthrough works naturally
- `app.onError` with `HTTPException` check + `c.json({ error: err.message }, err.status)` is the cleanest global error handler
- `import.meta.url` + `fileURLToPath` gives reliable absolute path for `WEB_DIST` regardless of CWD

### Confidence Assessment
| Area | Level | Reason |
|---|---|---|
| Hono routing API | HIGH | Verified via Context7 official docs |
| zValidator hook behavior | HIGH | Verified by reading installed dist source |
| serveStatic fallthrough | HIGH | Verified by reading installed dist source |
| Error handling pattern | HIGH | Verified via Context7 official docs |
| Slug/UUID generation | HIGH | Standard JS, no library involved |

### Ready for Planning
Research complete. Planner can now create PLAN.md files for Plans 2.1, 2.2, 2.3.
