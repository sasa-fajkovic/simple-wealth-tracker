# Phase 7: People & Person Filter — Pattern Map

**Mapped:** 2026-04-22
**Files analyzed:** 16 (4 new + 12 modified)
**Analogs found:** 16 / 16

---

## File Classification

| New / Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `server/src/routes/persons.ts` | route | CRUD | `server/src/routes/categories.ts` | exact |
| `server/src/models/index.ts` | model | — | `server/src/models/index.ts` (self) | extend |
| `server/src/storage/index.ts` | storage | — | `server/src/storage/index.ts` (self) | extend |
| `server/src/bootstrap.ts` | config | — | `server/src/models/seed.ts` + `server/src/bootstrap.ts` | extend |
| `server/src/routes/assets.ts` | route | CRUD | `server/src/routes/assets.ts` (self) | extend |
| `server/src/calc/summary.ts` | utility | transform | `server/src/calc/summary.ts` (self) | extend |
| `server/src/index.ts` | config | — | `server/src/index.ts` (self) | extend |
| `web/src/types/index.ts` | types | — | `web/src/types/index.ts` (self) | extend |
| `web/src/api/client.ts` | service | request-response | `web/src/api/client.ts` (self, categories block) | extend |
| `web/src/pages/DashboardPage.tsx` | component | request-response | `web/src/pages/DashboardPage.tsx` (self, RANGES pills) | extend |
| `web/src/pages/AdminPage.tsx` | component | — | `web/src/pages/AdminPage.tsx` (self) | extend |
| `web/src/components/admin/AssetsTab.tsx` | component | CRUD | `web/src/components/admin/AssetsTab.tsx` (self) | extend |
| `web/src/components/admin/AssetModal.tsx` | component | request-response | `web/src/components/admin/AssetModal.tsx` (self) | extend |
| `web/src/components/admin/PersonModal.tsx` ✨ | component | request-response | `web/src/components/admin/CategoryModal.tsx` | exact |
| `web/src/components/admin/PeopleTab.tsx` ✨ | component | CRUD | `web/src/components/admin/CategoriesTab.tsx` | exact |

---

## Pattern Assignments

### `server/src/routes/persons.ts` ✨ (new route, CRUD)

**Analog:** `server/src/routes/categories.ts` — Person is structurally identical to Category minus `projected_yearly_growth` and `color`.

**Imports pattern** (categories.ts lines 1–7):
```typescript
import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { readDb, mutateDb } from '../storage/index.js'
import type { Category } from '../models/index.js'
// → replace Category with Person
```

**Zod hook + schemas** (categories.ts lines 10–25):
```typescript
// MANDATORY: pass hook as 3rd arg — default returns { success: false, error: ZodIssue[] }
// which does NOT match the required {"error":"..."} API contract (API-01).
const hook = (result: { success: boolean; error?: z.ZodError }, c: any) => {
  if (!result.success && result.error) {
    return c.json({ error: result.error.issues[0]?.message ?? 'Invalid request' }, 400 as const)
  }
}

const createSchema = z.object({
  name: z.string().min(1, 'name is required'),
  projected_yearly_growth: z.number(),  // ← DROP these two for Person
  color: z.string().regex(...)          // ← DROP for Person
})
// Person createSchema = z.object({ name: z.string().min(1, 'name is required') })
// Person updateSchema = createSchema.extend({ id: z.string().optional() })
```

**toSlug** (categories.ts lines 28–30):
```typescript
// MODEL-01: id is a URL-safe slug derived from name
function toSlug(name: string): string {
  return name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
}
```

**GET + POST pattern** (categories.ts lines 33–51):
```typescript
router.get('/', async (c) => {
  const db = await readDb()
  return c.json(db.categories)   // → db.persons, sorted by name
})

router.post('/', zValidator('json', createSchema, hook), async (c) => {
  const body = c.req.valid('json')
  const id = toSlug(body.name)

  const db = await readDb()
  if (db.categories.find((cat) => cat.id === id)) {
    throw new HTTPException(409, { message: `Category with id '${id}' already exists` })
  }  // → check db.persons, message: `Person with id '${id}' already exists`

  const category: Category = { id, ...body }
  await mutateDb((db) => ({ ...db, categories: [...db.categories, category] }))
  return c.json(category, 201)
})
```

