# Phase 6: Admin Panel Frontend — Pattern Map

**Mapped:** 2026-04-22
**Files analyzed:** 9 new/modified files
**Analogs found:** 5 / 9 (4 files have no codebase analog — use RESEARCH.md patterns)

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `web/src/pages/AdminPage.tsx` | page / tab shell | request-response | `web/src/pages/DashboardPage.tsx` | role-match (tab state vs range state) |
| `web/src/components/admin/DataPointsTab.tsx` | component | CRUD | `web/src/pages/DashboardPage.tsx` | partial (fetch + error; no CRUD in dashboard) |
| `web/src/components/admin/AssetsTab.tsx` | component | CRUD | `web/src/pages/DashboardPage.tsx` | partial |
| `web/src/components/admin/CategoriesTab.tsx` | component | CRUD | `web/src/pages/DashboardPage.tsx` | partial |
| `web/src/components/admin/DataPointModal.tsx` | component | CRUD | *(no analog)* | none |
| `web/src/components/admin/AssetModal.tsx` | component | CRUD | *(no analog)* | none |
| `web/src/components/admin/CategoryModal.tsx` | component | CRUD | *(no analog)* | none |
| `web/src/components/admin/ConfirmDialog.tsx` | component | request-response | *(no analog)* | none |
| `web/src/components/admin/shared.tsx` (optional) | utility | — | `web/src/components/ChartTypeSelector.tsx` | partial (button group active state) |

---

## Pattern Assignments

### `web/src/pages/AdminPage.tsx` (page, tab shell)

**Analog:** `web/src/pages/DashboardPage.tsx`

**Imports pattern** (DashboardPage.tsx lines 1–7):
```typescript
import { useState, useEffect } from 'react'
import { getSummary, ApiError } from '../api/client'
import type { SummaryResponse } from '../types/index'
import type { RangeKey } from '../types/index'
import ChartTypeSelector, { useChartType } from '../components/ChartTypeSelector'
import WealthChart from '../components/WealthChart'
import SummaryCards from '../components/SummaryCards'
```
→ **Copy structure:** named React hooks + named api imports + type imports. For AdminPage:
```typescript
import { useState } from 'react'
import DataPointsTab from '../components/admin/DataPointsTab'
import AssetsTab from '../components/admin/AssetsTab'
import CategoriesTab from '../components/admin/CategoriesTab'
```

**Tab state pattern** — derive from range-button pattern (DashboardPage.tsx lines 21, 60–72):
```typescript
// DashboardPage range pill: active = blue-600 bg + border; inactive = white bg, gray-200 border
const [range, setRange] = useState<RangeKey>('1y')

// Active pill class:
'bg-blue-600 border border-blue-600 text-white rounded-full px-3 py-1 text-xs font-medium cursor-pointer'
// Inactive pill class:
'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50 rounded-full px-3 py-1 text-xs font-medium transition-colors cursor-pointer'
```
→ **Adapt to underline-tab style** from RESEARCH.md Pattern 1:
```typescript
type Tab = 'datapoints' | 'assets' | 'categories'
const [activeTab, setActiveTab] = useState<Tab>('datapoints')

// Active tab class:
'px-4 py-2 text-sm font-medium text-blue-600 border-b-2 border-blue-600 -mb-px'
// Inactive tab class:
'px-4 py-2 text-sm font-medium text-gray-500 hover:text-gray-900 border-b-2 border-transparent -mb-px transition-colors'
```

**Page layout pattern** (DashboardPage.tsx lines 54–56):
```typescript
<div className="min-h-screen bg-gray-50">
  <div className="max-w-7xl mx-auto px-4 sm:px-8 py-8">
    {/* content */}
  </div>
</div>
```
→ AdminPage omits `min-h-screen bg-gray-50` (App.tsx already wraps with it — see App.tsx line 9). Use:
```typescript
<div className="max-w-7xl mx-auto px-4 sm:px-8 py-8">
  {/* tab bar + active tab content */}
</div>
```

