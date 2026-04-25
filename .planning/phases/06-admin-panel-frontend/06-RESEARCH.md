# Phase 6: Admin Panel Frontend — Research

**Researched:** 2026-04-22
**Domain:** React 18 + TypeScript + Tailwind CSS — CRUD modals, sortable tables, tab layout
**Confidence:** HIGH

---

## Summary

Phase 6 delivers the Admin panel: three tabs (Data Points, Assets, Categories), each with a
sortable table, Add/Edit modal, and Delete handling. All backend CRUD endpoints are live (Phase 2
complete). The API client in `web/src/api/client.ts` is **fully implemented** — every
create/update/delete function already exists. All TypeScript payload interfaces in
`web/src/types/index.ts` are **already defined**. Nothing needs to be added to the API layer.

The work is entirely UI: creating `web/src/pages/AdminPage.tsx` (replacing the stub),
`web/src/components/admin/{DataPointsTab,AssetsTab,CategoriesTab}.tsx`, and the supporting modal
and confirm-dialog components in `web/src/components/admin/` and optionally
`web/src/components/shared/`. No charting library is used in this phase. The only new
interaction patterns are modal overlays and sortable table columns — both implemented with
plain Tailwind + React state.

One **critical server/ROADMAP mismatch** discovered during research: the ROADMAP describes
editable slug fields ("user can edit before first save"), but the server's POST endpoints for
assets and categories **always derive the id from `toSlug(name)` and ignore any `id` field in
the request body** (id is not in the Zod createSchema for either route). The slug field in the
UI should be a **read-only preview** derived from the name, not an editable input — sending
custom slugs has no effect. The planner must resolve this discrepancy explicitly.

**Primary recommendation:** Build in tab order (shell → DataPoints → Assets → Categories),
keeping `ConfirmDialog` and inline 409 error as reusable patterns established once in
DataPointsTab and referenced in subsequent tabs.

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| ADMIN-01 | Three tabs: Data Points · Assets · Categories | `Admin.tsx` `useState<Tab>` + conditional render; tab bar with active/inactive pill styling |
| ADMIN-02 | Data Points tab: sortable table, Add/Edit modal, Delete confirm | `DataPointsTab.tsx` + `DataPointModal.tsx` + `ConfirmDialog.tsx`; `getDataPoints` + `getAssets`; `ApiError.message` for errors |
| ADMIN-03 | Assets tab: table, Add/Edit modal, Delete blocked with 409 inline | `AssetsTab.tsx` + `AssetModal.tsx`; 409 shape `"Asset is in use by N data point(s)"` shown inline (no confirm dialog) |
| ADMIN-04 | Categories tab: table, Add/Edit modal, Delete blocked with 409 inline; color picker | `CategoriesTab.tsx` + `CategoryModal.tsx`; `<input type="color">`; 409 shape `"Category is in use by N asset(s)"` shown inline |
| ADMIN-05 | Liabilities convention info banner on Categories tab | Static `<div>` info banner at top of CategoriesTab with prescribed copy |
</phase_requirements>

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Tab state (active tab) | Browser / Client | — | Pure `useState<Tab>` in `Admin.tsx` — no persistence needed |
| Table sort state | Browser / Client | — | `useState<{col, dir}>` per tab component — ephemeral UX state |
| Modal open/close state | Browser / Client | — | `useState<{mode, item} \| null>` per tab component |
| CRUD mutations | API / Backend | — | All endpoints already implemented in Phase 2; frontend calls via existing `client.ts` |
| Slug preview derivation | Browser / Client | — | `toSlug(name)` mirrored from server; pure string transform, no server call |
| 409 error display | Browser / Client | — | `ApiError.message` already contains human-readable text from server `{ "error": "..." }` |
| Growth rate ↔ percentage conversion | Browser / Client | — | Multiply × 100 for display, divide ÷ 100 before API call |
| year_month extraction | Browser / Client | — | `<input type="month">` value is already YYYY-MM; use directly, never parse |

---

## Standard Stack

### Core (all already installed)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| react | ^18.3.1 | UI rendering | Already installed |
| typescript | ^5.5.4 | Type safety | Already installed |
| tailwindcss | ^3.4.10 | Utility CSS | Already installed |
| lucide-react | ^1.8.0 | Icons (Pencil, Trash2, Plus, ChevronUp, ChevronDown, X, Info) | Already installed from Phase 5 |