**PUT pattern** (categories.ts lines 54–75):
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
// → replace 'category' refs with 'person', db.categories with db.persons
```

**DELETE with 409 guard** (categories.ts lines 78–94):
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
  // → for Person:
  // const inUse = db.assets.filter((a) => a.person_id === id)
  // message: `Person is in use by ${inUse.length} asset(s)`

  await mutateDb((db) => ({ ...db, categories: db.categories.filter((cat) => cat.id !== id) }))
  return c.json({ success: true })
})
```

**Key differences from categories.ts:**
- `createSchema` has only `{ name }` (no `projected_yearly_growth`, no `color`)
- DELETE checks `a.person_id === id` (not `a.category_id`)
- DELETE message: `"Person is in use by N asset(s)"`
- GET should return persons sorted by name: `db.persons.slice().sort((a, b) => a.name.localeCompare(b.name))`

---

### `server/src/models/index.ts` (extend)

**Analog:** self — add `Person` interface following the same pattern as `Category`.

**Pattern to copy** (models/index.ts lines 4–9):
```typescript
export interface Category {
  id: string                       // URL-safe slug, immutable after create (MODEL-01)
  name: string
  projected_yearly_growth: number
  color: string
}
// → Person is a minimal Category:
export interface Person {
  id: string   // URL-safe slug, immutable after create
  name: string
}
```

**Asset extension** (models/index.ts lines 11–19):
```typescript
export interface Asset {
  // add after existing fields:
  person_id?: string | null   // optional; null = household-level asset (MODEL-02 extension)
}
```

**Database type extension** (models/index.ts lines 32–37):
```typescript
export interface Database {
  categories: Category[]
  assets: Asset[]
  dataPoints: DataPoint[]
  persons: Person[]   // ← add
}
```

---

### `server/src/storage/index.ts` (extend)

No code change needed in the storage module itself — the `Database` type drives YAML shape. The `readDb()` / `mutateDb()` functions are generic over the `Database` type and require no modification. Only `models/index.ts` needs the `persons` field added.

---

### `server/src/bootstrap.ts` (extend)

**Analog:** `server/src/models/seed.ts` + `server/src/bootstrap.ts`

**Seed constant pattern** (models/seed.ts lines 1–10):
```typescript
import type { Category } from './index.js'

export const SEED_CATEGORIES: Category[] = [
  { id: 'stocks', name: 'Stocks', projected_yearly_growth: 0.08, color: '#6366f1' },
  // ...
]
// → add to same file or a separate seed block:
import type { Person } from './index.js'

export const SEED_PERSONS: Person[] = [
  { id: 'sasa',   name: 'Sasa'   },
  { id: 'matea',  name: 'Matea'  },
  { id: 'elliot', name: 'Elliot' },
  { id: 'oskar',  name: 'Oskar'  },
]
```

**Initial Database block** (bootstrap.ts lines 21–26):
```typescript
const initial: Database = {
  categories: SEED_CATEGORIES,
  assets: [],
  dataPoints: [],
  // add:
  persons: SEED_PERSONS,
}
```

**Existing-file migration guard:** bootstrap only runs the seed block when the file doesn't exist (line 19 `if (!fileExists)`). For existing databases that lack a `persons` key, the YAML parser returns `undefined` for `db.persons`. The persons route must defensively treat `undefined` as `[]`:
```typescript
// In persons route GET handler:
const db = await readDb()
const persons = db.persons ?? []
return c.json(persons.slice().sort((a, b) => a.name.localeCompare(b.name)))
```

---

### `server/src/routes/assets.ts` (extend — schemas only)

**Add `person_id` to both schemas** (assets.ts lines 17–26):
```typescript
const createSchema = z.object({
  name: z.string().min(1, 'name is required'),
  category_id: z.string().min(1, 'category_id is required'),
  projected_yearly_growth: z.number().nullable(),
  location: z.string().optional(),
  notes: z.string().optional(),
  person_id: z.string().nullable().optional(),   // ← add
})

const updateSchema = createSchema.extend({ id: z.string().optional() })
// person_id is already covered by extending createSchema
```

No route handler logic changes — YAML is flexible and will persist `person_id` transparently once the schema accepts it.

---

### `server/src/calc/summary.ts` (extend — add person filter)

**Analog:** self — `locfFill` and `aggregateSummary` receive an `assets` slice; the filter happens in the route before calling these functions.