**Page title** (DashboardPage.tsx lines 29–31):
```typescript
useEffect(() => {
  document.title = 'Dashboard — WealthTrack'
}, [])
```
→ Copy exactly, change title to `'Admin — WealthTrack'`.

---

### `web/src/components/admin/DataPointsTab.tsx` (component, CRUD)

**Analog:** `web/src/pages/DashboardPage.tsx`

**Fetch + loading/error/retry pattern** (DashboardPage.tsx lines 22–51):
```typescript
const [data, setData] = useState<SummaryResponse | null>(null)
const [loading, setLoading] = useState(true)
const [error, setError] = useState<string | null>(null)
const [retryCount, setRetryCount] = useState(0)

useEffect(() => {
  let cancelled = false
  setLoading(true)
  setError(null)
  getSummary(range)
    .then(result => {
      if (!cancelled) setData(result)
    })
    .catch(err => {
      if (!cancelled) {
        setError(err instanceof ApiError ? err.message : 'Unexpected error')
      }
    })
    .finally(() => {
      if (!cancelled) setLoading(false)
    })
  return () => { cancelled = true }
}, [range, retryCount])
```
→ **Copy this pattern exactly** for DataPointsTab. Replace `getSummary(range)` with parallel fetches:
```typescript
const [rows, setRows] = useState<DataPoint[]>([])
const [assets, setAssets] = useState<Asset[]>([])
const [loading, setLoading] = useState(true)
const [error, setError] = useState<string | null>(null)
const [retryCount, setRetryCount] = useState(0)

useEffect(() => {
  let cancelled = false
  setLoading(true)
  setError(null)
  Promise.all([getDataPoints(), getAssets()])
    .then(([pts, ast]) => {
      if (!cancelled) { setRows(pts); setAssets(ast) }
    })
    .catch(err => {
      if (!cancelled) setError(err instanceof ApiError ? err.message : 'Unexpected error')
    })
    .finally(() => { if (!cancelled) setLoading(false) })
  return () => { cancelled = true }
}, [retryCount])
```

**Error banner pattern** (DashboardPage.tsx lines 78–89):
```typescript
{error && (
  <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
    <p className="text-red-700 font-medium text-sm">Could not load data</p>
    <p className="text-red-600 text-sm mt-1">Check your connection and refresh the page.</p>
    <button
      onClick={() => setRetryCount(c => c + 1)}
      className="mt-2 text-sm font-medium text-red-700 underline"
    >
      Retry loading data
    </button>
  </div>
)}
```

**Loading skeleton pattern** (DashboardPage.tsx lines 92–99):
```typescript
{loading ? (
  <div className="h-24 bg-gray-100 rounded-lg animate-pulse" />
) : /* table */ null}
```

**CRUD modal state + save pattern** — no codebase analog; use RESEARCH.md Pattern 4:
```typescript
type ModalState = { mode: 'create' } | { mode: 'edit'; item: DataPoint }
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
    setRetryCount(c => c + 1)   // triggers refetch via useEffect dep
  } catch (err) {
    setSaveError(err instanceof ApiError ? err.message : 'Unexpected error')
  } finally {
    setSaving(false)
  }
}
```

**Sortable table header pattern** — no codebase analog; use RESEARCH.md Pattern 2:
```typescript
// Icons: ChevronUp, ChevronDown from lucide-react (see Nav.tsx for icon import style)
import { ChevronUp, ChevronDown, Plus, Pencil, Trash2 } from 'lucide-react'

const [sort, setSort] = useState<{ col: string; dir: 'asc' | 'desc' }>({ col: 'year_month', dir: 'desc' })

function toggleSort(col: string) {
  setSort(s => s.col === col ? { col, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { col, dir: 'asc' })
}

const sortedRows = [...rows].sort((a, b) => {
  const mul = sort.dir === 'asc' ? 1 : -1
  // per-column comparator
})

// Column header JSX:
<th
  className="text-left text-xs font-medium text-gray-500 uppercase tracking-wide cursor-pointer select-none px-4 py-3"
  onClick={() => toggleSort('year_month')}
>
  <span className="flex items-center gap-1">
    Date
    {sort.col === 'year_month'
      ? (sort.dir === 'asc' ? <ChevronUp size={12} className="text-blue-600" /> : <ChevronDown size={12} className="text-blue-600" />)
      : <ChevronUp size={12} className="text-gray-300" />
    }
  </span>
</th>
```