### Supporting (no new dependencies needed)

Phase 6 requires **zero new npm packages**. All required capabilities are covered:
- **Modal/overlay:** pure Tailwind `fixed inset-0 z-50` pattern
- **Icons:** `lucide-react` already installed — `Pencil`, `Trash2`, `Plus`, `ChevronUp`, `ChevronDown`, `X`, `Info` icons needed
- **Form controls:** HTML native `<input type="month">`, `<input type="color">`, `<select>`, `<textarea>`
- **Sort logic:** native `Array.prototype.sort()` with `[...rows].sort(...)` (never mutate state array)

**Installation:**
```bash
# No new packages — lucide-react already installed from Phase 5
cd web && npm run build  # verify tsc clean before starting
```

---

## Architecture Patterns

### System Architecture Diagram

```
User Browser — /admin route
     │
     ▼
┌───────────────────────────────────────────────────────────────┐
│  AdminPage  (web/src/pages/AdminPage.tsx)                     │
│  useState<'datapoints' | 'assets' | 'categories'>            │
│     │                                                         │
│     ├─ Tab bar (3 buttons) ──► active tab styling             │
│     │                                                         │
│     ├─ [active='datapoints'] ──► <DataPointsTab />            │
│     │         │  mount: getDataPoints() + getAssets()         │
│     │         │  state: rows[], assets[], sort, modal         │
│     │         │                                               │
│     │         ├─ Sortable table ──► local sort state          │
│     │         ├─ "Add" btn ──► <DataPointModal mode="create"> │
│     │         ├─ Edit btn  ──► <DataPointModal mode="edit">   │
│     │         └─ Delete btn ──► <ConfirmDialog>               │
│     │                   └─ confirmed ──► deleteDataPoint(id)  │
│     │                                                         │
│     ├─ [active='assets'] ──► <AssetsTab />                    │
│     │         │  mount: getAssets() + getCategories()         │
│     │         ├─ Sortable table                               │
│     │         ├─ <AssetModal mode="create|edit">              │
│     │         └─ Delete btn ──► deleteAsset(id)               │
│     │                   └─ 409 ──► inline error (no dialog)   │
│     │                                                         │
│     └─ [active='categories'] ──► <CategoriesTab />            │
│               │  mount: getCategories()                       │
│               ├─ Liabilities info banner                      │
│               ├─ Sortable table                               │
│               ├─ <CategoryModal mode="create|edit">           │
│               └─ Delete btn ──► deleteCategory(id)            │
│                         └─ 409 ──► inline error (no dialog)   │
└───────────────────────────────────────────────────────────────┘
          │ all API calls via existing client.ts functions
          ▼
   Hono server /api/v1/{data-points,assets,categories}
   (Phase 2 — already implemented)
```

### Recommended Project Structure

```
web/src/
├── pages/
│   └── AdminPage.tsx           # Replace stub — tab shell
├── components/
│   ├── admin/
│   │   ├── DataPointsTab.tsx   # Table + fetch logic
│   │   ├── DataPointModal.tsx  # Create/Edit form
│   │   ├── AssetsTab.tsx       # Table + fetch logic
│   │   ├── AssetModal.tsx      # Create/Edit form
│   │   ├── CategoriesTab.tsx   # Table + fetch logic (+ info banner)
│   │   └── CategoryModal.tsx   # Create/Edit form
│   └── shared/
│       └── ConfirmDialog.tsx   # Generic delete confirm modal (used by DataPointsTab only)
```

### Pattern 1: Admin Tab Shell

```typescript
// web/src/pages/AdminPage.tsx
type Tab = 'datapoints' | 'assets' | 'categories'

export default function AdminPage() {
  const [activeTab, setActiveTab] = useState<Tab>('datapoints')

  const tabs: { id: Tab; label: string }[] = [
    { id: 'datapoints', label: 'Data Points' },
    { id: 'assets',     label: 'Assets' },
    { id: 'categories', label: 'Categories' },
  ]

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-8 py-8">
      {/* Tab bar */}
      <div className="flex gap-1 mb-6 border-b border-gray-200">
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            className={activeTab === t.id
              ? 'px-4 py-2 text-sm font-medium text-blue-600 border-b-2 border-blue-600 -mb-px'
              : 'px-4 py-2 text-sm font-medium text-gray-500 hover:text-gray-900 border-b-2 border-transparent -mb-px transition-colors'
            }
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Active tab content */}
      {activeTab === 'datapoints' && <DataPointsTab />}
      {activeTab === 'assets'     && <AssetsTab />}
      {activeTab === 'categories' && <CategoriesTab />}
    </div>
  )
}
```

