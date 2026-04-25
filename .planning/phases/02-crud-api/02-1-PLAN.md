---
phase: 02-crud-api
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - server/src/routes/categories.ts
  - server/src/routes/assets.ts
autonomous: true
requirements:
  - CAT-01
  - CAT-02
  - CAT-03
  - CAT-04
  - ASSET-01
  - ASSET-02
  - ASSET-03
  - ASSET-04

must_haves:
  truths:
    - "GET /api/v1/categories returns the full db.categories array as JSON"
    - "POST /api/v1/categories generates id as slug (lowercase, spaces to hyphens, strip non-alphanumeric)"
    - "POST /api/v1/categories returns 400 {error:...} when fields are missing — NOT raw Zod SafeParseResult shape"
    - "PUT /api/v1/categories/:id returns 400 {error: id cannot be changed} when body.id differs from :id param"
    - "DELETE /api/v1/categories/:id returns 409 {error: Category is in use by N asset(s)} when assets reference it"
    - "GET /api/v1/assets returns the full db.assets array as JSON"
    - "POST /api/v1/assets validates category_id exists; returns 404 when category does not exist"
    - "POST /api/v1/assets sets created_at = new Date().toISOString() server-side (immutable after create)"
    - "PUT /api/v1/assets/:id returns 400 {error: id cannot be changed} when body.id differs from :id param"
    - "DELETE /api/v1/assets/:id returns 409 {error: Asset is in use by N data point(s)} when data points reference it"
  artifacts:
    - path: "server/src/routes/categories.ts"
      provides: "Category CRUD route handlers (GET/POST/PUT/DELETE)"
      exports: ["default router"]
    - path: "server/src/routes/assets.ts"
      provides: "Asset CRUD route handlers (GET/POST/PUT/DELETE)"
      exports: ["default router"]
  key_links:
    - from: "server/src/routes/categories.ts"
      to: "server/src/storage/index.ts"
      via: "readDb() for reads/integrity checks, mutateDb() for writes only"
      pattern: "readDb|mutateDb"
    - from: "server/src/routes/assets.ts"
      to: "server/src/storage/index.ts"
      via: "readDb() for reads/integrity checks, mutateDb() for writes only"
      pattern: "readDb|mutateDb"
---

<objective>
Create two Hono sub-router files implementing full CRUD for the Categories and Assets resources.

Purpose: These route handlers are the foundation for the Admin Panel (Phase 6) and the financial data model. Without them, no assets can be tracked.
Output: `server/src/routes/categories.ts` and `server/src/routes/assets.ts`, each exporting a default Hono router, ready to be mounted in `server/src/index.ts` (Plan 2.3).
</objective>

<execution_context>
@.github/get-shit-done/workflows/execute-plan.md
@.github/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/REQUIREMENTS.md
@.planning/phases/02-crud-api/02-RESEARCH.md
@.planning/phases/01-data-foundation/01-CONTEXT.md

<interfaces>
<!-- Extracted from server/src/models/index.ts — exact field names and types -->
```typescript
export interface Category {
  id: string                       // URL-safe slug, immutable after create (MODEL-01)
  name: string
  projected_yearly_growth: number  // decimal, e.g. 0.08 = 8% annual growth
  color: string                    // hex color, e.g. '#6366f1'
}

export interface Asset {
  id: string                               // URL-safe slug, immutable after create (MODEL-02)
  name: string
  category_id: string
  projected_yearly_growth: number | null   // null = inherit from parent Category
  location?: string
  notes?: string
  created_at: string                       // ISO 8601 timestamp, immutable after create
}

export interface Database {
  categories: Category[]
  assets: Asset[]
  dataPoints: DataPoint[]
}
```

<!-- Extracted from server/src/storage/index.ts -->
```typescript
// Import path: '../storage/index.js'  (NodeNext requires .js extension)
export async function readDb(): Promise<Database>
export async function mutateDb(fn: (db: Database) => Database): Promise<void>
```
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create server/src/routes/categories.ts</name>
  <files>server/src/routes/categories.ts</files>

  <read_first>
    - server/src/storage/index.ts — verify import path and readDb/mutateDb signatures
    - server/src/models/index.ts — Category interface exact field names
    - .planning/phases/02-crud-api/02-RESEARCH.md — Section "Pattern 1" (complete categories.ts, ~lines 532-625), Section 2 (zValidator hook), Section 9 (ID immutability), Section 11 (referential integrity pattern)
  </read_first>

  <action>