**Filter pattern to add in `server/src/routes/summary.ts`** (summary route lines 23–49):
```typescript
// Extend querySchema to accept optional person param:
const querySchema = z.object({
  range: z.enum(rangeValues).default('1y'),
  person: z.string().optional(),   // ← add
})

router.get('/', zValidator('query', querySchema, hook), async (c) => {
  const { range, person } = c.req.valid('query')
  const db = await readDb()

  // Person filter — applied before LOCF so aggregation only sees the filtered slice
  const assets = person
    ? db.assets.filter(a => a.person_id === person)
    : db.assets

  // ...existing month range logic unchanged...
  const locfData = locfFill(months, db.dataPoints, assets)   // ← pass filtered assets
  return c.json(aggregateSummary(assets, db.categories, locfData, months))
})
```

`locfFill` and `aggregateSummary` signatures are **unchanged** — the filter is entirely at the call site in the route.

---

### `server/src/index.ts` (extend — mount persons router)

**Pattern** (index.ts lines 9–39):
```typescript
// Import pattern (mirrors existing routers):
import personsRouter from './routes/persons.js'

// Mount pattern (add after assetsRouter, before summaryRouter):
app.route('/api/v1/persons', personsRouter)
```

---

### `web/src/types/index.ts` (extend)

**Person interface** — mirrors `Category` pattern (types/index.ts lines 7–12):
```typescript
export interface Person {
  id: string    // URL-safe slug, immutable after create
  name: string
}
```

**Asset extension** (types/index.ts lines 14–22):
```typescript
export interface Asset {
  // ...existing fields...
  person_id?: string | null   // optional; null = household-level asset
}
```

**Payload extensions** (types/index.ts lines 51–66):
```typescript
// Follow exact same structure as CreateCategoryPayload / UpdateCategoryPayload:
export interface CreatePersonPayload {
  name: string
}

export interface UpdatePersonPayload {
  name: string
}

// Extend existing asset payloads:
export interface CreateAssetPayload {
  // ...existing fields...
  person_id?: string | null
}

export interface UpdateAssetPayload {
  // ...existing fields...
  person_id?: string | null
}
```

---

### `web/src/api/client.ts` (extend)

**Analog:** self — `categories` block (client.ts lines 46–62) is the exact template.

**New persons block:**
```typescript
import type {
  // ...existing imports...
  Person,
  CreatePersonPayload,
  UpdatePersonPayload,
} from '../types/index'

// ── Persons ────────────────────────────────────────────────────────────────────

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

**getSummary signature extension** (client.ts lines 102–104):
```typescript
// Before:
export function getSummary(range: RangeKey): Promise<SummaryResponse> {
  return apiFetch(`/summary?range=${range}`)
}

// After:
export function getSummary(range: RangeKey, person?: string): Promise<SummaryResponse> {
  const qs = person ? `?range=${range}&person=${person}` : `?range=${range}`
  return apiFetch(`/summary${qs}`)
}
```

---

### `web/src/pages/DashboardPage.tsx` (extend — add person filter pills)

**Analog:** self — the RANGES pills block (DashboardPage.tsx lines 9–75) is the exact template to copy for person pills.

**Range pill pattern to mirror** (DashboardPage.tsx lines 59–74):
```typescript
// RANGES const at module scope → mirror with persons from API state
const [persons, setPersons] = useState<Person[]>([])
const [person, setPerson] = useState<string | null>(null)  // null = "All"

// Fetch persons once on mount:
useEffect(() => {
  getPersons().then(setPersons).catch(() => {})
}, [])

// Re-fetch summary when person changes (add to dep array):
useEffect(() => {
  let cancelled = false
  // ...
  getSummary(range, person ?? undefined)  // pass person to getSummary
  // ...
}, [range, person, retryCount])

// Pill render — insert BETWEEN the controls row and the error banner:
<div className="flex flex-wrap gap-1 mb-4">
  {/* "All" pill */}
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
```

**Active vs inactive pill classes** (exact copy from range pills, DashboardPage.tsx lines 65–68):
```
Active:   'bg-blue-600 border border-blue-600 text-white rounded-full px-3 py-1 text-xs font-medium cursor-pointer'
Inactive: 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50 rounded-full px-3 py-1 text-xs font-medium transition-colors cursor-pointer'
```

---

### `web/src/pages/AdminPage.tsx` (extend — add People tab)

**Analog:** self — `tabs` array pattern (AdminPage.tsx lines 8–19).

**Tab addition** (AdminPage.tsx lines 8–43):
```typescript
// Type union — add 'people':
type Tab = 'datapoints' | 'assets' | 'categories' | 'people'

// Tabs array — add as 4th entry:
const tabs: { id: Tab; label: string }[] = [
  { id: 'datapoints', label: 'Data Points' },
  { id: 'assets',     label: 'Assets' },
  { id: 'categories', label: 'Categories' },
  { id: 'people',     label: 'People' },   // ← add
]