### Pattern 2: Sortable Table Column Header

```typescript
// Sort state shape (per-tab component)
const [sort, setSort] = useState<{ col: string; dir: 'asc' | 'desc' }>({ col: 'date', dir: 'desc' })

// Sort toggle on column click
function toggleSort(col: string) {
  setSort(s => s.col === col ? { col, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { col, dir: 'asc' })
}

// Sort icon (lucide ChevronUp / ChevronDown)
// Inactive column: gray muted icon
// Active column: blue icon, direction-appropriate
<th
  className="text-left text-xs font-medium text-gray-500 uppercase tracking-wide cursor-pointer select-none"
  onClick={() => toggleSort('date')}
>
  <span className="flex items-center gap-1">
    Date
    {sort.col === 'date'
      ? (sort.dir === 'asc' ? <ChevronUp size={12} className="text-blue-600" /> : <ChevronDown size={12} className="text-blue-600" />)
      : <ChevronUp size={12} className="text-gray-300" />
    }
  </span>
</th>

// Apply sort to rows (never mutate state array)
const sortedRows = [...rows].sort((a, b) => {
  const mul = sort.dir === 'asc' ? 1 : -1
  // per-column comparator logic
  return mul * a[sort.col].localeCompare(b[sort.col])
})
```

### Pattern 3: Modal Overlay (no third-party library)

```typescript
// web/src/components/shared/ConfirmDialog.tsx
// Same pattern for all modals — fixed overlay + centered card
interface ConfirmDialogProps {
  message: string
  onConfirm: () => void
  onCancel: () => void
}

export default function ConfirmDialog({ message, onConfirm, onCancel }: ConfirmDialogProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-gray-900/50" onClick={onCancel} />
      {/* Card */}
      <div className="relative bg-white rounded-lg shadow-xl p-6 w-full max-w-sm mx-4">
        <p className="text-sm font-medium text-gray-900 mb-4">{message}</p>
        <div className="flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  )
}
```

### Pattern 4: Modal Form with CRUD State

```typescript
// Modal state in tab component — null = closed, object = open
type ModalState =
  | { mode: 'create' }
  | { mode: 'edit'; item: DataPoint }

const [modal, setModal] = useState<ModalState | null>(null)
const [saving, setSaving] = useState(false)
const [saveError, setSaveError] = useState<string | null>(null)

async function handleSave(payload: CreateDataPointPayload | UpdateDataPointPayload) {
  setSaving(true)
  setSaveError(null)
  try {
    if (modal?.mode === 'create') {
      await createDataPoint(payload as CreateDataPointPayload)
    } else {
      await updateDataPoint(modal!.item.id, payload as UpdateDataPointPayload)
    }
    setModal(null)
    await refetch()
  } catch (err) {
    setSaveError(err instanceof ApiError ? err.message : 'Unexpected error')
  } finally {
    setSaving(false)
  }
}
```

### Pattern 5: Inline Delete Error (Assets / Categories — no confirm dialog)

```typescript
// Delete with 409 inline error — no ConfirmDialog for assets/categories
const [deleteError, setDeleteError] = useState<{ id: string; message: string } | null>(null)

async function handleDelete(id: string) {
  setDeleteError(null)
  try {
    await deleteAsset(id)
    await refetch()
  } catch (err) {
    if (err instanceof ApiError && err.status === 409) {
      setDeleteError({ id, message: err.message })
    }
    // 404 or other errors could be shown as toast/banner — keep simple for now
  }
}

// In table row:
{deleteError?.id === asset.id && (
  <p className="text-xs text-red-600 mt-1">{deleteError.message}</p>
)}
```

### Pattern 6: Slug Preview (toSlug — mirrors server exactly)