Create `server/src/routes/categories.ts`. The file does not yet exist — create it from scratch.

CRITICAL constraints that MUST be satisfied:
1. All local imports use `.js` extension (NodeNext requirement)
2. The `zValidator` hook (3rd argument) MUST be passed — default behavior returns raw Zod shape, not {"error":"..."} shape
3. Do NOT throw HTTPException inside the mutateDb callback — call readDb() first for existence checks, then mutateDb() for the write only
4. `toSlug` function: lowercase → replace whitespace with hyphens → strip all non-alphanumeric-hyphen characters

Write this exact file:

```typescript
import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { readDb, mutateDb } from '../storage/index.js'
import type { Category } from '../models/index.js'

const router = new Hono()

// MANDATORY: pass hook as 3rd arg — default returns { success: false, error: ZodIssue[] }
// which does NOT match the required {"error":"..."} API contract (API-01).
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

// id is optional here only to detect change attempts in PUT — not required on create
const updateSchema = createSchema.extend({ id: z.string().optional() })

// MODEL-01: id is a URL-safe slug derived from name
function toSlug(name: string): string {
  return name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
}

// CAT-01: GET all categories
router.get('/', async (c) => {
  const db = await readDb()
  return c.json(db.categories)
})

// CAT-02: POST — validate, generate slug id, persist
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

// CAT-03: PUT — full update; reject id change attempts
router.put('/:id', zValidator('json', updateSchema, hook), async (c) => {
  const paramId = c.req.param('id')
  const body = c.req.valid('json')

  if (body.id !== undefined && body.id !== paramId) {
    throw new HTTPException(400, { message: 'id cannot be changed' })
  }

  const db = await readDb()
  const idx = db.categories.findIndex((cat) => cat.id === paramId)
  if (idx === -1) throw new HTTPException(404, { message: 'Category not found' })

  // Destructure _id out so updateData never contains id (noUnusedLocals: _ prefix is exempt)
  const { id: _id, ...updateData } = body
  const updated: Category = { ...db.categories[idx], ...updateData, id: paramId }
  await mutateDb((db) => {
    const cats = [...db.categories]
    cats[idx] = updated
    return { ...db, categories: cats }
  })
  return c.json(updated)
})

// CAT-04: DELETE — reject if any asset uses this category
router.delete('/:id', async (c) => {
  const id = c.req.param('id')

  // readDb() first for checks, then mutateDb() for the write only (never throw inside mutateDb fn)
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
  </action>

  <verify>
    <automated>grep -n "from '\.\." server/src/routes/categories.ts | grep -v "\.js'" && echo "FAIL: missing .js extension" || echo "OK: all local imports have .js extension"</automated>
    <automated>grep -c "zValidator('json'" server/src/routes/categories.ts && grep -c "hook)" server/src/routes/categories.ts</automated>
  </verify>

  <acceptance_criteria>
    - File exists at server/src/routes/categories.ts
    - grep "export default router" server/src/routes/categories.ts returns a match
    - grep "from '../storage/index.js'" server/src/routes/categories.ts returns a match (not '../storage/index')
    - grep "from '../models/index.js'" server/src/routes/categories.ts returns a match
    - grep "zValidator('json', createSchema, hook)" server/src/routes/categories.ts returns a match
    - grep "zValidator('json', updateSchema, hook)" server/src/routes/categories.ts returns a match
    - grep "toSlug" server/src/routes/categories.ts returns at least 2 matches (definition + usage)
    - grep "body.id !== paramId" server/src/routes/categories.ts returns a match (CAT-03 id change check)
    - grep "Category is in use by" server/src/routes/categories.ts returns a match (CAT-04 conflict message)
    - grep "inUse.length" server/src/routes/categories.ts returns a match (count used in 409 message)
    - cd server && npx tsc --noEmit exits 0 (no TypeScript errors)
  </acceptance_criteria>
</task>

<task type="auto">
  <name>Task 2: Create server/src/routes/assets.ts</name>
  <files>server/src/routes/assets.ts</files>

  <read_first>
    - server/src/routes/categories.ts — just created; mirror the same hook, import, and error-handling patterns
    - server/src/models/index.ts — Asset interface exact field names (especially projected_yearly_growth: number | null, created_at: string)
    - .planning/phases/02-crud-api/02-RESEARCH.md — Section 8 (slug generation), Section 9 (ID immutability), Section 11 (referential integrity pattern)
  </read_first>

  <action>
Create `server/src/routes/assets.ts`. The file does not yet exist — create it from scratch.

KEY differences from categories.ts:
1. POST validates that `body.category_id` exists in `db.categories` (return 404 if not found)
2. POST sets `created_at = new Date().toISOString()` — this is the ONLY server-set timestamp for assets; it is NEVER updated on PUT
3. PUT must preserve the original `created_at` from the existing record (spread existing record first, then updateData, then force `id: paramId`)
4. DELETE checks `db.dataPoints` (not `db.assets`) for references
5. `projected_yearly_growth` is `z.number().nullable()` (null means inherit from category)

Write this exact file:

```typescript
import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { readDb, mutateDb } from '../storage/index.js'
import type { Asset } from '../models/index.js'

