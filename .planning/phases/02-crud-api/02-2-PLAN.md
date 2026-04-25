---
phase: 02-crud-api
plan: 02
type: execute
wave: 1
depends_on: []
files_modified:
  - server/src/routes/dataPoints.ts
autonomous: true
requirements:
  - DP-01
  - DP-02
  - DP-03
  - DP-04

must_haves:
  truths:
    - "GET /api/v1/data-points returns all data points sorted by year_month descending"
    - "POST /api/v1/data-points generates a UUID v4 id via crypto.randomUUID()"
    - "POST /api/v1/data-points sets created_at and updated_at to new Date().toISOString()"
    - "POST /api/v1/data-points validates asset_id exists; returns 404 when asset does not exist"
    - "POST /api/v1/data-points returns 400 when value is 0 or negative"
    - "POST /api/v1/data-points returns 400 when year_month format is not YYYY-MM"
    - "PUT /api/v1/data-points/:id updates updated_at to new Date().toISOString()"
    - "PUT /api/v1/data-points/:id returns 400 {error: id cannot be changed} when body.id differs from :id param"
    - "PUT /api/v1/data-points/:id returns 400 {error: asset_id cannot be changed} when body.asset_id differs from current"
    - "DELETE /api/v1/data-points/:id deletes the record with no referential integrity restrictions"
  artifacts:
    - path: "server/src/routes/dataPoints.ts"
      provides: "DataPoint CRUD route handlers (GET/POST/PUT/DELETE)"
      exports: ["default router"]
  key_links:
    - from: "server/src/routes/dataPoints.ts"
      to: "server/src/storage/index.ts"
      via: "readDb() for reads/checks, mutateDb() for writes only"
      pattern: "readDb|mutateDb"
    - from: "server/src/routes/dataPoints.ts"
      to: "node:crypto"
      via: "import { randomUUID } from 'node:crypto' — NOT a global in ESM"
      pattern: "randomUUID"
---

<objective>
Create the Hono sub-router file implementing full CRUD for the DataPoints resource.

Purpose: Data points are the core financial records — every tracked value for every asset for every month. The GET sorted-descending requirement and the asset_id immutability rule are the key constraints.
Output: `server/src/routes/dataPoints.ts` exporting a default Hono router, ready to be mounted in `server/src/index.ts` (Plan 2.3). Runs in Wave 1 parallel with Plan 2.1.
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
<!-- Extracted from server/src/models/index.ts -->
```typescript
export interface DataPoint {
  id: string        // UUID v4 via crypto.randomUUID() (MODEL-03)
  asset_id: string
  // YYYY-MM — ALWAYS provided by the frontend client (decisions D-02, D-03).
  // NEVER compute this server-side with toISOString() — UTC shift corrupts month keys for UTC+ users.
  year_month: string
  value: number     // EUR amount as float64
  notes?: string
  created_at: string
  updated_at: string
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
  <name>Task 1: Create server/src/routes/dataPoints.ts</name>
  <files>server/src/routes/dataPoints.ts</files>

  <read_first>
    - server/src/storage/index.ts — verify import path and readDb/mutateDb signatures
    - server/src/models/index.ts — DataPoint interface exact field names and types
    - server/src/routes/categories.ts — mirror the same hook, import, and error-handling patterns already established
    - .planning/phases/02-crud-api/02-RESEARCH.md — Section 7 (node:crypto randomUUID), Section 10 (Zod schemas for DataPoints), Section 12 (GET sort pattern), Pattern 3 (DataPoints sort and timestamps), Pitfall A (zValidator hook), Pitfall C (no throw inside mutateDb)
    - .planning/phases/01-data-foundation/01-CONTEXT.md — Decisions D-02/D-03: year_month is ALWAYS client-provided, NEVER server-computed
  </read_first>

  <action>
Create `server/src/routes/dataPoints.ts`. The file does not yet exist — create it from scratch.

CRITICAL constraints that MUST be satisfied:
1. All local imports use `.js` extension (NodeNext requirement)
2. `randomUUID` MUST be imported: `import { randomUUID } from 'node:crypto'` — it is NOT a global in ESM
3. NEVER use `new Date().toISOString().slice(0, 7)` for year_month — it is always client-provided (D-02, D-03)
4. GET handler sorts by year_month descending using `.localeCompare()` — YYYY-MM strings sort correctly lexicographically
5. zValidator hook (3rd argument) MUST be passed — same pattern as categories.ts and assets.ts
6. PUT blocks both `id` changes AND `asset_id` changes
7. PUT updates `updated_at` to current timestamp; `created_at` is preserved from existing record
8. DELETE has NO referential integrity check — delete unconditionally if record exists
9. Do NOT throw HTTPException inside the mutateDb callback — check existence with readDb() first

Write this exact file:

```typescript
import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { randomUUID } from 'node:crypto'
import { readDb, mutateDb } from '../storage/index.js'
import type { DataPoint } from '../models/index.js'

