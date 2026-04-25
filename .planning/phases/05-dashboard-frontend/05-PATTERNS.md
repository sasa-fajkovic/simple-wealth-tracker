# Phase 5: Dashboard Frontend — Pattern Map

**Mapped:** 2026-04-22
**Files analyzed:** 11 (9 new, 1 modify, 1 read-only verify)
**Analogs found:** 4 / 9 actionable new/modify files (no existing React components in codebase — all component analogs sourced from RESEARCH.md verified patterns)

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `web/package.json` | config | — | existing `web/package.json` | exact (modify) |
| `web/src/types/index.ts` | model/types | transform | `server/src/models/index.ts` | role-match (same pure-type pattern, different domain) |
| `web/src/api/client.ts` | service | request-response | `server/src/routes/summary.ts` | data-flow-match (fetch pattern; RESEARCH.md Pattern 1 is the direct code template) |
| `web/src/components/Nav.tsx` | component | event-driven | none in codebase | no analog — use RESEARCH.md §Nav Active Link Detection |
| `web/src/components/WealthChart.tsx` | component | transform | none in codebase | no analog — use RESEARCH.md Patterns 2 + 3 |
| `web/src/components/SummaryCards.tsx` | component | transform | none in codebase | no analog — use UI-SPEC §Component Inventory |
| `web/src/pages/DashboardPage.tsx` | page/controller | request-response | none in codebase | no analog — use RESEARCH.md architecture diagram + UI-SPEC interactions |
| `web/src/pages/ProjectionsPage.tsx` | page (stub) | — | none | no analog — one-liner stub |
| `web/src/pages/AdminPage.tsx` | page (stub) | — | none | no analog — one-liner stub |
| `web/src/App.tsx` | component/router | event-driven | existing `web/src/App.tsx` | exact (modify — add Routes/Route/Nav) |
| `web/src/main.tsx` | entry point | — | existing `web/src/main.tsx` | exact (read-only verify — BrowserRouter stays here) |

---

## Pattern Assignments

### `web/package.json` (config — add lucide-react)

**Analog:** existing `web/package.json` (lines 1–27)

**Current dependencies block** (lines 11–16) — add `lucide-react` here:
```json
"dependencies": {
  "react": "^18.3.1",
  "react-dom": "^18.3.1",
  "react-router-dom": "^6.26.0",
  "recharts": "^2.13.0",
  "lucide-react": "^0.400.0"
}
```

> **Action:** Run `cd web && npm install && npm install lucide-react` — this installs all existing deps (node_modules is empty) AND adds lucide-react. The `npm install lucide-react` command updates package.json automatically. Do NOT hand-edit the version pin; let npm resolve it from the registry (1.8.0 is current latest as verified in RESEARCH.md).

---

### `web/src/types/index.ts` (model/types, transform)

**Analog:** `server/src/models/index.ts` (lines 1–37)

**Interface declaration pattern** — pure types, no imports, no runtime code (lines 1–9):
```typescript
// Pure type definitions — no imports, no runtime code.
// These interfaces are the single source of truth for all data shapes.

export interface Category {
  id: string
  name: string
  projected_yearly_growth: number
  color: string
}
```

**`SummaryResponse` interface to mirror** — sourced from `server/src/calc/summary.ts` lines 49–57 (VERIFIED):
```typescript
// server/src/calc/summary.ts lines 49–57 — copy shape exactly
export interface SummaryResponse {
  months: string[]
  series: { category_id: string; category_name: string; color: string; values: number[] }[]
  totals: number[]
  current_total: number
  period_delta_abs: number
  period_delta_pct: number
  category_breakdown: {
    category_id: string
    category_name: string
    color: string
    value: number
    pct_of_total: number
  }[]
}
```

**`ProjectionsResponse` interface** — sourced from RESEARCH.md §Code Examples (matches ROADMAP Phase 7 shape):
```typescript
export interface ProjectionsResponse {
  historical: SummaryResponse  // max range, same shape
  projection: {
    months: string[]
    series: { category_id: string; category_name: string; color: string; values: number[] }[]
    totals: number[]
  }
}
```

**Re-export the backend models** — copy `Category`, `Asset`, `DataPoint` verbatim from `server/src/models/index.ts` lines 4–31:
```typescript
export interface Category {
  id: string
  name: string
  projected_yearly_growth: number
  color: string
}

export interface Asset {
  id: string
  name: string
  category_id: string
  projected_yearly_growth: number | null
  location?: string
  notes?: string
  created_at: string
}

export interface DataPoint {
  id: string
  asset_id: string
  year_month: string   // YYYY-MM — always client-provided
  value: number
  notes?: string
  created_at: string
  updated_at: string
}
```