const router = new Hono()

// MANDATORY hook — returns {"error":"..."} on failure (API-01 compliance)
const hook = (result: { success: boolean; error?: z.ZodError }, c: any) => {
  if (!result.success && result.error) {
    return c.json({ error: result.error.issues[0]?.message ?? 'Invalid request' }, 400 as const)
  }
}

const createSchema = z.object({
  name: z.string().min(1, 'name is required'),
  category_id: z.string().min(1, 'category_id is required'),
  projected_yearly_growth: z.number().nullable(),
  location: z.string().optional(),
  notes: z.string().optional(),
})

// id optional only to detect change attempts in PUT
const updateSchema = createSchema.extend({ id: z.string().optional() })

// MODEL-02: id is a URL-safe slug derived from name
function toSlug(name: string): string {
  return name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
}

// ASSET-01: GET all assets
router.get('/', async (c) => {
  const db = await readDb()
  return c.json(db.assets)
})

// ASSET-02: POST — validate category_id exists, generate slug id, set created_at
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

  // created_at is server-set and immutable (MODEL-02)
  const asset: Asset = { id, ...body, created_at: new Date().toISOString() }
  await mutateDb((db) => ({ ...db, assets: [...db.assets, asset] }))
  return c.json(asset, 201)
})

// ASSET-03: PUT — full update; reject id changes; preserve created_at
router.put('/:id', zValidator('json', updateSchema, hook), async (c) => {
  const paramId = c.req.param('id')
  const body = c.req.valid('json')

  if (body.id !== undefined && body.id !== paramId) {
    throw new HTTPException(400, { message: 'id cannot be changed' })
  }

  const db = await readDb()
  const idx = db.assets.findIndex((a) => a.id === paramId)
  if (idx === -1) throw new HTTPException(404, { message: 'Asset not found' })

  // Destructure _id out so updateData never re-applies id (noUnusedLocals: _ prefix is exempt)
  const { id: _id, ...updateData } = body
  // Spread existing first (preserves created_at), then updateData, then force id: paramId
  const updated: Asset = { ...db.assets[idx], ...updateData, id: paramId }
  await mutateDb((db) => {
    const assets = [...db.assets]
    assets[idx] = updated
    return { ...db, assets }
  })
  return c.json(updated)
})

// ASSET-04: DELETE — reject if any data point references this asset
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