const router = new Hono()

// MANDATORY hook — returns {"error":"..."} on failure (API-01 compliance)
const hook = (result: { success: boolean; error?: z.ZodError }, c: any) => {
  if (!result.success && result.error) {
    return c.json({ error: result.error.issues[0]?.message ?? 'Invalid request' }, 400 as const)
  }
}

const createSchema = z.object({
  asset_id: z.string().min(1, 'asset_id is required'),
  // D-02/D-03: year_month is always provided by the client — validated format only, never server-computed
  year_month: z.string().regex(/^\d{4}-\d{2}$/, 'year_month must be YYYY-MM'),
  value: z.number().positive('value must be greater than 0'),
  notes: z.string().optional(),
})

const updateSchema = z.object({
  id: z.string().optional(),       // included only to detect and reject id change attempts
  asset_id: z.string().optional(), // included only to detect and reject asset_id change attempts
  year_month: z.string().regex(/^\d{4}-\d{2}$/, 'year_month must be YYYY-MM'),
  value: z.number().positive('value must be greater than 0'),
  notes: z.string().optional(),
})

// DP-01: GET all data points sorted by year_month descending
// localeCompare on YYYY-MM strings is correct — ISO format ensures lexicographic = chronological
router.get('/', async (c) => {
  const db = await readDb()
  const sorted = [...db.dataPoints].sort((a, b) =>
    b.year_month.localeCompare(a.year_month)
  )
  return c.json(sorted)
})

// DP-02: POST — validate asset_id exists, generate UUID id, set both timestamps
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

// DP-03: PUT — update year_month/value/notes; refresh updated_at; block id and asset_id changes
router.put('/:id', zValidator('json', updateSchema, hook), async (c) => {
  const paramId = c.req.param('id')
  const body = c.req.valid('json')

  if (body.id !== undefined && body.id !== paramId) {
    throw new HTTPException(400, { message: 'id cannot be changed' })
  }

  const db = await readDb()
  const idx = db.dataPoints.findIndex((dp) => dp.id === paramId)
  if (idx === -1) throw new HTTPException(404, { message: 'Data point not found' })

  if (body.asset_id !== undefined && body.asset_id !== db.dataPoints[idx].asset_id) {
    throw new HTTPException(400, { message: 'asset_id cannot be changed' })
  }

  // Destructure immutable fields out so they are never overridden from body
  // _ prefix exempts variables from noUnusedLocals
  const { id: _id, asset_id: _assetId, ...updateFields } = body
  const updated: DataPoint = {
    ...db.dataPoints[idx],  // preserves id, asset_id, created_at
    ...updateFields,         // applies year_month, value, notes from body
    id: paramId,             // force correct id
    asset_id: db.dataPoints[idx].asset_id,  // preserve immutable asset_id
    updated_at: new Date().toISOString(),   // always refresh on PUT
  }
  await mutateDb((db) => {
    const points = [...db.dataPoints]
    points[idx] = updated
    return { ...db, dataPoints: points }
  })
  return c.json(updated)
})

// DP-04: DELETE — no referential integrity check, delete unconditionally
router.delete('/:id', async (c) => {
  const id = c.req.param('id')

  const db = await readDb()
  if (!db.dataPoints.find((dp) => dp.id === id)) {
    throw new HTTPException(404, { message: 'Data point not found' })
  }

  await mutateDb((db) => ({ ...db, dataPoints: db.dataPoints.filter((dp) => dp.id !== id) }))
  return c.json({ success: true })
})