> **Key pattern from analog:** `server/src/models/index.ts` uses zero imports — pure type declarations only. Apply the same convention to `web/src/types/index.ts`.

---

### `web/src/api/client.ts` (service, request-response)

**Analog:** `server/src/routes/summary.ts` (for request-response data-flow shape); direct code template from RESEARCH.md §Pattern 1 (VERIFIED).

**Base URL pattern** — relative URL, no `window.location.origin` (RESEARCH.md §Pattern 1):
```typescript
const BASE = '/api/v1'
```

> **Why relative:** Vite proxy (`vite.config.ts` lines 8–10) forwards `/api` → `http://localhost:8080` in dev. In production the server serves the SPA from the same origin. Relative URLs work in both environments without any env-specific config.

**`ApiError` class pattern** (RESEARCH.md §Pattern 1):
```typescript
export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message)
    this.name = 'ApiError'
  }
}
```

**Core fetch wrapper pattern** (RESEARCH.md §Pattern 1):
```typescript
async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }))
    throw new ApiError(res.status, body.error ?? res.statusText)
  }
  return res.json() as Promise<T>
}
```

**Typed endpoint function** (RESEARCH.md §Pattern 1):
```typescript
export function getSummary(range: string): Promise<SummaryResponse> {
  return apiFetch(`/summary?range=${range}`)
}
```

**Import pattern** — types imported from sibling `../types/index`:
```typescript
import type { SummaryResponse } from '../types/index'
```

---

### `web/src/components/Nav.tsx` (component, event-driven)

**Analog:** none in codebase (first React component). Use RESEARCH.md §Nav Active Link Detection + UI-SPEC §Component Inventory + UI-SPEC §Interaction Contract 4.

**Import pattern** — standard React component imports + react-router-dom + lucide-react:
```typescript
import { useState, useEffect, useRef } from 'react'
import { NavLink } from 'react-router-dom'
import { Menu, X } from 'lucide-react'
```

**Active link pattern** — `NavLink` className callback (RESEARCH.md §Nav Active Link Detection — A1, verified standard v6 API):
```typescript
<NavLink
  to="/"
  className={({ isActive }) =>
    isActive
      ? 'text-blue-600 font-medium text-sm'
      : 'text-gray-500 font-medium text-sm hover:text-gray-900'
  }
>
  Dashboard
</NavLink>
```

**Hamburger state pattern** (UI-SPEC §Interaction Contract 4):
```typescript
const [open, setOpen] = useState(false)
// Close on nav link click — pass onClick={() => setOpen(false)} to each mobile NavLink
// Close on outside click — useEffect with mousedown listener on document
```