**EUR formatting** (SummaryCards.tsx lines 4, 33, 62):
```typescript
// Module-scope instance — do NOT recreate per render
const eurFormatter = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' })

// Usage:
eurFormatter.format(row.value)
```

**Icon import pattern** (Nav.tsx line 3, ChartTypeSelector.tsx line 2):
```typescript
import { Menu, X } from 'lucide-react'
import { AreaChart, LineChart, BarChart2 } from 'lucide-react'
// → For admin tabs:
import { Plus, Pencil, Trash2, ChevronUp, ChevronDown, X, Info } from 'lucide-react'
// Icon usage: <Pencil size={14} /> — always pass explicit size
```

---

### `web/src/components/admin/AssetsTab.tsx` (component, CRUD)

**Analog:** `web/src/pages/DashboardPage.tsx` (same fetch/error pattern)

**All patterns identical to DataPointsTab** with these differences:

**Fetch:** `Promise.all([getAssets(), getCategories()])` instead of data points + assets.

**Inline delete error pattern** — no codebase analog; use RESEARCH.md Pattern 5:
```typescript
// 409 inline — no ConfirmDialog for assets
const [deleteError, setDeleteError] = useState<{ id: string; message: string } | null>(null)

async function handleDelete(id: string) {
  setDeleteError(null)
  try {
    await deleteAsset(id)
    setRetryCount(c => c + 1)
  } catch (err) {
    if (err instanceof ApiError && err.status === 409) {
      setDeleteError({ id, message: err.message })
    }
  }
}

// In table row JSX (after action buttons):
{deleteError?.id === asset.id && (
  <p className="text-xs text-red-600 mt-1">{deleteError.message}</p>
)}
```

**Growth rate display** — no codebase analog; use RESEARCH.md Pattern 7:
```typescript
// Table cell: "8.00%" or "Inherits" (for null)
const rateDisplay = asset.projected_yearly_growth !== null
  ? `${(asset.projected_yearly_growth * 100).toFixed(2)}%`
  : 'Inherits'
```

---

### `web/src/components/admin/CategoriesTab.tsx` (component, CRUD)

**Analog:** `web/src/pages/DashboardPage.tsx` (same fetch/error pattern)

**All patterns identical to AssetsTab** (inline delete, not ConfirmDialog) with:

**Fetch:** `getCategories()` only (single resource, no parallel fetch needed).

**Liabilities info banner** — use RESEARCH.md Pattern 10:
```typescript
import { Info } from 'lucide-react'

// Top of component JSX, before table:
<div className="flex items-start gap-3 bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
  <Info size={16} className="text-blue-600 mt-0.5 flex-shrink-0" />
  <p className="text-sm font-medium text-blue-700">
    To track debts, create a category (e.g. 'Liabilities') and enter asset values as negative
    numbers. The total net worth chart will subtract them automatically.
  </p>
</div>
```

**Color swatch in table cell** — copy color dot pattern from SummaryCards.tsx lines 56–60:
```typescript
// SummaryCards.tsx shows colored dot beside category name:
<span
  className="w-2 h-2 rounded-full flex-shrink-0"
  style={{ backgroundColor: row.color }}
/>
// → For categories table, show larger swatch:
<span
  className="w-4 h-4 rounded border border-gray-200 flex-shrink-0"
  style={{ backgroundColor: category.color }}
/>
```

---

### `web/src/components/admin/DataPointModal.tsx` (component, CRUD form)

**Analog:** None in codebase. Use RESEARCH.md Patterns 3, 4, 8, 9.