// Active tab render — add after categories block:
{activeTab === 'people' && <PeopleTab />}

// Import at top:
import PeopleTab from '../components/admin/PeopleTab'
```

**Tab button class pattern** (AdminPage.tsx lines 29–32 — do not change):
```typescript
className={activeTab === t.id
  ? 'px-4 py-2 text-sm font-medium text-blue-600 border-b-2 border-blue-600 -mb-px'
  : 'px-4 py-2 text-sm font-medium text-gray-500 hover:text-gray-900 border-b-2 border-transparent -mb-px transition-colors'
}
```

---

### `web/src/components/admin/AssetsTab.tsx` (extend — add persons)

**Analog:** self — mirrors how `categories` state is already fetched alongside `assets` (AssetsTab.tsx lines 21, 36–45).

**Add persons state + parallel fetch** (AssetsTab.tsx lines 19–45):
```typescript
const [persons, setPersons] = useState<Person[]>([])

// In useEffect — extend Promise.all:
Promise.all([getAssets(), getCategories(), getPersons()])
  .then(([ast, cats, prs]) => {
    if (!cancelled) { setRows(ast); setCategories(cats); setPersons(prs) }
  })
```

**Pass persons to AssetModal** (AssetsTab.tsx lines 222–231):
```typescript
<AssetModal
  mode={modal.mode}
  item={modal.mode === 'edit' ? modal.item : undefined}
  categories={categories}
  persons={persons}           // ← add
  saving={saving}
  saveError={saveError}
  onSave={handleSave}
  onCancel={() => { setModal(null); setSaveError(null) }}
/>
```

**Person column in table** — add after Notes column (AssetsTab.tsx lines 159–165), using the same `?? '—'` fallback pattern:
```typescript
<th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wide px-4 py-3">
  Person
</th>
// ...in tbody row:
<td className="px-4 py-3 text-sm font-medium text-gray-500">
  {personMap[asset.person_id ?? '']?.name ?? '—'}
</td>
```

Where `personMap` follows the same pattern as `categoryMap` (AssetsTab.tsx line 51):
```typescript
const personMap = Object.fromEntries(persons.map(p => [p.id, p]))
```

---

### `web/src/components/admin/AssetModal.tsx` (extend — add optional Person dropdown)

**Analog:** self — optional field pattern for `location` / `notes` (AssetModal.tsx lines 41–42, 170–193).

**State initialization (optional field pattern)**:
```typescript
// After notes state:
const [personId, setPersonId] = useState<string>(
  mode === 'edit' ? (item!.person_id ?? '') : ''
)
// '' = blank = unassigned
```

**Props interface extension** (AssetModal.tsx lines 12–21):
```typescript
interface AssetModalProps {
  // ...existing...
  persons: Person[]   // ← add; passed down from AssetsTab
}
```

**Person dropdown field** — add after Notes field (AssetModal.tsx line 194), before errors block.  
Pattern mirrors the **Category dropdown** (AssetModal.tsx lines 139–153) but with a blank first option:
```typescript
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

**Payload construction** — optional-field-to-undefined/null pattern (AssetModal.tsx lines 72–74):
```typescript
// In both create and update payloads:
person_id: personId || null,   // blank string → null (unassigned)
```

---

### `web/src/components/admin/PersonModal.tsx` ✨ (new)

**Analog:** `web/src/components/admin/CategoryModal.tsx` — exact structural match.  
Person modal is a **simplified** CategoryModal: only `name` field + read-only slug preview (no growth rate, no color picker).

**Full pattern** (CategoryModal.tsx lines 1–188 — copy entire file, then remove):
- `rateInput` state + growth rate field (lines 31–32, 128–141)
- `color` state + color picker field (lines 34, 143–157)
- Growth/color validation logic (lines 46–53)
- `storedRate` calculation (line 57)
- `projected_yearly_growth` and `color` from all payload objects

**Key differences from CategoryModal:**
```typescript
// Props interface — narrower:
interface PersonModalProps {
  mode: 'create' | 'edit'
  item?: Person                                           // Person, not Category
  saving: boolean
  saveError: string | null
  onSave: (payload: CreatePersonPayload | UpdatePersonPayload) => void
  onCancel: () => void
}

// handleSubmit — only name validation, no rate/color:
function handleSubmit(e: React.FormEvent) {
  e.preventDefault()
  if (!name.trim()) {
    setValidationError('Name is required')
    return
  }
  setValidationError(null)

  if (mode === 'create') {
    onSave({ name: name.trim() })
  } else {
    onSave({ name: name.trim() })
  }
}

// Form: Name + read-only Slug only (no growth rate, no color picker)
```

