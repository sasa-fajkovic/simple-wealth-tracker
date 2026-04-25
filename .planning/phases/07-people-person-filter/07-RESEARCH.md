# Phase 7: People & Person Filter — Research

**Researched:** 2026-04-22
**Domain:** Person model + asset filter (backend CRUD + frontend pills/admin tab)
**Confidence:** HIGH — all findings verified by direct codebase inspection

---

## Summary

Phase 7 adds a lightweight `Person` dimension to WealthTrack. Every major integration point has been read directly from the codebase — there are no guesses below. The existing patterns (Zod + toSlug + 409 guards, Hono router mounting, YAML flat-file storage, cancelled-fetch React pattern, inline delete-error display) are all consistent and well-established. Person follows the same patterns exactly.

The single most important structural finding: **`Database` interface in `server/src/models/index.ts` is explicitly typed**, not a generic Record — `persons` must be added there and be backward-compatible (see Critical Findings). Bootstrap only runs when the file **does not exist** — it cannot be used for persons seeding of an existing database. The solution is an **additive migration in bootstrap** that checks `db.persons` after parsing an existing file.

**Primary recommendation:** Follow the categories route/modal/tab as the exact template for persons — it is simpler than assets (no category reference, no growth rate) and already has the slug + 409 delete guard pattern.

---

## Backend: Person Model & Storage

### 1. `Database` interface — explicit type, must add `persons`

**File:** `server/src/models/index.ts`

Current shape:
```typescript
export interface Database {
  categories: Category[]
  assets: Asset[]
  dataPoints: DataPoint[]
}
```

`readDb()` and `mutateDb()` both cast to `Database` — the type is **authoritative**. Any key not in the interface is effectively invisible.

**Required change:**
```typescript
export interface Person {
  id: string    // URL-safe slug, immutable after create
  name: string
}

export interface Asset {
  // ... existing fields ...
  person_id?: string | null  // ADD: optional; null = household-level asset
}

export interface Database {
  categories: Category[]
  assets: Asset[]
  dataPoints: DataPoint[]
  persons: Person[]           // ADD
}
```