**Modal overlay shell** (RESEARCH.md Pattern 3):
```typescript
// Fixed overlay + centered card — standard for ALL modal components
<div className="fixed inset-0 z-50 flex items-center justify-center">
  {/* Backdrop — click to cancel */}
  <div className="absolute inset-0 bg-gray-900/50" onClick={onCancel} />
  {/* Card */}
  <div className="relative bg-white rounded-lg shadow-xl p-6 w-full max-w-md mx-4">
    {/* Header */}
    <div className="flex items-center justify-between mb-4">
      <h2 className="text-sm font-medium text-gray-900">
        {mode === 'create' ? 'Add Data Point' : 'Edit Data Point'}
      </h2>
      <button onClick={onCancel} className="text-gray-400 hover:text-gray-600">
        <X size={16} />
      </button>
    </div>
    {/* Form body */}
    {/* ... */}
    {/* Error */}
    {saveError && (
      <p className="text-xs text-red-600 mt-2">{saveError}</p>
    )}
    {/* Actions */}
    <div className="flex justify-end gap-2 mt-4">
      <button
        onClick={onCancel}
        className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
      >
        Cancel
      </button>
      <button
        type="submit"
        disabled={saving}
        className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
      >
        {saving ? 'Saving…' : 'Save'}
      </button>
    </div>
  </div>
</div>
```

**Form input styling** — establish standard once here, reuse across all modals:
```typescript
// Text/number input:
<input
  type="text"
  value={name}
  onChange={e => setName(e.target.value)}
  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
  required
/>

// Read-only / disabled input (slug preview, disabled dropdown):
className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-gray-50 text-gray-500 cursor-not-allowed"

// Select:
<select
  value={assetId}
  onChange={e => setAssetId(e.target.value)}
  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
  required
>

// Textarea:
<textarea
  value={notes}
  onChange={e => setNotes(e.target.value)}
  rows={2}
  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
/>

// Label:
<label className="block text-xs font-medium text-gray-500 mb-1">Field Name</label>
```

**Month picker** (RESEARCH.md Pattern 8):
```typescript
// <input type="month"> already returns YYYY-MM — use directly
const [yearMonth, setYearMonth] = useState(
  mode === 'edit' ? item.year_month : ''
)
<input
  type="month"
  value={yearMonth}
  onChange={e => setYearMonth(e.target.value)}
  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
  required
/>
// Pass yearMonth directly to payload — NEVER parse into Date
```

**Asset dropdown disabled in edit** (RESEARCH.md Pattern 9):
```typescript
<select
  disabled={mode === 'edit'}
  className={`w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500
    ${mode === 'edit' ? 'bg-gray-50 text-gray-500 cursor-not-allowed' : 'bg-white'}`}
>
```

**Props interface:**
```typescript
interface DataPointModalProps {
  mode: 'create' | 'edit'
  item?: DataPoint          // present only when mode === 'edit'
  assets: Asset[]           // passed down from DataPointsTab
  saving: boolean
  saveError: string | null
  onSave: (payload: CreateDataPointPayload | UpdateDataPointPayload) => void
  onCancel: () => void
}
```

---

### `web/src/components/admin/AssetModal.tsx` (component, CRUD form)

**Analog:** None in codebase. Copy `DataPointModal.tsx` modal shell pattern.

**Slug preview pattern** (RESEARCH.md Pattern 6):
```typescript
// Pure function — must mirror server/src/routes/assets.ts toSlug() exactly
function toSlug(name: string): string {
  return name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
}

const slugPreview = toSlug(name)  // derived value, NOT state

// Slug field (always read-only):
<input
  type="text"
  readOnly
  value={mode === 'edit' ? item!.id : slugPreview}
  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-gray-50 text-gray-500 cursor-not-allowed"
/>
<p className="text-xs text-gray-400 mt-1">Auto-generated from name. Immutable after save.</p>
```

**Growth rate input** (RESEARCH.md Pattern 7):
```typescript
// Initialize: stored 0.08 → display "8"
const [rateInput, setRateInput] = useState(
  item?.projected_yearly_growth !== null && item?.projected_yearly_growth !== undefined
    ? (item.projected_yearly_growth * 100).toString()
    : ''
)

// On save: display "8" → stored 0.08
const storedRate = rateInput !== '' ? parseFloat(rateInput) / 100 : null
```