export default router
```
  </action>

  <verify>
    <automated>grep -n "from '\.\." server/src/routes/dataPoints.ts | grep -v "\.js'" && echo "FAIL: missing .js extension" || echo "OK: all local imports have .js extension"</automated>
    <automated>cd server && npx tsc --noEmit 2>&1 | head -30</automated>
  </verify>

  <acceptance_criteria>
    - File exists at server/src/routes/dataPoints.ts
    - grep "export default router" server/src/routes/dataPoints.ts returns a match
    - grep "from 'node:crypto'" server/src/routes/dataPoints.ts returns a match (randomUUID import)
    - grep "from '../storage/index.js'" server/src/routes/dataPoints.ts returns a match
    - grep "from '../models/index.js'" server/src/routes/dataPoints.ts returns a match
    - grep "zValidator('json', createSchema, hook)" server/src/routes/dataPoints.ts returns a match
    - grep "zValidator('json', updateSchema, hook)" server/src/routes/dataPoints.ts returns a match
    - grep "localeCompare" server/src/routes/dataPoints.ts returns a match (DP-01 sort)
    - grep "b.year_month.localeCompare(a.year_month)" server/src/routes/dataPoints.ts returns a match (descending order: b before a)
    - grep "randomUUID()" server/src/routes/dataPoints.ts returns a match (DP-02 id generation)
    - grep "created_at: now" server/src/routes/dataPoints.ts returns a match (DP-02 timestamp)
    - grep "updated_at: now" server/src/routes/dataPoints.ts returns a match (DP-02 timestamp)
    - grep "id cannot be changed" server/src/routes/dataPoints.ts returns a match (DP-03)
    - grep "asset_id cannot be changed" server/src/routes/dataPoints.ts returns a match (DP-03)
    - grep "updated_at: new Date().toISOString()" server/src/routes/dataPoints.ts returns a match (DP-03 refresh)
    - grep "toISOString().slice(0, 7)" server/src/routes/dataPoints.ts returns NO match (D-02/D-03 compliance)
    - cd server && npx tsc --noEmit exits 0 (no TypeScript errors across all three route files)
  </acceptance_criteria>
</task>

<task type="auto">
  <name>Task 2: Smoke-test route files compile and export correctly</name>
  <files></files>

  <read_first>
    - server/src/routes/categories.ts — just created in Plan 2.1
    - server/src/routes/assets.ts — just created in Plan 2.1
    - server/src/routes/dataPoints.ts — just created in Task 1 above
  </read_first>

  <action>
Run verification checks to confirm all three route files are TypeScript-valid and structurally correct before Plan 2.3 wires them into index.ts.

Run the following checks in sequence:

1. TypeScript compilation:
```bash
cd server && npx tsc --noEmit
```
Expected: exits 0 with no output. If errors appear, fix them before proceeding.

2. Confirm all local imports have .js extension:
```bash
grep -rn "from '\.\." server/src/routes/ | grep -v "\.js'"
```
Expected: no output (empty — all imports have .js extension).

3. Confirm no direct filesystem writes in route handlers (all writes go through mutateDb):
```bash
grep -rn "writeFile\|writeFileAtomic\|dbMutex" server/src/routes/
```
Expected: no output (empty — routes never touch storage directly).

4. Confirm all three route files export a default router:
```bash
grep -l "export default router" server/src/routes/
```
Expected: lists categories.ts, assets.ts, and dataPoints.ts.

5. Confirm the zValidator hook is always passed (no bare 2-argument zValidator calls):
```bash
grep -n "zValidator(" server/src/routes/*.ts
```
Expected: every line matches `zValidator('json', ..., hook)` — no line has only two arguments.

If any check fails, fix the offending file before marking this task complete.
  </action>

  <verify>
    <automated>cd server && npx tsc --noEmit && echo "TypeScript OK" || echo "TypeScript ERRORS"</automated>
    <automated>grep -rn "from '\.\." server/src/routes/ | grep -v "\.js'" | wc -l</automated>
  </verify>

  <acceptance_criteria>
    - cd server && npx tsc --noEmit exits 0
    - grep -rn "from '\.\." server/src/routes/ | grep -v "\.js'" returns 0 lines
    - grep -rn "writeFile\|writeFileAtomic\|dbMutex" server/src/routes/ returns 0 lines
    - grep -l "export default router" server/src/routes/ lists exactly 3 files
    - grep -c "zValidator(" server/src/routes/categories.ts returns 2 (one per write endpoint)
    - grep -c "zValidator(" server/src/routes/assets.ts returns 2
    - grep -c "zValidator(" server/src/routes/dataPoints.ts returns 2
  </acceptance_criteria>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| HTTP client → Hono route handler | All request bodies untrusted; Zod validates before handler logic runs |
| Route handler → Storage layer | Trusted internal call via readDb/mutateDb only |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-02-09 | Tampering | POST /data-points value field | mitigate | `z.number().positive('value must be greater than 0')` — rejects 0 and negative values |
| T-02-10 | Tampering | POST /data-points year_month format | mitigate | `z.string().regex(/^\d{4}-\d{2}$/)` — rejects malformed month keys |
| T-02-11 | Tampering | POST /data-points year_month server-computation | mitigate | year_month comes from client body only; never computed with toISOString() (D-02/D-03) |
| T-02-12 | Tampering | PUT /data-points/:id id change | mitigate | Explicit check `body.id !== paramId` before mutateDb; force `id: paramId` in updated object |
| T-02-13 | Tampering | PUT /data-points/:id asset_id change | mitigate | Explicit check `body.asset_id !== db.dataPoints[idx].asset_id`; force original asset_id in updated object |
| T-02-14 | Spoofing | POST id collision via client-provided id | accept | id is server-generated via randomUUID() — client cannot influence it (id not in createSchema) |
| T-02-15 | Information Disclosure | Zod validation messages | accept | Messages expose field names only (e.g. "year_month must be YYYY-MM") — no sensitive data |
</threat_model>

<verification>
After both tasks complete, run:

```bash
# TypeScript clean across all route files
cd server && npx tsc --noEmit

# Start server for smoke tests
cd server && npm run dev &
sleep 3

# DP-01 — GET data points (empty initially, returns array)
curl -s http://localhost:8080/api/v1/data-points | jq 'type'
# Expected: "array"

# DP-02 — POST with value = 0 (must return 400)
curl -s -X POST http://localhost:8080/api/v1/data-points \
  -H 'Content-Type: application/json' \
  -d '{"asset_id":"test","year_month":"2026-01","value":0}' | jq .
# Expected: {"error":"value must be greater than 0"}

# DP-02 — POST with non-existent asset_id (must return 404)
curl -s -X POST http://localhost:8080/api/v1/data-points \
  -H 'Content-Type: application/json' \
  -d '{"asset_id":"nonexistent","year_month":"2026-01","value":1000}' | jq .
# Expected: {"error":"Asset not found"}

# DP-02 — POST with invalid year_month format
curl -s -X POST http://localhost:8080/api/v1/data-points \
  -H 'Content-Type: application/json' \
  -d '{"asset_id":"test","year_month":"2026/01","value":1000}' | jq .
# Expected: {"error":"year_month must be YYYY-MM"}

# DP-01 sort check (create two points at different months, verify order)
# After creating an asset, post two data points and verify year_month desc order:
curl -s http://localhost:8080/api/v1/data-points | jq '[.[].year_month]'
# Expected: ["2026-04", "2026-01", ...] (most recent first)
```
</verification>

<success_criteria>
- server/src/routes/dataPoints.ts exists and is TypeScript-valid
- `cd server && npx tsc --noEmit` exits 0 for all route files combined
- All three route files export `default router` (grep confirms)
- All local imports use `.js` extension (grep confirms)
- randomUUID imported from `node:crypto` (not used as global)
- GET handler uses `b.year_month.localeCompare(a.year_month)` for descending sort
- PUT handler rejects both id and asset_id changes with 400
- DELETE handler has no referential integrity check
</success_criteria>

<output>
After completion, create `.planning/phases/02-crud-api/02-2-SUMMARY.md`
</output>