```typescript
// Must match server/src/routes/assets.ts and categories.ts toSlug() exactly
// [VERIFIED: read server/src/routes/assets.ts and categories.ts]
function toSlug(name: string): string {
  return name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
}

// Usage in modal — updates slug preview when name changes
const [name, setName] = useState(initialName)
const slugPreview = toSlug(name)  // derived, not state

// In edit mode: show as read-only text (server ignored id in PUT anyway)
// In create mode: show as read-only preview (server ignores id in POST, derives from name)
<div>
  <label className="block text-xs font-medium text-gray-500 mb-1">ID / Slug</label>
  <input
    type="text"
    readOnly
    value={modal.mode === 'edit' ? item.id : slugPreview}
    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-gray-50 text-gray-500 cursor-not-allowed"
  />
  <p className="text-xs text-gray-400 mt-1">Auto-generated from name. Immutable after save.</p>
</div>
```

> ⚠️ **Slug is always read-only**: The server's POST endpoints for both assets and categories
> derive `id = toSlug(name)` server-side and do **not** accept `id` in the request body
> (it is not in the Zod createSchema). The `CreateAssetPayload` and `CreateCategoryPayload`
> types include `id` but the server ignores it. The slug field must always be read-only.

### Pattern 7: Growth Rate ↔ Percentage Conversion

```typescript
// Server stores: 0.08 = 8% annual growth (decimal)
// UI displays: 8 (percent input)

// Display: multiply by 100
const displayRate = asset.projected_yearly_growth !== null
  ? (asset.projected_yearly_growth * 100).toString()
  : ''

// Before API call: divide by 100
const storedRate = rateInput !== '' ? parseFloat(rateInput) / 100 : null
// For categories (required): parseFloat(rateInput) / 100

// Display in table: "8.00%" or "Inherits" for null
const rateDisplay = asset.projected_yearly_growth !== null
  ? `${(asset.projected_yearly_growth * 100).toFixed(2)}%`
  : 'Inherits'
```

### Pattern 8: DataPoint Month Picker

```typescript
// <input type="month"> already returns YYYY-MM string — use directly as year_month
// NEVER: new Date(monthInput).toISOString().slice(0, 7) — UTC shift bug
const [yearMonth, setYearMonth] = useState<string>(
  modal.mode === 'edit' ? modal.item.year_month : ''
)

<input
  type="month"
  value={yearMonth}
  onChange={e => setYearMonth(e.target.value)}
  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
  required
/>
// yearMonth is already YYYY-MM — pass directly to CreateDataPointPayload.year_month
```

### Pattern 9: DataPoint asset_id in Edit Mode

```typescript
// Server PUT /data-points/:id rejects asset_id changes with 400
// Asset dropdown must be DISABLED in edit mode
<select
  value={assetId}
  onChange={e => setAssetId(e.target.value)}
  disabled={modal.mode === 'edit'}
  className={`w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500
    ${modal.mode === 'edit' ? 'bg-gray-50 text-gray-500 cursor-not-allowed' : 'bg-white'}`}
>
  {assets.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
</select>
```

### Pattern 10: Liabilities Info Banner

```typescript
// Top of CategoriesTab — per ROADMAP Plan 6.3
<div className="flex items-start gap-3 bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
  <Info size={16} className="text-blue-600 mt-0.5 flex-shrink-0" />
  <p className="text-sm font-medium text-blue-700">
    To track debts, create a category (e.g. 'Liabilities') and enter asset values as negative
    numbers. The total net worth chart will subtract them automatically.
  </p>
</div>
```

### Anti-Patterns to Avoid

- **Parse month input into Date:** `new Date(yearMonth)` is UTC-based — produces wrong month for UTC+ users. Use `yearMonth` string directly.
- **Mutate rows array for sorting:** `rows.sort(...)` mutates in place and may not trigger re-render. Always `[...rows].sort(...)`.
- **Send `id` in asset/category POST expecting server to use it:** Server ignores it. Slug is always `toSlug(name)`.
- **Editable slug field:** Confusing UX since server always overrides. Keep as read-only preview.
- **Show ConfirmDialog for asset/category deletes:** These have protected deletes (409 inline errors), not confirmation dialogs. Only DataPoint deletes use ConfirmDialog.
- **Use `font-semibold` or `font-normal`:** Banned by typography contract. Only `font-bold` (display values) and `font-medium` (everything else).
- **Hardcode localhost in API calls:** Use `client.ts` functions which use relative `/api/v1/...` path.
- **Use green-500 or red-500:** Palette uses `green-600` and `red-600` specifically.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Modal overlay | Custom portal library | `fixed inset-0 z-50` Tailwind + React state | No portal needed for single-page admin; z-index layering is sufficient |
| Form validation | Custom validation framework | HTML5 `required` + inline `setSaveError` | Server returns clear `{ error: "..." }` messages; duplicate them client-side only for UX speed |
| Icon library | Custom SVGs | `lucide-react` (already installed) | Consistent with Phase 5; Pencil, Trash2, Plus, ChevronUp, ChevronDown, X, Info already available |
| Currency formatting | Custom formatter | `Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' })` module-scope instance | Established in Phase 5 (SummaryCards.tsx) — replicate the same pattern |
| Slug generation | Custom logic | Exact mirror of server `toSlug()` | Must match server exactly to show correct preview |