export default router
```
  </action>

  <verify>
    <automated>grep -n "from '\.\." server/src/routes/assets.ts | grep -v "\.js'" && echo "FAIL: missing .js extension" || echo "OK: all local imports have .js extension"</automated>
    <automated>cd server && npx tsc --noEmit 2>&1 | head -20</automated>
  </verify>

  <acceptance_criteria>
    - File exists at server/src/routes/assets.ts
    - grep "export default router" server/src/routes/assets.ts returns a match
    - grep "from '../storage/index.js'" server/src/routes/assets.ts returns a match
    - grep "from '../models/index.js'" server/src/routes/assets.ts returns a match
    - grep "zValidator('json', createSchema, hook)" server/src/routes/assets.ts returns a match
    - grep "zValidator('json', updateSchema, hook)" server/src/routes/assets.ts returns a match
    - grep "category_id" server/src/routes/assets.ts returns matches in both schema AND the existence check (ASSET-02)
    - grep "Category not found" server/src/routes/assets.ts returns a match (ASSET-02 validation)
    - grep "created_at: new Date().toISOString()" server/src/routes/assets.ts returns a match (MODEL-02 server-set timestamp)
    - grep "id cannot be changed" server/src/routes/assets.ts returns a match (ASSET-03)
    - grep "Asset is in use by" server/src/routes/assets.ts returns a match (ASSET-04 conflict message)
    - grep "dp.asset_id === id" server/src/routes/assets.ts returns a match (ASSET-04 checks dataPoints)
    - cd server && npx tsc --noEmit exits 0 (no TypeScript errors in routes/categories.ts AND routes/assets.ts)
  </acceptance_criteria>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| HTTP client → Hono route handler | All request bodies are untrusted; JSON parsed and Zod-validated before handler logic |
| Route handler → Storage layer | Trusted internal call; readDb/mutateDb are the only permitted storage interface |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-02-01 | Tampering | PUT /categories/:id, PUT /assets/:id | mitigate | Check `body.id !== undefined && body.id !== paramId` before mutateDb; force `id: paramId` in the updated object |
| T-02-02 | Tampering | POST /assets body.category_id | mitigate | readDb() then `db.categories.find(cat => cat.id === body.category_id)` before accepting the asset |
| T-02-03 | Tampering | POST /categories color field | mitigate | Zod regex `/^#[0-9a-fA-F]{6}$/` rejects non-hex strings |
| T-02-04 | Tampering | zValidator default error shape | mitigate | Hook passed as 3rd arg to zValidator — returns `{error:"..."}` not raw Zod result |
| T-02-05 | Denial of Service | DELETE /categories/:id with referencing assets | mitigate | 409 response with count prevents orphaned asset records |
| T-02-06 | Denial of Service | DELETE /assets/:id with referencing data points | mitigate | 409 response with count prevents orphaned data point records |
| T-02-07 | Information Disclosure | Zod validation error messages | accept | Messages expose only field names (e.g. "name is required") — no sensitive data |
| T-02-08 | Tampering | created_at field in PUT /assets body | accept | PUT schema includes created_at indirectly via spread; however `...db.assets[idx]` is spread FIRST so it is preserved; body cannot override server-set timestamps because the final object always uses the DB value |
</threat_model>

<verification>
After both tasks complete, run:

```bash
# TypeScript clean — no errors in either route file
cd server && npx tsc --noEmit

# Start server in background for smoke tests
cd server && npm run dev &
sleep 3

# CAT-01 — GET categories (returns seeded array)
curl -s http://localhost:8080/api/v1/categories | jq 'length'
# Expected: 4 (seeded categories)

# CAT-02 — POST with validation failure (missing projected_yearly_growth)
curl -s -X POST http://localhost:8080/api/v1/categories \
  -H 'Content-Type: application/json' \
  -d '{"name":"Test"}' | jq .
# Expected: {"error":"..."} — NOT {"success":false,"error":{...}}

# CAT-02 — POST success
curl -s -X POST http://localhost:8080/api/v1/categories \
  -H 'Content-Type: application/json' \
  -d '{"name":"My Fund","projected_yearly_growth":0.07,"color":"#ff0000"}' | jq .id
# Expected: "my-fund"

# CAT-03 — PUT id change rejection
curl -s -X PUT http://localhost:8080/api/v1/categories/stocks \
  -H 'Content-Type: application/json' \
  -d '{"id":"other","name":"Stocks","projected_yearly_growth":0.08,"color":"#6366f1"}' | jq .
# Expected: {"error":"id cannot be changed"}

# CAT-04 — DELETE with asset in use (create asset first)
curl -s -X POST http://localhost:8080/api/v1/assets \
  -H 'Content-Type: application/json' \
  -d '{"name":"Vanguard","category_id":"stocks","projected_yearly_growth":null}' | jq .
curl -s -X DELETE http://localhost:8080/api/v1/categories/stocks | jq .
# Expected: {"error":"Category is in use by 1 asset(s)"}

# ASSET-02 — POST with non-existent category_id
curl -s -X POST http://localhost:8080/api/v1/assets \
  -H 'Content-Type: application/json' \
  -d '{"name":"Test","category_id":"nonexistent","projected_yearly_growth":null}' | jq .
# Expected: {"error":"Category not found"}
```
</verification>

<success_criteria>
- server/src/routes/categories.ts and server/src/routes/assets.ts both exist
- `cd server && npx tsc --noEmit` exits 0
- All zValidator calls pass the hook as 3rd argument (grep confirms)
- All local imports use `.js` extension (grep confirms no bare local imports)
- PUT handlers reject id changes with 400
- DELETE handlers check referential integrity and return 409 with count
- POST /assets validates category_id existence before creating asset
</success_criteria>

<output>
After completion, create `.planning/phases/02-crud-api/02-1-SUMMARY.md`
</output>