**Props interface:**
```typescript
interface AssetModalProps {
  mode: 'create' | 'edit'
  item?: Asset
  categories: Category[]    // passed down from AssetsTab
  saving: boolean
  saveError: string | null
  onSave: (payload: CreateAssetPayload | UpdateAssetPayload) => void
  onCancel: () => void
}
```

---

### `web/src/components/admin/CategoryModal.tsx` (component, CRUD form)

**Analog:** None in codebase. Copy `AssetModal.tsx` modal shell + slug pattern.

**Color picker** (RESEARCH.md ADMIN-04):
```typescript
const [color, setColor] = useState(item?.color ?? '#6366f1')

<input
  type="color"
  value={color}
  onChange={e => setColor(e.target.value)}
  className="h-9 w-16 px-1 py-1 border border-gray-200 rounded-lg cursor-pointer"
/>
// <input type="color"> always returns valid #rrggbb hex — no validation needed
```

**Growth rate — REQUIRED for categories** (unlike assets where null is allowed):
```typescript
// Category.projected_yearly_growth is required (not nullable)
const [rateInput, setRateInput] = useState(
  item ? (item.projected_yearly_growth * 100).toString() : ''
)
// Validate: rateInput === '' → block submit ("Growth rate is required")
const storedRate = parseFloat(rateInput) / 100   // no null fallback for categories
```

**Props interface:**
```typescript
interface CategoryModalProps {
  mode: 'create' | 'edit'
  item?: Category
  saving: boolean
  saveError: string | null
  onSave: (payload: CreateCategoryPayload | UpdateCategoryPayload) => void
  onCancel: () => void
}
```

---

### `web/src/components/admin/ConfirmDialog.tsx` (component, request-response)

**Analog:** None in codebase. This is the first modal — establishes the pattern.

**Full implementation** (RESEARCH.md Pattern 3):
```typescript
interface ConfirmDialogProps {
  message: string
  onConfirm: () => void
  onCancel: () => void
}

export default function ConfirmDialog({ message, onConfirm, onCancel }: ConfirmDialogProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-gray-900/50" onClick={onCancel} />
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

**Usage in DataPointsTab only** — AssetsTab and CategoriesTab use inline error, NOT ConfirmDialog:
```typescript
// DataPointsTab state:
const [confirmId, setConfirmId] = useState<string | null>(null)

// In table row: <button onClick={() => setConfirmId(row.id)}><Trash2 size={14} /></button>

// Below table:
{confirmId && (
  <ConfirmDialog
    message="Delete this data point? This cannot be undone."
    onConfirm={async () => { await deleteDataPoint(confirmId); setConfirmId(null); setRetryCount(c => c+1) }}
    onCancel={() => setConfirmId(null)}
  />
)}
```

---

### `web/src/components/admin/shared.tsx` (optional utility)

**Analog:** `web/src/components/ChartTypeSelector.tsx` (button group pattern)

If extracted, this file would provide:
1. `SortHeader` — sortable `<th>` with ChevronUp/Down (used by all three tabs)
2. `ModalOverlay` — `fixed inset-0 z-50` wrapper shell (used by all 3 modals + ConfirmDialog)
3. `InputField` — labeled `<input>` wrapper with consistent styling

**Button active/inactive state** (ChartTypeSelector.tsx lines 44–49):
```typescript
// Active:
'p-2 rounded border border-blue-600 bg-blue-600 text-white'
// Inactive:
'p-2 rounded border border-gray-200 bg-white text-gray-500 hover:bg-gray-50 transition-colors'
```
→ Adapt for "Add" button (`bg-blue-600 text-white`) vs destructive delete (`bg-red-600 text-white`).

---

## Shared Patterns

### Authentication
**Source:** None — this app has no auth middleware.
**Apply to:** N/A — all routes are public.

### Error Handling
**Source:** `web/src/pages/DashboardPage.tsx` lines 42–48 + `web/src/api/client.ts` lines 19–24
**Apply to:** All tab components (DataPointsTab, AssetsTab, CategoriesTab) and all modal save handlers
```typescript
// In fetch effect:
.catch(err => {
  setError(err instanceof ApiError ? err.message : 'Unexpected error')
})