---

## Critical Server Contract Details

### 409 Error Response Shapes

All 409 responses follow `{ "error": "message" }` per API-01. The `ApiError` class extracts
`body.error` as `err.message`.

| Route | 409 Trigger | `err.message` value |
|-------|------------|---------------------|
| `DELETE /categories/:id` | Category has assets | `"Category is in use by N asset(s)"` |
| `DELETE /assets/:id` | Asset has data points | `"Asset is in use by N data point(s)"` |
| `POST /categories` | Slug collision | `"Category with id '${id}' already exists"` |
| `POST /assets` | Slug collision | `"Asset with id '${id}' already exists"` |

> **Note:** Slug collision on POST is rare since server derives id from name, but possible
> if user creates "My Asset" and the slug `my-asset` already exists. Display the 409 message
> inline in the modal form (same `saveError` state).

### Server Validation Rules (Replicate in Frontend)

| Entity | Field | Rule | Client-side gate |
|--------|-------|------|-----------------|
| DataPoint | `value` | `> 0` (positive) | `value <= 0 → "Value must be greater than 0"` |
| DataPoint | `year_month` | `/^\d{4}-\d{2}$/` | `<input type="month">` enforces format natively |
| DataPoint | `asset_id` | required | dropdown required; disabled on edit |
| Asset | `name` | min length 1 | `name.trim() === ''` check |
| Asset | `category_id` | required | dropdown required |
| Asset | `projected_yearly_growth` | nullable number | empty string → `null` |
| Category | `name` | min length 1 | `name.trim() === ''` check |
| Category | `projected_yearly_growth` | required number | required; empty → block submit |
| Category | `color` | `/^#[0-9a-fA-F]{6}$/` | `<input type="color">` always returns valid hex |

### DataPoint PUT — Immutable Fields

```
PUT /api/v1/data-points/:id accepts:
  year_month  — updatable
  value       — updatable
  notes       — updatable
  asset_id    — ACCEPTED but throws 400 if different from stored value → disable asset dropdown in edit
  id          — ACCEPTED but throws 400 if different from URL param

NEVER changes: id, asset_id, created_at
ALWAYS refreshes: updated_at (server sets it)
```

### Asset PUT — Immutable Fields

```
PUT /api/v1/assets/:id accepts:
  name, category_id, projected_yearly_growth, location, notes — all updatable
  id  — accepted but throws 400 if different → id field disabled/hidden in edit form

NEVER changes: id, created_at
```

### Category PUT — Immutable Fields

```
PUT /api/v1/categories/:id accepts:
  name, projected_yearly_growth, color — all updatable
  id — accepted but throws 400 if different → id field disabled/hidden in edit form

NEVER changes: id
```

---

## API Client — Completeness Audit

**Result: Fully implemented. No additions needed.**

| Function | Exists | Notes |
|----------|--------|-------|
| `getDataPoints()` | ✅ | Returns `DataPoint[]` sorted by `year_month` desc (server-side) |
| `createDataPoint(data)` | ✅ | POST; returns `DataPoint` with server-assigned `id`, `created_at`, `updated_at` |
| `updateDataPoint(id, data)` | ✅ | PUT; returns updated `DataPoint` |
| `deleteDataPoint(id)` | ✅ | DELETE; returns `void` (204 handled correctly) |
| `getAssets()` | ✅ | Returns `Asset[]` |
| `createAsset(data)` | ✅ | POST; server assigns `id = toSlug(name)`, `created_at` |
| `updateAsset(id, data)` | ✅ | PUT |
| `deleteAsset(id)` | ✅ | DELETE; 204 for success, 409 for in-use |
| `getCategories()` | ✅ | Returns `Category[]` |
| `createCategory(data)` | ✅ | POST; server assigns `id = toSlug(name)` |
| `updateCategory(id, data)` | ✅ | PUT |
| `deleteCategory(id)` | ✅ | DELETE; 204 for success, 409 for in-use |