`person_id` on `Asset` must be `string | null | undefined` in the interface (matching YAML flexibility — existing records simply won't have the key → `undefined`, which is equivalent to unassigned). Using `?: string | null` covers both. [VERIFIED: codebase read]

### 2. `storage/index.ts` — no changes needed

`readDb()` and `mutateDb()` are generic — they read/write whatever `Database` shape is defined. Adding `persons` to the interface is sufficient. [VERIFIED: codebase read]

### 3. Seed file — `server/src/models/seed.ts`

Current: exports only `SEED_CATEGORIES: Category[]`. Pattern to extend:
```typescript
export const SEED_PERSONS: Person[] = [
  { id: 'sasa',   name: 'Sasa'   },
  { id: 'matea',  name: 'Matea'  },
  { id: 'elliot', name: 'Elliot' },
  { id: 'oskar',  name: 'Oskar'  },
]
```

### 4. `bootstrap.ts` — CRITICAL: two separate seeding paths

**Current bootstrap logic:**
```
if (!fileExists):
    write {categories: SEED_CATEGORIES, assets: [], dataPoints: []}
    return
else:
    parse YAML — crash on corrupt
    return (no mutation of existing data)
```

**Problem:** For existing databases (file already exists), `persons` key will be absent from YAML → `db.persons` will be `undefined` after `parse(raw) as Database`.

**Required change — additive migration after the existing-file parse check:**
```typescript
// After the parse-validation block (line 43), before the function returns:
const parsed = parse(raw) as Database
if (!parsed.persons || parsed.persons.length === 0) {
  const updated: Database = { ...parsed, persons: SEED_PERSONS }
  await writeFileAtomic(DB_PATH, stringify(updated, { lineWidth: 0 }))
  console.log(`Seeded ${SEED_PERSONS.length} persons into existing database`)
}
```

This is safe: `SEED_PERSONS` only written when `persons` array is absent or empty. User-created persons survive restarts because the guard `length === 0` allows re-seeding only on truly empty. If the user deletes all seed persons and wants an empty list, this would re-seed — but that edge case is acceptable per the CONTEXT (seed represents the household). [VERIFIED: bootstrap.ts read]

> **Note:** bootstrap.ts currently imports only `SEED_CATEGORIES` from `./models/seed.js`. The additive migration will also need `SEED_PERSONS`.

### 5. `server/src/routes/persons.ts` — new file, exact schema

```typescript
import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { readDb, mutateDb } from '../storage/index.js'
import type { Person } from '../models/index.js'

const router = new Hono()

const hook = (result: { success: boolean; error?: z.ZodError }, c: any) => {
  if (!result.success && result.error) {
    return c.json({ error: result.error.issues[0]?.message ?? 'Invalid request' }, 400 as const)
  }
}

const createSchema = z.object({
  name: z.string().min(1, 'name is required'),
})

const updateSchema = createSchema.extend({ id: z.string().optional() })

function toSlug(name: string): string {
  return name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
}

// GET /api/v1/persons
router.get('/', async (c) => {
  const db = await readDb()
  return c.json([...(db.persons ?? [])].sort((a, b) => a.name.localeCompare(b.name)))
})

// POST /api/v1/persons
router.post('/', zValidator('json', createSchema, hook), async (c) => {
  const body = c.req.valid('json')
  const id = toSlug(body.name)
  const db = await readDb()
  if ((db.persons ?? []).find((p) => p.id === id)) {
    throw new HTTPException(409, { message: `Person with id '${id}' already exists` })
  }
  const person: Person = { id, name: body.name }
  await mutateDb((db) => ({ ...db, persons: [...(db.persons ?? []), person] }))
  return c.json(person, 201)
})

// PUT /api/v1/persons/:id
router.put('/:id', zValidator('json', updateSchema, hook), async (c) => {
  const paramId = c.req.param('id')
  const body = c.req.valid('json')
  if (body.id !== undefined && body.id !== paramId) {
    throw new HTTPException(400, { message: 'id cannot be changed' })
  }
  const db = await readDb()
  const idx = (db.persons ?? []).findIndex((p) => p.id === paramId)
  if (idx === -1) throw new HTTPException(404, { message: 'Person not found' })
  const { id: _id, ...updateData } = body
  const updated: Person = { ...db.persons[idx], ...updateData, id: paramId }
  await mutateDb((db) => {
    const persons = [...(db.persons ?? [])]
    persons[idx] = updated
    return { ...db, persons }
  })
  return c.json(updated)
})

// DELETE /api/v1/persons/:id
router.delete('/:id', async (c) => {
  const id = c.req.param('id')
  const db = await readDb()
  if (!(db.persons ?? []).find((p) => p.id === id)) {
    throw new HTTPException(404, { message: 'Person not found' })
  }
  const inUse = db.assets.filter((a) => a.person_id === id)
  if (inUse.length > 0) {
    throw new HTTPException(409, { message: `Person is in use by ${inUse.length} asset(s)` })
  }
  await mutateDb((db) => ({ ...db, persons: (db.persons ?? []).filter((p) => p.id !== id) }))
  return c.json({ success: true })
})

export default router
```

> **`db.persons ?? []` defensive guard:** Until every existing database is migrated, `db.persons` may be `undefined` — the guard prevents runtime crashes. [VERIFIED: bootstrap.ts logic]

### 6. `server/src/routes/assets.ts` — Zod schema changes

**Current createSchema:**
```typescript
const createSchema = z.object({
  name: z.string().min(1, 'name is required'),
  category_id: z.string().min(1, 'category_id is required'),
  projected_yearly_growth: z.number().nullable(),
  location: z.string().optional(),
  notes: z.string().optional(),
})
```

**Add `person_id` to both schemas:**
```typescript
const createSchema = z.object({
  // ... existing fields ...
  person_id: z.string().nullable().optional(),   // ADD
})
const updateSchema = createSchema.extend({ id: z.string().optional() })
```

In the POST handler, the spread `{ id, ...body, created_at: ... }` will naturally include `person_id` from validated body. In the PUT handler, the spread `{ ...db.assets[idx], ...updateData, id: paramId }` will overwrite `person_id` from body (including `null` to clear it). [VERIFIED: assets.ts read]

### 7. `server/src/index.ts` — mount persons router

**Add after the existing route registrations:**
```typescript
import personsRouter from './routes/persons.js'
// ...
app.route('/api/v1/persons', personsRouter)
```

Exact insertion point: after `app.route('/api/v1/projections', projectionsRouter)` and before the static serving block. [VERIFIED: index.ts read]

---

## Backend: Summary Filter

### 8. `server/src/calc/summary.ts` — `aggregateSummary` signature

Current signature:
```typescript
export function aggregateSummary(
  assets: Asset[],
  categories: Category[],
  locfData: Map<string, Map<string, number>>,
  months: string[]
): SummaryResponse
```

The `assets` array is the **first argument** and is used throughout the function:
- `locfFill(months, db.dataPoints, db.assets)` — passed all assets
- `aggregateSummary(db.assets, db.categories, locfData, months)` — passed all assets

**No change to `aggregateSummary` or `locfFill` is needed.** The filter is applied in the **route** before these calls. [VERIFIED: summary.ts + routes/summary.ts read]

### 9. `server/src/routes/summary.ts` — add `person` query param

**Current querySchema:**
```typescript
const querySchema = z.object({ range: z.enum(rangeValues).default('1y') })
```

**Change to:**
```typescript
const querySchema = z.object({
  range: z.enum(rangeValues).default('1y'),
  person: z.string().optional(),   // ADD — person slug; absent = all assets
})
```

**Current route handler:**
```typescript
router.get('/', zValidator('query', querySchema, hook), async (c) => {
  const { range } = c.req.valid('query')
  const db = await readDb()
  // ... month calculations ...
  const locfData = locfFill(months, db.dataPoints, db.assets)
  return c.json(aggregateSummary(db.assets, db.categories, locfData, months))
})
```

**Change to:**
```typescript
router.get('/', zValidator('query', querySchema, hook), async (c) => {
  const { range, person } = c.req.valid('query')
  const db = await readDb()

  // Filter assets by person_id when person param is provided
  const filteredAssets = person
    ? db.assets.filter((a) => a.person_id === person)
    : db.assets

  // ... month calculations unchanged ...
  const locfData = locfFill(months, db.dataPoints, filteredAssets)
  return c.json(aggregateSummary(filteredAssets, db.categories, locfData, months))
})
```

**Key detail:** `locfFill` receives `filteredAssets` too — it iterates `assets` to build per-asset maps. If `db.assets` were passed instead, unfiltered assets would still appear in the LOCF data. [VERIFIED: summary.ts locfFill reads `assets` array to build result map]

---

## Frontend: Type Changes

### 10. `web/src/types/index.ts` — changes needed

**Add Person interface:**
```typescript
export interface Person {
  id: string    // URL-safe slug, immutable after create
  name: string
}
```

**Extend Asset interface:**
```typescript
export interface Asset {
  // ... existing fields ...
  person_id?: string | null  // ADD: optional; null/undefined = household-level
}
```

**Extend CreateAssetPayload and UpdateAssetPayload:**
```typescript
export interface CreateAssetPayload {
  // ... existing fields ...
  person_id?: string | null  // ADD
}

export interface UpdateAssetPayload {
  // ... existing fields ...
  person_id?: string | null  // ADD
}
```

**Add Person payloads:**
```typescript
export interface CreatePersonPayload {
  name: string
}

export interface UpdatePersonPayload {
  name: string
}
```

[VERIFIED: types/index.ts read — no Person type exists yet]

---

## Frontend: API Client Changes

### 11. `web/src/api/client.ts` — changes needed

**Current `getSummary`:**
```typescript
export function getSummary(range: RangeKey): Promise<SummaryResponse> {
  return apiFetch(`/summary?range=${range}`)
}
```

**Change to (backward-compatible — `person` is optional):**
```typescript
export function getSummary(range: RangeKey, person?: string): Promise<SummaryResponse> {
  const qs = person ? `?range=${range}&person=${person}` : `?range=${range}`
  return apiFetch(`/summary${qs}`)
}
```

All existing callers pass only `range` — the optional `person` parameter doesn't break them. [VERIFIED: client.ts read — all callers use `getSummary(range)` only]

**Add Person CRUD functions:**
```typescript
import type {
  // ... existing imports ...
  Person,
  CreatePersonPayload,
  UpdatePersonPayload,
} from '../types/index'

// ── Persons ─────────────────────────────────────────────────────────────────

export function getPersons(): Promise<Person[]> {
  return apiFetch('/persons')
}

export function createPerson(data: CreatePersonPayload): Promise<Person> {
  return apiFetch('/persons', { method: 'POST', body: JSON.stringify(data) })
}

export function updatePerson(id: string, data: UpdatePersonPayload): Promise<Person> {
  return apiFetch(`/persons/${id}`, { method: 'PUT', body: JSON.stringify(data) })
}

export function deletePerson(id: string): Promise<void> {
  return apiFetch(`/persons/${id}`, { method: 'DELETE' })
}
```

---

## Frontend: Dashboard Extension

### 12. `web/src/pages/DashboardPage.tsx` — person filter pills

**Current state:**
- `useState<RangeKey>('1y')` for range
- `getSummary(range)` called in `useEffect([range, retryCount])`
- Range pills rendered in a `flex flex-wrap gap-1` div

**Required additions:**

1. **State:** `const [persons, setPersons] = useState<Person[]>([])`  and `const [person, setPerson] = useState<string | null>(null)` (null = "All")

2. **Fetch persons on mount** (separate useEffect, no retryCount dependency needed):
   ```typescript
   useEffect(() => {
     let cancelled = false
     getPersons().then(list => { if (!cancelled) setPersons(list) }).catch(() => {})
     return () => { cancelled = true }
   }, [])
   ```

3. **Pass person to getSummary:**
   ```typescript
   getSummary(range, person ?? undefined)
   ```
   The `useEffect` dependency array becomes `[range, person, retryCount]`.

4. **Person filter pills — exact pill classes** (copy from existing range pills):
   ```tsx
   {/* Person filter pills — between range selector row and chart */}
   {persons.length > 0 && (
     <div className="flex flex-wrap gap-1 mb-4">
       <button
         onClick={() => setPerson(null)}
         className={
           person === null
             ? 'bg-blue-600 border border-blue-600 text-white rounded-full px-3 py-1 text-xs font-medium cursor-pointer'
             : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50 rounded-full px-3 py-1 text-xs font-medium transition-colors cursor-pointer'
         }
       >
         All
       </button>
       {persons.map(p => (
         <button
           key={p.id}
           onClick={() => setPerson(p.id)}
           className={
             person === p.id
               ? 'bg-blue-600 border border-blue-600 text-white rounded-full px-3 py-1 text-xs font-medium cursor-pointer'
               : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50 rounded-full px-3 py-1 text-xs font-medium transition-colors cursor-pointer'
           }
         >
           {p.name}
         </button>
       ))}
     </div>
   )}
   ```

   **Placement:** Between the `{/* Controls row */}` div and the error banner / loading skeleton — i.e., after the `</div>` that closes the range-pills + chart-type-selector row (line ~75 in current file) and before the error banner block. [VERIFIED: DashboardPage.tsx read]

5. **Import additions:** `getPersons` from `'../api/client'`, `Person` from `'../types/index'`

---

## Frontend: Admin Extension

### 13. `web/src/pages/AdminPage.tsx` — add People tab

**Current Tab type:** `'datapoints' | 'assets' | 'categories'`

**Change:**
```typescript
type Tab = 'datapoints' | 'assets' | 'categories' | 'people'

const tabs: { id: Tab; label: string }[] = [
  { id: 'datapoints', label: 'Data Points' },
  { id: 'assets',     label: 'Assets' },
  { id: 'categories', label: 'Categories' },
  { id: 'people',     label: 'People' },       // ADD
]
```

**Add tab content:**
```tsx
{activeTab === 'people' && <PeopleTab />}
```

**Add import:**
```typescript
import PeopleTab from '../components/admin/PeopleTab'
```

[VERIFIED: AdminPage.tsx read — Tab type is a union literal, tabs array drives both the tab bar and content rendering]

### 14. New file: `web/src/components/admin/PeopleTab.tsx`

This is a near-exact copy of `CategoriesTab.tsx` with the following simplifications:
- No `sort` needed for Category's growth/color columns — only `name` sort
- No Info banner (categories has the liabilities info banner — people does not need one)
- Columns: **Name | Slug | Actions** (3 columns, same as categories minus growth/color)
- Uses `getPersons`, `createPerson`, `updatePerson`, `deletePerson` from API client
- `deleteError` message: `"Person is in use by N asset(s)"` (comes from server 409 response)
- Passes `persons` list and `PersonModal` instead of `CategoryModal`

**Table structure (3 columns):**
```tsx
<thead>
  <tr>
    <th ... onClick={() => toggleSort('name')}>Name <SortIcon col="name" /></th>
    <th ...>Slug</th>
    <th ...>Actions</th>
  </tr>
</thead>
<tbody>
  {sortedRows.map(person => (
    <tr ...>
      <td ...>{person.name}</td>
      <td ...>{person.id}</td>
      <td ...>
        {/* Edit / Delete buttons */}
        {deleteError?.id === person.id && (
          <p className="text-xs text-red-600 mt-1">{deleteError.message}</p>
        )}
      </td>
    </tr>
  ))}
  {sortedRows.length === 0 && (
    <tr>
      <td colSpan={3} ...>No people yet. Click "Add Person" to get started.</td>
    </tr>
  )}
</tbody>
```

[VERIFIED: CategoriesTab.tsx as template, pattern confirmed]

### 15. New file: `web/src/components/admin/PersonModal.tsx`

Simpler than `CategoryModal` — only `name` field + read-only slug. No growth rate, no color picker.

Structure mirrors `CategoryModal.tsx` exactly, with:
- One input: `name` (required)
- One read-only field: `ID (slug) — read only`
- No other fields
- `CreatePersonPayload = { name: string }`
- `UpdatePersonPayload = { name: string }`

```tsx
interface PersonModalProps {
  mode: 'create' | 'edit'
  item?: Person
  saving: boolean
  saveError: string | null
  onSave: (payload: CreatePersonPayload | UpdatePersonPayload) => void
  onCancel: () => void
}
```

Validation: only `if (!name.trim()) { setValidationError('Name is required'); return }`

[VERIFIED: CategoryModal.tsx as template]

### 16. `web/src/components/admin/AssetsTab.tsx` — changes needed

**Add Person column to the table:**

1. **State:** Add `const [persons, setPersons] = useState<Person[]>([])`

2. **Fetch:** In the existing `Promise.all([getAssets(), getCategories()])` call, extend to:
   ```typescript
   Promise.all([getAssets(), getCategories(), getPersons()])
     .then(([ast, cats, ppl]) => {
       if (!cancelled) { setRows(ast); setCategories(cats); setPersons(ppl) }
     })
   ```

3. **Person map** (like `categoryMap`):
   ```typescript
   const personMap = Object.fromEntries(persons.map(p => [p.id, p]))
   ```

4. **Table header — add Person column after Notes, before Actions:**
   ```tsx
   <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wide px-4 py-3">
     Person
   </th>
   ```

5. **Table cell:**
   ```tsx
   <td className="px-4 py-3 text-sm font-medium text-gray-500">
     {asset.person_id ? (personMap[asset.person_id]?.name ?? asset.person_id) : '—'}
   </td>
   ```

6. **Pass `persons` to `AssetModal`:**
   ```tsx
   <AssetModal
     // ... existing props ...
     persons={persons}    // ADD
   />
   ```

7. **Update `colSpan` on empty state row:** 6 → 7 (now 7 columns: Name, Category, Growth, Location, Notes, Person, Actions)

[VERIFIED: AssetsTab.tsx read — currently 6 columns with colSpan={6}]

### 17. `web/src/components/admin/AssetModal.tsx` — add Person dropdown

**Props change:**
```typescript
interface AssetModalProps {
  // ... existing ...
  persons: Person[]   // ADD — passed from AssetsTab
}
```

**State addition:**
```typescript
const [personId, setPersonId] = useState<string>(
  mode === 'edit' ? (item!.person_id ?? '') : ''
)
```
(Empty string `''` = unassigned/null)

**Add Person dropdown — last field, after Notes, before the validation error block:**
```tsx
{/* Person (optional) */}
<div className="mb-4">
  <label className="block text-xs font-medium text-gray-500 mb-1">
    Person (optional)
  </label>
  <select
    value={personId}
    onChange={e => setPersonId(e.target.value)}
    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
  >
    <option value="">— Unassigned —</option>
    {persons.map(p => (
      <option key={p.id} value={p.id}>{p.name}</option>
    ))}
  </select>
</div>
```

**In `handleSubmit` — include in both payloads:**
```typescript
const person_id = personId !== '' ? personId : null

if (mode === 'create') {
  const payload: CreateAssetPayload = {
    // ... existing fields ...
    person_id,    // ADD: null when unassigned
  }
}
// Same for UpdateAssetPayload
```

[VERIFIED: AssetModal.tsx read — Notes is the last `mb-4` field before validation error block]

---

## Open Questions (All Resolved)

**Q1: Does `Database` need explicit `persons?:` field or is it a generic Record?**
**RESOLVED:** `Database` is explicitly typed in `server/src/models/index.ts` (interface with 3 named fields). `persons: Person[]` must be added explicitly. The `?` optional modifier is NOT recommended on the interface — instead, use `?? []` guards in route code for robustness during migration. [VERIFIED: models/index.ts read]

**Q2: Does bootstrap check for existing persons or always overwrite?**
**RESOLVED:** Bootstrap currently only runs the seed write when the **file doesn't exist** (early return after writing). For existing files it only validates YAML parsability and returns. An **additive migration block** must be added after the parse-validation step to seed persons into existing databases when `db.persons` is absent. [VERIFIED: bootstrap.ts read]

**Q3: What is the exact Zod schema for CreatePersonSchema and UpdatePersonSchema?**
**RESOLVED:**
```typescript
const createSchema = z.object({ name: z.string().min(1, 'name is required') })
const updateSchema = createSchema.extend({ id: z.string().optional() })
```
Person has no other fields. The `id.optional()` in updateSchema follows the categories/assets pattern for detecting illegal id-change attempts. [VERIFIED: categories.ts and assets.ts patterns]

**Q4: Does the summary route currently accept any query params? What's the exact parsing pattern?**
**RESOLVED:** Yes — it accepts `range` via `zValidator('query', querySchema, hook)` where `querySchema = z.object({ range: z.enum(rangeValues).default('1y') })`. The `person` param needs to be added to this same schema object as `z.string().optional()`. The hook pattern is identical to all other routes. [VERIFIED: routes/summary.ts read]

**Q5: Is there a 409 guard helper/pattern in existing routes that persons DELETE should reuse?**
**RESOLVED:** There is **no shared helper** — the 409 pattern is inline in each route's DELETE handler:
```typescript
const inUse = db.assets.filter((a) => a.category_id === id)
if (inUse.length > 0) {
  throw new HTTPException(409, { message: `Category is in use by ${inUse.length} asset(s)` })
}
```
Persons should replicate this pattern exactly (checking `a.person_id === id`). [VERIFIED: categories.ts and assets.ts read]

**Q6: What is the current `getSummary(range)` signature — how to add optional `person?` without breaking existing callers?**
**RESOLVED:** Current: `getSummary(range: RangeKey): Promise<SummaryResponse>`. Add `person?: string` as second optional parameter. All existing callers (only `DashboardPage.tsx`) call `getSummary(range)` — they are unaffected because optional parameters default to `undefined`. [VERIFIED: client.ts and DashboardPage.tsx read]

---

## Critical Findings (things that break if missed)

### CF-1: `db.persons ?? []` guard is MANDATORY in all route code
`db.persons` will be `undefined` for any database YAML that hasn't been migrated yet. Without the `?? []` guard, `.find()`, `.filter()`, `.findIndex()` will throw `TypeError: Cannot read properties of undefined`. Every persons route handler must use `(db.persons ?? [])`. Same in `mutateDb` callbacks.

### CF-2: `locfFill` must receive `filteredAssets`, not `db.assets`
`locfFill(months, db.dataPoints, filteredAssets)` — if `db.assets` is passed instead, all assets (including those of other persons) would be included in the LOCF map, and `aggregateSummary` would aggregate them even though the passed `filteredAssets` is narrower. The LOCF map would have entries for asset IDs not in `filteredAssets`, which are then silently ignored (they never match `catAssets`) — so it wouldn't produce wrong numbers, but it wastes computation. More importantly, if `locfFill` is refactored in future to look up from the map differently, this could break. Pass `filteredAssets` to both.

### CF-3: Bootstrap additive migration needed for existing databases
Without the migration in `bootstrap.ts`, any deployment with an existing `database.yaml` will have `db.persons = undefined` until the first POST to `/api/v1/persons`. The GET endpoint will return `[]` (after `?? []` guard), which is OK, but the seed persons won't exist. Since the household seed is important UX, the migration should be in bootstrap.

### CF-4: `colSpan` in AssetsTab empty-state row must be updated
Currently `colSpan={6}`. Adding the Person column makes it 7. If not updated, the empty-state row won't span the full table width. A small visual bug, but must not be missed.

### CF-5: `person_id` in Asset Zod schema must be `.nullable().optional()` not just `.optional()`
The field can be `null` (explicitly cleared) or omitted entirely. Using `z.string().optional()` would reject `null` payloads. Pattern: `z.string().nullable().optional()`.

### CF-6: Typography rule — `font-semibold` and `font-normal` BANNED
All new components must use only `font-medium` and `font-bold`. The existing admin components use `font-medium` throughout. PersonModal and PeopleTab must follow the same. [VERIFIED: existing components confirmed; rule from CONTEXT.md]

### CF-7: `getSummary` change must update the `useEffect` dependency array in DashboardPage
Adding `person` state means the effect that fetches summary data must list `person` in its dependency array: `[range, person, retryCount]`. If missed, changing the person filter won't trigger a re-fetch.

---

## Files to Create/Modify

| File | Action | Notes |
|------|--------|-------|
| `server/src/models/index.ts` | MODIFY | Add `Person` interface; add `person_id?` to `Asset`; add `persons` to `Database` |
| `server/src/models/seed.ts` | MODIFY | Add `SEED_PERSONS` export |
| `server/src/bootstrap.ts` | MODIFY | Import `SEED_PERSONS`; add additive migration for persons |
| `server/src/routes/persons.ts` | CREATE | Full CRUD router (mirror categories.ts pattern) |
| `server/src/routes/assets.ts` | MODIFY | Add `person_id` to createSchema and updateSchema |
| `server/src/routes/summary.ts` | MODIFY | Add `person` to querySchema; filter assets before locfFill |
| `server/src/index.ts` | MODIFY | Import and mount personsRouter |
| `web/src/types/index.ts` | MODIFY | Add `Person` interface; extend `Asset`, payloads |
| `web/src/api/client.ts` | MODIFY | Add persons CRUD; update getSummary signature |
| `web/src/pages/DashboardPage.tsx` | MODIFY | Add person state, fetch, filter pills |
| `web/src/pages/AdminPage.tsx` | MODIFY | Add 'people' tab |
| `web/src/components/admin/PeopleTab.tsx` | CREATE | CRUD table (mirror CategoriesTab) |
| `web/src/components/admin/PersonModal.tsx` | CREATE | Name + slug modal (mirror CategoryModal, simplified) |
| `web/src/components/admin/AssetsTab.tsx` | MODIFY | Add persons fetch, Person column, pass persons to modal |
| `web/src/components/admin/AssetModal.tsx` | MODIFY | Add `persons` prop; Person dropdown field |

---

## Sources

### Primary (HIGH confidence — direct codebase reads)
- `server/src/models/index.ts` — Database type shape, Asset/Category/DataPoint interfaces
- `server/src/models/seed.ts` — SEED_CATEGORIES pattern to replicate for SEED_PERSONS
- `server/src/storage/index.ts` — readDb/mutateDb signatures, mutex pattern
- `server/src/bootstrap.ts` — Exact seeding logic (file-not-exists only path)
- `server/src/routes/categories.ts` — Canonical CRUD pattern (Zod, toSlug, 409 guard)
- `server/src/routes/assets.ts` — Asset CRUD, created_at preservation, nullable growth
- `server/src/routes/summary.ts` — querySchema, zValidator hook, aggregateSummary call
- `server/src/calc/summary.ts` — aggregateSummary + locfFill signatures and asset usage
- `server/src/index.ts` — Router mounting order, global error handler pattern
- `web/src/types/index.ts` — All frontend type definitions
- `web/src/api/client.ts` — apiFetch, ApiError, all existing function signatures
- `web/src/pages/DashboardPage.tsx` — Range pill pattern, getSummary call, useEffect pattern
- `web/src/pages/AdminPage.tsx` — Tab type union, tab array, conditional rendering
- `web/src/components/admin/AssetsTab.tsx` — Promise.all fetch, deleteError pattern, table structure
- `web/src/components/admin/AssetModal.tsx` — Modal structure, field order, payload construction
- `web/src/components/admin/CategoriesTab.tsx` — Template for PeopleTab
- `web/src/components/admin/CategoryModal.tsx` — Template for PersonModal

**Research date:** 2026-04-22
**Valid until:** Until any of the canonical ref files above are modified