**Click-outside pattern** — useEffect with cleanup (RESEARCH.md §Don't Hand-Roll):
```typescript
const menuRef = useRef<HTMLDivElement>(null)
useEffect(() => {
  if (!open) return
  const handler = (e: MouseEvent) => {
    if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
      setOpen(false)
    }
  }
  document.addEventListener('mousedown', handler)
  return () => document.removeEventListener('mousedown', handler)
}, [open])
```

**Nav bar Tailwind classes** (UI-SPEC §Component Inventory):
```
nav:     h-14 bg-white border-b border-gray-200 px-4 sm:px-8 flex items-center justify-between
logo:    text-lg font-medium text-gray-900
desktop links: hidden sm:flex gap-6 text-sm font-medium
hamburger btn: sm:hidden p-2
dropdown: absolute top-14 left-0 right-0 bg-white border-b border-gray-200 z-50 flex flex-col py-2
mobile link: px-4 py-3 text-sm font-medium
```

**Hamburger icon toggle** (UI-SPEC §Interaction Contract 4):
```typescript
{open ? <X size={20} /> : <Menu size={20} />}
// aria-label: open ? 'Close navigation menu' : 'Open navigation menu'
```

---

### `web/src/components/WealthChart.tsx` (component, transform)

**Analog:** none in codebase. Use RESEARCH.md Patterns 2 + 3 + UI-SPEC §Interaction Contract 3 (all VERIFIED or sourced from UI-SPEC).

**Import pattern** — Recharts + types:
```typescript
import {
  ComposedChart, Area, Line, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer,
} from 'recharts'
import type { SummaryResponse } from '../types/index'
```

**Props interface** (derived from RESEARCH.md architecture diagram):
```typescript
interface WealthChartProps {
  data: SummaryResponse
  chartType: 'area' | 'line' | 'bar'
}
```

**Data flattening transform** — CRITICAL: use `category_id` as key, NOT `category_name` (RESEARCH.md Pattern 2 + Pitfall 2):
```typescript
// Each point: { month: string, total: number, [category_id]: number }
function buildChartData(response: SummaryResponse) {
  return response.months.map((month, i) => {
    const point: Record<string, string | number> = {
      month,
      total: response.totals[i],
    }
    for (const s of response.series) {
      point[s.category_id] = s.values[i]  // MUST be category_id (slug), never category_name
    }
    return point
  })
}
```

**Parent div — mandatory explicit height** (RESEARCH.md Pitfall 1 + UI-SPEC §Interaction Contract 3):
```typescript
// MUST have explicit height — ResponsiveContainer reads parent height; auto = 0px collapse
<div className="h-[420px]">
  <ResponsiveContainer width="100%" height="100%">
    <ComposedChart data={chartData}>
```

**Series rendering — three chart modes** (RESEARCH.md Pattern 3 — VERIFIED Recharts v2.x API):
```typescript
{/* STACKED AREA — stackId required on every Area */}
{chartType === 'area' && series.map(s => (
  <Area key={s.category_id} dataKey={s.category_id} stackId="wealth"
        fill={s.color} stroke={s.color} fillOpacity={0.6} name={s.category_name} />
))}

{/* LINE — no stackId */}
{chartType === 'line' && series.map(s => (
  <Line key={s.category_id} dataKey={s.category_id}
        stroke={s.color} dot={false} strokeWidth={2} name={s.category_name} />
))}

{/* STACKED BAR — stackId required on every Bar */}
{chartType === 'bar' && series.map(s => (
  <Bar key={s.category_id} dataKey={s.category_id} stackId="wealth"
       fill={s.color} name={s.category_name} />
))}

{/* TOTAL LINE — NO stackId ever; absolute value overlay; rendered last to paint on top */}
<Line dataKey="total" stroke="#111827" strokeWidth={2} dot={false} name="Total" />
```

**Axis configuration** (UI-SPEC §Interaction Contract 3):
```typescript
<XAxis
  dataKey="month"
  tickFormatter={(m) => m.slice(0, 7)}
  tick={{ fontSize: 12, fill: '#6B7280' }}
/>
<YAxis
  tickFormatter={(v) =>
    new Intl.NumberFormat('de-DE', { notation: 'compact', maximumFractionDigits: 0 }).format(v)
  }
  tick={{ fontSize: 12, fill: '#6B7280' }}
/>
<CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
<Legend wrapperStyle={{ fontSize: '12px', color: '#374151' }} />
```

**Custom tooltip pattern** (UI-SPEC §Interaction Contract 3):
```typescript
// White bg, border, shadow; lists each category + total row in bold
<Tooltip content={<CustomTooltip series={response.series} />} />

// CustomTooltip receives { active, payload, label } from Recharts
function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  const fmt = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' })
  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-lg p-3 text-sm">
      <p className="font-medium text-gray-900 mb-2">{label}</p>
      {payload.filter((p: any) => p.dataKey !== 'total').map((p: any) => (
        <div key={p.dataKey} className="flex justify-between gap-4">
          <span style={{ color: p.color }}>{p.name}</span>
          <span>{fmt.format(p.value)}</span>
        </div>
      ))}
      {payload.find((p: any) => p.dataKey === 'total') && (
        <div className="flex justify-between gap-4 font-bold border-t border-gray-200 mt-1 pt-1">
          <span>Total</span>
          <span>{fmt.format(payload.find((p: any) => p.dataKey === 'total').value)}</span>
        </div>
      )}
    </div>
  )
}
```

**Outer card classes** (UI-SPEC §Component Inventory):
```
bg-white rounded-lg border border-gray-200 p-4
```

---

### `web/src/components/SummaryCards.tsx` (component, transform)

**Analog:** none in codebase. Use UI-SPEC §Component Inventory + RESEARCH.md §Code Examples §Period Change Formatting.

**Import pattern:**
```typescript
import type { SummaryResponse } from '../types/index'
```

**Props interface:**
```typescript
interface SummaryCardsProps {
  data: SummaryResponse
}
```

**EUR formatter** — reuse across all three cards (RESEARCH.md §Pattern 5 — VERIFIED from UI-SPEC):
```typescript
const eurFormatter = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' })
// e.g. eurFormatter.format(1234567.89) → "1.234.567,89 €"
```

**Period change formatting — U+2212 minus sign** (RESEARCH.md §Code Examples — VERIFIED from UI-SPEC copywriting contract):
```typescript
function formatDelta(abs: number, pct: number): { text: string; positive: boolean } {
  const formatted = eurFormatter.format(Math.abs(abs))
  const prefix = abs >= 0 ? '+' : '\u2212'  // U+2212 MINUS SIGN, not hyphen
  const pctStr = abs >= 0 ? `+${pct.toFixed(2)}%` : `\u2212${Math.abs(pct).toFixed(2)}%`
  return { text: `${prefix}${formatted} (${pctStr})`, positive: abs >= 0 }
}
```

**Card grid and card classes** (UI-SPEC §Component Inventory):
```
grid:          grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6
card:          bg-white rounded-lg border border-gray-200 p-6
eyebrow:       text-xs font-medium text-gray-500 uppercase tracking-wide mb-1
primary value: text-2xl font-bold text-gray-900
delta positive: text-green-600
delta negative: text-red-600
```

**Category breakdown row pattern** (UI-SPEC §Component Inventory):
```typescript
// Category Breakdown card — renders category_breakdown[] from SummaryResponse
{data.category_breakdown.map(row => (
  <div key={row.category_id} className="flex items-center justify-between text-sm font-medium">
    <span className="flex items-center gap-2">
      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: row.color }} />
      {row.category_name}
    </span>
    <span>{eurFormatter.format(row.value)}</span>
  </div>
))}
```

---

### `web/src/pages/DashboardPage.tsx` (page/controller, request-response)

**Analog:** none in codebase. Use RESEARCH.md architecture diagram + UI-SPEC §Interaction Contracts 1, 5, 6.

**Import pattern:**
```typescript
import { useState, useEffect } from 'react'
import { getSummary, ApiError } from '../api/client'
import { SummaryCards } from '../components/SummaryCards'
import { WealthChart } from '../components/WealthChart'
import type { SummaryResponse } from '../types/index'
```

**Range constants** — explicit label→value mapping to avoid lowercase-bugs (RESEARCH.md §Open Question 3):
```typescript
const RANGES = [
  { label: 'YTD', value: 'ytd' },
  { label: '6M', value: '6m' },
  { label: '1Y', value: '1y' },
  { label: '2Y', value: '2y' },
  { label: '3Y', value: '3y' },
  { label: '5Y', value: '5y' },
  { label: '10Y', value: '10y' },
  { label: 'Max', value: 'max' },
] as const
```

**State pattern** (RESEARCH.md architecture diagram):
```typescript
const [range, setRange] = useState<string>('1y')       // default 1Y per UI-SPEC
const [data, setData] = useState<SummaryResponse | null>(null)
const [loading, setLoading] = useState(true)
const [error, setError] = useState<string | null>(null)
```

**Fetch pattern with loading/error** (UI-SPEC §Interaction Contracts 5+6):
```typescript
useEffect(() => {
  setLoading(true)
  setError(null)
  getSummary(range)
    .then(setData)
    .catch(err => setError(err instanceof ApiError ? err.message : 'Unexpected error'))
    .finally(() => setLoading(false))
}, [range])
```

**Skeleton loading state** (RESEARCH.md §Skeleton Loading State — VERIFIED from UI-SPEC):
```typescript
{loading ? (
  <>
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
      {[0, 1, 2].map(i => (
        <div key={i} className="h-24 bg-gray-100 rounded-lg animate-pulse" />
      ))}
    </div>
    <div className="h-[420px] bg-gray-100 rounded-lg animate-pulse" />
  </>
) : (
  /* actual SummaryCards + WealthChart */
)}
```

**Error banner pattern** (UI-SPEC §Interaction Contract 6):
```typescript
{error && (
  <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
    <p className="text-red-700 font-medium text-sm">Could not load data</p>
    <p className="text-red-600 text-sm">Check your connection and refresh the page.</p>
    <button
      onClick={() => setRange(range)}  // re-trigger useEffect
      className="mt-2 text-sm text-red-700 underline"
    >
      Retry loading data
    </button>
  </div>
)}
```

**Range pill classes** (UI-SPEC §Interaction Contract 1):
```
inactive: bg-white border border-gray-200 text-gray-600 hover:bg-gray-50 rounded-full px-3 py-1 text-xs font-medium transition-colors cursor-pointer
active:   bg-blue-600 border border-blue-600 text-white rounded-full px-3 py-1 text-xs font-medium cursor-pointer
```

**Page wrapper classes** (UI-SPEC §Component Inventory):
```
page: min-h-screen bg-gray-50
content: max-w-7xl mx-auto px-4 sm:px-8 py-8
```

**`<title>` tag** (UI-SPEC §Copywriting Contract):
```typescript
// Set document.title = 'Dashboard — WealthTrack' in useEffect([]) on mount
```

---

### `web/src/pages/ProjectionsPage.tsx` (page stub, no data flow)

**Analog:** none. One-liner stub per RESEARCH.md §Open Question 2 recommendation.

**Minimal stub pattern:**
```typescript
export default function ProjectionsPage() {
  return <div className="p-8 text-gray-500">Coming soon</div>
}
```

---

### `web/src/pages/AdminPage.tsx` (page stub, no data flow)

**Analog:** none. Same one-liner stub pattern.

**Minimal stub pattern:**
```typescript
export default function AdminPage() {
  return <div className="p-8 text-gray-500">Coming soon</div>
}
```

---

### `web/src/App.tsx` (component/router, event-driven — MODIFY)

**Analog:** existing `web/src/App.tsx` (lines 1–8) — this is the file being modified.

**Current state** (lines 1–8 — starting point):
```typescript
export default function App() {
  return (
    <div className="min-h-screen p-6">
      <h1 className="text-2xl font-semibold">WealthTrack</h1>
      <p className="text-slate-600">Scaffold ready.</p>
    </div>
  )
}
```

**Target state** — add Routes/Route and Nav; keep BrowserRouter in `main.tsx` (RESEARCH.md §Pitfall 6 + §Open Question 1 resolution: BrowserRouter stays in main.tsx):
```typescript
import { Routes, Route } from 'react-router-dom'
import Nav from './components/Nav'
import DashboardPage from './pages/DashboardPage'
import ProjectionsPage from './pages/ProjectionsPage'
import AdminPage from './pages/AdminPage'

export default function App() {
  return (
    <div className="min-h-screen bg-gray-50">
      <Nav />
      <Routes>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/projections" element={<ProjectionsPage />} />
        <Route path="/admin" element={<AdminPage />} />
      </Routes>
    </div>
  )
}
```

> **BrowserRouter decision:** `main.tsx` already has `<BrowserRouter>` wrapping `<App>`. Keep it there — do NOT add a second `<BrowserRouter>` in `App.tsx`. The RESEARCH.md §Open Question 1 recommends this as the safest option (avoids modifying a working file and prevents double-router React warning).

---

### `web/src/main.tsx` (entry point — READ ONLY)

**Analog:** existing `web/src/main.tsx` (lines 1–13).

**Current state — verified correct** (lines 1–13):
```typescript
import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
)
```

> **No changes needed.** `BrowserRouter` is correctly placed here. `App.tsx` will add `<Routes>` inside `<App>` without adding another `<BrowserRouter>`.

---

## Shared Patterns

### EUR Currency Formatting
**Source:** RESEARCH.md §Pattern 5 (VERIFIED from UI-SPEC copywriting contract)
**Apply to:** `SummaryCards.tsx`, `WealthChart.tsx` (custom tooltip), `DashboardPage.tsx`

```typescript
// Instantiate once per component (not per render)
const eurFormatter = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' })
// e.g. eurFormatter.format(1234567.89) → "1.234.567,89 €"
// Period = thousands separator; comma = decimal separator (German locale)
```

### Period Change Sign — U+2212 Minus Sign
**Source:** RESEARCH.md §Code Examples (VERIFIED from UI-SPEC copywriting contract)
**Apply to:** `SummaryCards.tsx`

```typescript
const prefix = abs >= 0 ? '+' : '\u2212'  // U+2212 MINUS SIGN, NOT hyphen-minus (-)
```

### TypeScript Import Conventions
**Source:** `server/src/models/index.ts` line 1; `server/src/routes/categories.ts` line 6
**Apply to:** All `.tsx` files importing types

```typescript
import type { SummaryResponse } from '../types/index'  // type-only import
```

### localStorage Chart Type Persistence
**Source:** RESEARCH.md §Pattern 4 (VERIFIED from UI-SPEC §Interaction Contract 2)
**Apply to:** `WealthChart.tsx` or `DashboardPage.tsx` (wherever `ChartTypeSelector` logic lives)
**Authoritative key:** `dashboard-chart-type` (NOT `wealthtrack_chart_type_dashboard` — see RESEARCH.md §localStorage Key Discrepancy)

```typescript
type ChartType = 'area' | 'line' | 'bar'

function useChartType(storageKey: string): [ChartType, (t: ChartType) => void] {
  const [chartType, setChartType] = useState<ChartType>(() => {
    const stored = localStorage.getItem(storageKey)
    return (stored as ChartType) ?? 'area'  // null ?? 'area' is safe (A3 verified)
  })
  const update = (t: ChartType) => {
    setChartType(t)
    localStorage.setItem(storageKey, t)
  }
  return [chartType, update]
}
```

### Active Nav Link Classes
**Source:** RESEARCH.md §Nav Active Link Detection + UI-SPEC §Color
**Apply to:** `Nav.tsx`

```typescript
// Desktop + mobile dropdown share the same active/inactive class logic
isActive
  ? 'text-blue-600 font-medium'      // accent blue — exhaustive list item #3 in UI-SPEC
  : 'text-gray-500 font-medium hover:text-gray-900'
```

### Tailwind Focus Ring
**Source:** UI-SPEC §Color (accent reserved list item #4)
**Apply to:** All interactive elements (`Nav.tsx` hamburger, range pills, chart type buttons)

```
focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2
```

---

## No Analog Found

Files with no close match in the existing codebase (patterns sourced entirely from RESEARCH.md or UI-SPEC):

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `web/src/components/Nav.tsx` | component | event-driven | No React components exist in web/src yet |
| `web/src/components/WealthChart.tsx` | component | transform | No React components exist; Recharts-specific patterns from RESEARCH.md |
| `web/src/components/SummaryCards.tsx` | component | transform | No React components exist |
| `web/src/pages/DashboardPage.tsx` | page | request-response | No React pages exist |
| `web/src/pages/ProjectionsPage.tsx` | page (stub) | — | No React pages exist; one-liner |
| `web/src/pages/AdminPage.tsx` | page (stub) | — | No React pages exist; one-liner |
| `web/src/api/client.ts` | service | request-response | No frontend API clients exist; pattern from RESEARCH.md §Pattern 1 (verified against API contract) |

---

## Critical Anti-Patterns (from RESEARCH.md — Verified Traps)

| Anti-Pattern | Where It Bites | Correct Pattern |
|---|---|---|
| `dataKey={category.category_name}` in Recharts | `WealthChart.tsx` | `dataKey={category.category_id}` (slug) — dots in names break Recharts path parser |
| `<ResponsiveContainer>` without explicit parent height | `WealthChart.tsx` | Always wrap in `<div className="h-[420px]">` |
| `<Area>` or `<Bar>` without `stackId="wealth"` | `WealthChart.tsx` stacked modes | All stacked series must share `stackId="wealth"` |
| Total `<Line>` with `stackId` | `WealthChart.tsx` | Total line must have NO `stackId` — it is an absolute overlay |
| `-` (hyphen) as negative prefix | `SummaryCards.tsx` | Use `\u2212` (U+2212 MINUS SIGN) per UI-SPEC copywriting contract |
| `window.location.origin + '/api/v1/...'` | `api/client.ts` | Use relative `/api/v1/...` — works with Vite proxy + same-origin prod |
| `<BrowserRouter>` in both `main.tsx` and `App.tsx` | `App.tsx` | Keep `BrowserRouter` in `main.tsx` only; add `<Routes>` in `App.tsx` |
| localStorage key `wealthtrack_chart_type_dashboard` | `ChartTypeSelector` | Use `dashboard-chart-type` (authoritative per UI-SPEC + ROADMAP Plan 5.3) |

---

## Metadata

**Analog search scope:** `web/src/`, `server/src/models/`, `server/src/routes/`, `server/src/calc/`
**Files scanned:** `web/src/App.tsx`, `web/src/main.tsx`, `server/src/models/index.ts`, `server/src/calc/summary.ts`, `server/src/routes/summary.ts`, `server/src/routes/categories.ts`, `server/src/routes/assets.ts`, `web/package.json`, `web/vite.config.ts`, `web/src/index.css`
**Pattern extraction date:** 2026-04-22
**Note:** `web/src/` has zero existing React components/pages/hooks. All component analogs sourced from RESEARCH.md verified patterns and UI-SPEC contracts. Server-side TypeScript files (`server/src/models/index.ts`, `server/src/calc/summary.ts`) are the strongest codebase analogs for typing conventions.