> **Important:** DELETE responses for assets and categories return `{ success: true }` (200)
> with a JSON body, **not** 204 No Content. The `apiFetch` wrapper checks
> `res.status === 204 || res.headers.get('content-length') === '0'` for the no-content case.
> Since the server returns 200 + `{ success: true }`, `apiFetch` will call `.json()` and
> return `{ success: true }` as the `T` type. Since these functions are typed as
> `Promise<void>`, the return value is unused — this is safe. No change needed.

## TypeScript Interfaces — Completeness Audit

**Result: Fully implemented. No additions needed.**

All payload interfaces in `web/src/types/index.ts` are defined:
- `CreateCategoryPayload` / `UpdateCategoryPayload`
- `CreateAssetPayload` / `UpdateAssetPayload`
- `CreateDataPointPayload` / `UpdateDataPointPayload`

---

## Existing Component Patterns (carry forward from Phase 5)

| Pattern | Source | Carry Forward As-Is |
|---------|--------|---------------------|
| EUR formatter | `SummaryCards.tsx` line 4 | `const eurFormatter = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' })` at module scope |
| Error banner | `DashboardPage.tsx` lines 79–90 | `bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-700` |
| Loading skeleton | `DashboardPage.tsx` line 96 | `animate-pulse bg-gray-100 rounded-lg` |
| Table row hover | (new in Phase 6) | `hover:bg-gray-50 transition-colors` on `<tr>` |
| Focus ring | Phase 5 nav | `focus:outline-none focus:ring-2 focus:ring-blue-500` on inputs |
| Card container | `SummaryCards.tsx` | `bg-white rounded-lg border border-gray-200 p-6` |
| fetch pattern | `DashboardPage.tsx` | `useEffect` with `cancelled` flag; `setLoading(true)` → fetch → `setLoading(false)` |

---

## Common Pitfalls

### Pitfall 1: Slug field showing as editable
**What goes wrong:** User edits slug in create mode, submits — server ignores the slug and derives it from the name. User expects their custom slug but gets `toSlug(name)` instead.
**Why it happens:** ROADMAP says "user can edit before first save" but server doesn't accept `id` in POST body.
**How to avoid:** Make slug field `readOnly` in all cases (create + edit). Show informational text: "Auto-generated from name."
**Warning signs:** `CreateAssetPayload` and `CreateCategoryPayload` both have `id` field but server `createSchema` does not.

### Pitfall 2: Sorting mutates state array
**What goes wrong:** `rows.sort(comparator)` mutates `rows` in place. On re-render, React sees same array reference, doesn't update.
**Why it happens:** `Array.prototype.sort()` is in-place.
**How to avoid:** Always `[...rows].sort(comparator)` — spread creates new array.

### Pitfall 3: Growth rate confusion (decimal vs percent)
**What goes wrong:** User enters `8` meaning 8%, form sends `8` to API, server stores `8.0` = 800% growth.
**Why it happens:** Server stores decimal, UI shows percent.
**How to avoid:** Divide by 100 on submit (`parseFloat(input) / 100`); multiply by 100 on display (`growth * 100`). Document the conversion in code comments.

### Pitfall 4: DataPoint edit mode with asset dropdown enabled
**What goes wrong:** User changes asset in edit modal, submits → server returns 400 `"asset_id cannot be changed"`.
**Why it happens:** DataPoint PUT rejects `asset_id` changes.
**How to avoid:** Disable asset `<select>` in edit mode (`disabled={modal.mode === 'edit'}`).

### Pitfall 5: Month picker using toISOString()
**What goes wrong:** `new Date(monthInput).toISOString().slice(0, 7)` shifts month for UTC+ users. E.g., January 2024 → December 2023.
**Why it happens:** `toISOString()` converts to UTC.
**How to avoid:** `<input type="month">` value is already `YYYY-MM` — use it directly.

### Pitfall 6: ConfirmDialog on Asset/Category deletes
**What goes wrong:** Adding a confirm dialog before asset/category deletes adds friction and doesn't match the ROADMAP spec.
**Why it happens:** Designers conflate all delete patterns.
**How to avoid:** Only DataPoint deletes get ConfirmDialog. Asset/Category deletes call the API immediately and show 409 errors inline.