**Modal overlay structure to copy verbatim** (CategoryModal.tsx lines 78–98):
```typescript
<div className="fixed inset-0 z-50 flex items-center justify-center">
  <div className="absolute inset-0 bg-gray-900/50" onClick={onCancel} />
  <div className="relative bg-white rounded-lg shadow-xl p-6 w-full max-w-md mx-4">
    <div className="flex items-center justify-between mb-4">
      <h2 className="text-sm font-medium text-gray-900">
        {mode === 'create' ? 'Add Person' : 'Edit Person'}
      </h2>
      <button type="button" onClick={onCancel} className="text-gray-400 hover:text-gray-600 transition-colors">
        <X size={16} />
      </button>
    </div>
    ...
  </div>
</div>
```

**Name + slug fields to copy verbatim** (CategoryModal.tsx lines 100–127):
```typescript
{/* Name input */}
<div className="mb-3">
  <label className="block text-xs font-medium text-gray-500 mb-1">Name</label>
  <input type="text" value={name} onChange={e => setName(e.target.value)}
    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
    required />
</div>

{/* Slug preview — always read-only */}
<div className="mb-3">
  <label className="block text-xs font-medium text-gray-500 mb-1">ID (slug) — read only</label>
  <input type="text" value={slugPreview} readOnly
    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-gray-50 text-gray-500 cursor-not-allowed" />
</div>
```

**Error + footer buttons to copy verbatim** (CategoryModal.tsx lines 159–183).

---

### `web/src/components/admin/PeopleTab.tsx` ✨ (new)

**Analog:** `web/src/components/admin/CategoriesTab.tsx` — exact structural match.  
PeopleTab is a **simplified** CategoriesTab: only Name, Slug, and Actions columns (no growth rate, no color).

**Full pattern source:** CategoriesTab.tsx — copy and adapt:

**Imports + types** (CategoriesTab.tsx lines 1–16):
```typescript
import { useState, useEffect } from 'react'
import { Plus, Pencil, Trash2, ChevronUp, ChevronDown } from 'lucide-react'
// Note: no Info icon (no liabilities banner needed for People)
import {
  getPersons, createPerson, updatePerson, deletePerson, ApiError,
} from '../../api/client'
import type { Person, CreatePersonPayload, UpdatePersonPayload } from '../../types/index'
import PersonModal from './PersonModal'

type ModalState = { mode: 'create' } | { mode: 'edit'; item: Person }
```

**State block** (CategoriesTab.tsx lines 18–27 — copy verbatim, substitute `rows` type):
```typescript
const [rows, setRows] = useState<Person[]>([])
const [loading, setLoading] = useState(true)
const [error, setError] = useState<string | null>(null)
const [retryCount, setRetryCount] = useState(0)
const [sort, setSort] = useState<{ col: string; dir: 'asc' | 'desc' }>({ col: 'name', dir: 'asc' })
const [modal, setModal] = useState<ModalState | null>(null)
const [saving, setSaving] = useState(false)
const [saveError, setSaveError] = useState<string | null>(null)
const [deleteError, setDeleteError] = useState<{ id: string; message: string } | null>(null)
```

**Cancelled-fetch useEffect** (CategoriesTab.tsx lines 29–42 — copy verbatim, use `getPersons()`):
```typescript
useEffect(() => {
  let cancelled = false
  setLoading(true)
  setError(null)
  getPersons()
    .then(prs => { if (!cancelled) setRows(prs) })
    .catch(err => { if (!cancelled) setError(err instanceof ApiError ? err.message : 'Unexpected error') })
    .finally(() => { if (!cancelled) setLoading(false) })
  return () => { cancelled = true }
}, [retryCount])
```

**Sort** — only `name` column sortable (CategoriesTab.tsx lines 44–53, trim to name only):
```typescript
const sortedRows = [...rows].sort((a, b) => {
  const mul = sort.dir === 'asc' ? 1 : -1
  return mul * a.name.localeCompare(b.name)
})
```

**handleSave + handleDelete** (CategoriesTab.tsx lines 56–84 — copy verbatim, substitute `createPerson` / `updatePerson` / `deletePerson`).