// In save handler:
} catch (err) {
  setSaveError(err instanceof ApiError ? err.message : 'Unexpected error')
}

// ApiError class (already in client.ts — never redefine):
export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message)
    this.name = 'ApiError'
  }
}
```

### EUR Currency Formatting
**Source:** `web/src/components/SummaryCards.tsx` lines 4, 33, 62
**Apply to:** DataPointsTab (value column), any modal showing EUR amounts
```typescript
// Module-scope — instantiate ONCE, not inside render/component
const eurFormatter = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' })

eurFormatter.format(dataPoint.value)
```

### Typography Contract
**Source:** `web/src/pages/DashboardPage.tsx`, `web/src/components/SummaryCards.tsx`
**Apply to:** All admin components
- Labels / metadata: `text-xs font-medium text-gray-500`
- Table headers: `text-xs font-medium text-gray-500 uppercase tracking-wide`
- Body text: `text-sm font-medium text-gray-700` or `text-gray-900`
- **Banned:** `font-semibold`, `font-normal` — use only `font-medium` (UI text) or `font-bold` (display values)
- **Banned:** `green-500`, `red-500` — use `green-600`, `red-600`

### Cancel / Confirm Button Pair
**Source:** Established by ConfirmDialog (RESEARCH.md Pattern 3) — no existing analog
**Apply to:** All modal footers (DataPointModal, AssetModal, CategoryModal, ConfirmDialog)
```typescript
// Cancel (always left):
className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"

// Save/primary (right):
className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"

// Delete/destructive (right, ConfirmDialog only):
className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors"
```

### Lucide Icon Usage
**Source:** `web/src/components/Nav.tsx` line 3, `web/src/components/ChartTypeSelector.tsx` line 2
**Apply to:** All admin components
```typescript
// Import pattern — named imports from lucide-react:
import { Menu, X } from 'lucide-react'
import { AreaChart, LineChart, BarChart2 } from 'lucide-react'

// For admin components:
import { Plus, Pencil, Trash2, ChevronUp, ChevronDown, X, Info } from 'lucide-react'

// Usage — always pass explicit size:
<Menu size={20} />   // Nav uses 20
<AreaChart size={16} />  // ChartTypeSelector uses 16
// Admin: use size={14} for table action icons, size={16} for modal close/info
```

### Cancelled-Fetch Guard
**Source:** `web/src/pages/DashboardPage.tsx` lines 35–50
**Apply to:** All three tab components
```typescript
useEffect(() => {
  let cancelled = false
  // ... fetch ...
  .then(result => { if (!cancelled) setState(result) })
  .catch(err  => { if (!cancelled) setError(...) })
  .finally(()  => { if (!cancelled) setLoading(false) })
  return () => { cancelled = true }   // cleanup on unmount / re-run
}, [retryCount])
```

---

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `DataPointModal.tsx` | component | CRUD form | No form modals exist in codebase yet |
| `AssetModal.tsx` | component | CRUD form | No form modals exist in codebase yet |
| `CategoryModal.tsx` | component | CRUD form | No form modals exist in codebase yet |
| `ConfirmDialog.tsx` | component | request-response | No overlay dialogs exist in codebase yet |

→ **All four use RESEARCH.md patterns directly** (Patterns 3–10 in `06-RESEARCH.md`). These are well-specified; no guessing needed.

---

## Metadata

**Analog search scope:** `web/src/pages/`, `web/src/components/`, `web/src/api/`, `web/src/types/`
**Files scanned:** 9 (DashboardPage, AdminPage stub, ProjectionsPage, Nav, ChartTypeSelector, SummaryCards, WealthChart, client.ts, types/index.ts)
**Analog search stopped at:** 5 analogs (DashboardPage is the dominant pattern for all data-fetching components; ChartTypeSelector covers button group active states)
**Pattern extraction date:** 2026-04-22