### Pitfall 7: `font-semibold` or `font-normal` in new components
**What goes wrong:** Typography contract broken — design becomes inconsistent.
**Why it happens:** Default tendency when writing new components.
**How to avoid:** Only `font-bold` (display values only) and `font-medium` (everything else).

---

## Component File Map

| File | Replaces/Creates | Key Props |
|------|-----------------|-----------|
| `pages/AdminPage.tsx` | Replaces stub | — |
| `components/admin/DataPointsTab.tsx` | Creates | — |
| `components/admin/DataPointModal.tsx` | Creates | `mode: 'create' \| 'edit'`, `item?: DataPoint`, `assets: Asset[]`, `onSave`, `onClose` |
| `components/admin/AssetsTab.tsx` | Creates | — |
| `components/admin/AssetModal.tsx` | Creates | `mode: 'create' \| 'edit'`, `item?: Asset`, `categories: Category[]`, `onSave`, `onClose` |
| `components/admin/CategoriesTab.tsx` | Creates | — |
| `components/admin/CategoryModal.tsx` | Creates | `mode: 'create' \| 'edit'`, `item?: Category`, `onSave`, `onClose` |
| `components/shared/ConfirmDialog.tsx` | Creates | `message: string`, `onConfirm`, `onCancel` |

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Dialog/Modal libraries (react-modal) | Pure Tailwind `fixed inset-0` + React state | Phase 5 decision (no component library) | No extra dependency; consistent with existing stack |
| External form libraries (react-hook-form) | Native HTML5 form controls + `useState` per field | Phase 5 decision | Simple admin forms don't justify a form library |

**No deprecated patterns apply to this phase.**

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | ConfirmDialog only for DataPoint deletes; asset/category deletes show inline 409 errors directly (no confirm) | Architecture Patterns, Anti-Patterns | Low — ROADMAP Plan 6.1 says "Delete shows a `<ConfirmDialog>`"; Plans 6.2 and 6.3 say "displays the 409 error message inline" — this distinction is from the ROADMAP text |
| A2 | Slug field is always read-only (server ignores id in POST) | Pattern 6, Critical Pitfall 1 | Medium — ROADMAP says "user can edit before first save" but server doesn't support it; planner should confirm |
| A3 | Tab content is conditionally rendered (unmounts on tab switch), not hidden/shown | Pattern 1 | Low — conditional render is simpler; data refetches on tab switch which is acceptable for an admin panel |

---

## Open Questions (RESOLVED)

1. **Editable slug fields**
   - What we know: ROADMAP says "user can edit before first save"; server derives id from `toSlug(name)` and ignores body `id`
   - What's unclear: Was the ROADMAP written expecting the server to accept a custom id, or is the slug display purely informational?
   - Recommendation: Make slug read-only (matching server behavior). If editable slug support is desired, a server route change to accept `id` in createSchema is needed — out of Phase 6 scope.
   - RESOLVED: Slug field is read-only in all modals (create + edit). Server always derives id from `toSlug(name)` and ignores the `id` field in POST body. Plans 06-02 and 06-03 enforce this consistently.

2. **Table initial sort order**
   - What we know: ROADMAP says "sortable table" but doesn't specify default sort
   - What's unclear: Should Data Points default to date desc (newest first, matching server GET order)?
   - Recommendation: Data Points → `year_month` desc (matches `GET /data-points` order); Assets → `name` asc; Categories → `name` asc.
   - RESOLVED: DataPoints default sort = `year_month` DESC (newest first); Assets and Categories default sort = `name` ASC. Implemented in all three plans.

---

## Environment Availability

Step 2.6: SKIPPED (no external dependencies — Phase 6 uses zero new npm packages; all tools are already installed from Phase 5).

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | None installed |
| Config file | None — Wave 0 gap |
| Quick run command | N/A until framework installed |
| Full suite command | N/A until framework installed |