**Table columns** — simpler than Categories (only Name, Slug, Actions):
```typescript
<thead>
  <tr>
    <th ... onClick={() => toggleSort('name')}>Name <SortIcon col="name" /></th>
    <th ...>Slug</th>
    <th ...>Actions</th>
  </tr>
</thead>
<tbody>
  {sortedRows.map(person => (
    <tr key={person.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
      <td className="px-4 py-3 text-sm font-medium text-gray-900">{person.name}</td>
      <td className="px-4 py-3 text-sm font-medium text-gray-500">{person.id}</td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <button onClick={() => setModal({ mode: 'edit', item: person })} ...><Pencil size={14} /></button>
          <button onClick={() => handleDelete(person.id)} ...><Trash2 size={14} /></button>
        </div>
        {deleteError?.id === person.id && (
          <p className="text-xs text-red-600 mt-1">{deleteError.message}</p>
        )}
      </td>
    </tr>
  ))}
  {sortedRows.length === 0 && (
    <tr><td colSpan={3} className="px-4 py-8 text-center text-sm font-medium text-gray-400">
      No people yet. Click "Add Person" to get started.
    </td></tr>
  )}
</tbody>
```

**Note:** PeopleTab has **no liabilities info banner** (that's Categories-specific).

---

## Shared Patterns

### Cancelled-fetch guard
**Source:** `web/src/pages/DashboardPage.tsx` lines 34–51, `web/src/components/admin/AssetsTab.tsx` lines 31–45
**Apply to:** All new and modified components that call API in `useEffect`
```typescript
useEffect(() => {
  let cancelled = false
  setLoading(true)
  setError(null)
  getSomeData()
    .then(result => { if (!cancelled) setState(result) })
    .catch(err => { if (!cancelled) setError(err instanceof ApiError ? err.message : 'Unexpected error') })
    .finally(() => { if (!cancelled) setLoading(false) })
  return () => { cancelled = true }
}, [retryCount])
```

### Inline 409 Delete Error (no ConfirmDialog)
**Source:** `web/src/components/admin/CategoriesTab.tsx` lines 74–83, 199–201
**Apply to:** `PeopleTab.tsx` handleDelete + table row
```typescript
async function handleDelete(id: string) {
  setDeleteError(null)
  try {
    await deletePerson(id)
    setRetryCount(c => c + 1)
  } catch (err) {
    if (err instanceof ApiError && err.status === 409) {
      setDeleteError({ id, message: err.message })
    }
  }
}
// In table row (same cell as action buttons):
{deleteError?.id === person.id && (
  <p className="text-xs text-red-600 mt-1">{deleteError.message}</p>
)}
```

### toSlug (must be identical in all places — server + client)
**Source:** `server/src/routes/categories.ts` line 28, `web/src/components/admin/CategoryModal.tsx` line 9
**Apply to:** `server/src/routes/persons.ts`, `web/src/components/admin/PersonModal.tsx`
```typescript
function toSlug(name: string): string {
  return name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
}
```

### Modal overlay structure
**Source:** `web/src/components/admin/CategoryModal.tsx` lines 78–98
**Apply to:** `PersonModal.tsx` (copy verbatim — same overlay, card, header, X button)
```typescript
<div className="fixed inset-0 z-50 flex items-center justify-center">
  <div className="absolute inset-0 bg-gray-900/50" onClick={onCancel} />
  <div className="relative bg-white rounded-lg shadow-xl p-6 w-full max-w-md mx-4">
```

### Zod validation hook (API-01 compliance)
**Source:** `server/src/routes/categories.ts` lines 10–16
**Apply to:** `server/src/routes/persons.ts`, `server/src/routes/summary.ts` (for new `person` query param)
```typescript
const hook = (result: { success: boolean; error?: z.ZodError }, c: any) => {
  if (!result.success && result.error) {
    return c.json({ error: result.error.issues[0]?.message ?? 'Invalid request' }, 400 as const)
  }
}
```

### Typography rules (from prior phases — enforced project-wide)
- `font-semibold` → **banned** — use `font-medium` or `font-bold` only
- `font-normal` → **banned** — use `font-medium` or `font-bold` only
- All existing tabs/modals use `font-medium` throughout — copy that class, never `font-semibold`

---

## No Analog Found

All 16 files have close analogs. No files require RESEARCH.md-only patterns.

---

## Metadata

**Analog search scope:** `server/src/routes/`, `server/src/models/`, `server/src/calc/`, `web/src/components/admin/`, `web/src/pages/`, `web/src/api/`, `web/src/types/`
**Files scanned:** 15 source files read in full
**Pattern extraction date:** 2026-04-22