> **Note:** No test framework (vitest, jest) is present in `web/package.json` or configured.
> `nyquist_validation: true` is set in config. All Phase 6 tests are **Wave 0 gaps**.
> Admin CRUD flows are DOM-interaction-heavy and primarily suited to manual smoke testing
> or e2e (Playwright/Cypress). Unit-testable pieces are the pure functions (`toSlug`, growth
> rate conversion, sort comparators).

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Notes |
|--------|----------|-----------|-------|
| ADMIN-01 | Tab switching renders correct tab | smoke | Manual browser check |
| ADMIN-02 | DataPoint create → row appears | smoke | Manual browser check |
| ADMIN-02 | DataPoint edit → updates row | smoke | Manual browser check |
| ADMIN-02 | DataPoint delete confirm → row removed | smoke | Manual browser check |
| ADMIN-02 | value ≤ 0 → inline validation error | smoke | Manual browser check |
| ADMIN-03 | Asset slug auto-previews from name | unit | `toSlug('My Asset') === 'my-asset'` |
| ADMIN-03 | Growth rate 8 → stored 0.08 | unit | `parseFloat('8') / 100 === 0.08` |
| ADMIN-03 | Delete asset with data points → 409 inline | smoke | Manual browser check |
| ADMIN-04 | Category color picker returns valid hex | smoke | Manual browser check |
| ADMIN-04 | Delete category with assets → 409 inline | smoke | Manual browser check |
| ADMIN-05 | Liabilities banner visible on Categories tab | smoke | Manual browser check |

### Wave 0 Gaps

All tests are Wave 0 gaps (no test framework installed). If unit tests are desired:

- [ ] Install `vitest` + `@testing-library/react` + `jsdom`
- [ ] `web/vite.config.ts` — add `test: { environment: 'jsdom' }` block
- [ ] `web/src/utils/slug.test.ts` — covers `toSlug()` function (extract from modal to shared util)
- [ ] `web/src/utils/growthRate.test.ts` — covers `%→decimal` and `decimal→%` conversions

> **Recommendation:** Given the admin panel is form-heavy DOM work, prioritize manual smoke
> testing per the ROADMAP verification checklists over automated tests in this phase.

---

## Security Domain

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | No | No auth in this project (single household, trust network) |
| V3 Session Management | No | No sessions |
| V4 Access Control | No | No roles |
| V5 Input Validation | Yes | HTML5 `required` + client-side checks replicate server Zod rules; server is authoritative |
| V6 Cryptography | No | No crypto in frontend |

| Threat Pattern | STRIDE | Standard Mitigation |
|----------------|--------|---------------------|
| XSS via user-entered names | Tampering | React JSX escapes by default; never use `dangerouslySetInnerHTML` |
| Hardcoded localhost API URL | Spoofing | Relative URL `/api/v1/...` in `client.ts` — verified as existing pattern |
| Sending wrong `asset_id` on DataPoint PUT | Tampering | Server rejects with 400; disable dropdown in edit mode |

---

## Sources

### Primary (HIGH confidence)
- `server/src/routes/categories.ts` — exact toSlug(), createSchema, updateSchema, 409 messages [VERIFIED: read file]
- `server/src/routes/assets.ts` — exact toSlug(), createSchema, 409 messages [VERIFIED: read file]
- `server/src/routes/dataPoints.ts` — updateSchema, immutable fields, 400 guards [VERIFIED: read file]
- `web/src/api/client.ts` — all CRUD functions confirmed complete [VERIFIED: read file]
- `web/src/types/index.ts` — all payload interfaces confirmed present [VERIFIED: read file]
- `web/src/components/Nav.tsx` — existing component patterns, className conventions [VERIFIED: read file]
- `web/src/components/SummaryCards.tsx` — EUR formatter, typography, color patterns [VERIFIED: read file]
- `web/src/pages/DashboardPage.tsx` — fetch pattern, error/loading patterns [VERIFIED: read file]
- `.planning/phases/05-dashboard-frontend/05-UI-SPEC.md` — typography + color contract [VERIFIED: read file]
- `.planning/ROADMAP.md` Phase 6 section (lines 308–351) — tab, modal, sort requirements [VERIFIED: read file]

### Secondary (MEDIUM confidence)
- `.planning/phases/05-dashboard-frontend/05-RESEARCH.md` — Phase 5 pattern carryforward [VERIFIED: read file]

---

## Metadata

**Confidence breakdown:**
- API completeness audit: HIGH — read all files, confirmed all functions exist
- Server contract (409 shapes, validation): HIGH — read all route files
- Slug mismatch finding: HIGH — verified in both frontend types and server route schemas
- Architecture patterns (modal overlay, sort): HIGH — standard React patterns well-established
- Tailwind class choices: HIGH — all classes verified against Phase 5 UI-SPEC and existing components

**Research date:** 2026-04-22
**Valid until:** 2026-05-22 (stable stack; no new dependencies)
