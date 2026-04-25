# Phase 5: Dashboard Frontend — Research

**Researched:** 2026-04-22
**Domain:** React 18 + TypeScript + React Router v6 + Recharts + Tailwind CSS
**Confidence:** HIGH

---

## Summary

Phase 5 delivers the visible application: a typed API client, persistent navigation, a Recharts `ComposedChart` with time-range and chart-type controls, and three summary cards. All backend endpoints are already built and tested (Phases 1–4 complete). The frontend scaffold (`web/`) exists with correct Vite/Tailwind/TypeScript configuration and empty directory placeholders for every file this phase creates — but **`node_modules` is empty** (no `npm install` has been run yet) and **`lucide-react` is not yet in `package.json`** despite being required by the UI spec. Both are Wave 0 blockers.

The most dangerous technical traps are Recharts-specific: `dataKey` must be `category_id` (slug) not `category_name` (dots break the path parser); `ResponsiveContainer` silently collapses to zero height without an explicit-height parent `div`; stacked Area/Bar charts require a shared `stackId` on every series; and the total-wealth overlay `<Line>` must have *no* `stackId`. These are all documented in the UI spec and ROADMAP and must appear verbatim in plan verification gates.

There is one **localStorage key discrepancy** between the UI-SPEC (which says `dashboard-chart-type`) and the `additional_context` injected into this research job (which says `wealthtrack_chart_type_dashboard`). The ROADMAP Plan 5.3 also agrees with the UI-SPEC: `storageKey="dashboard-chart-type"`. **Use `dashboard-chart-type`** as the authoritative key; the additional_context value is a draft artifact.

**Primary recommendation:** Plan in strict dependency order (types → API client → Router/Nav → Chart → Cards) so each wave compiles independently. Install `lucide-react` and run `npm install` as the first action in Wave 0.

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| FE-01 | TypeScript API client (`src/api/client.ts`) with typed functions for all endpoints | Plan 5.1; `ApiError` class pattern; all endpoints mapped below |
| FE-02 | Shared TypeScript types (`src/types/index.ts`) matching backend data model | `SummaryResponse` interface from `server/src/calc/summary.ts`; `Category`/`Asset`/`DataPoint` from `server/src/models/index.ts` |
| FE-03 | Persistent top nav: Dashboard · Projections · Admin; collapses to hamburger on mobile | React Router `useLocation` for active state; `lucide-react` Menu/X icons; Tailwind `sm:` breakpoint |
| FE-04 | Category IDs as Recharts `dataKey` (never category name) | Recharts dot-path parser bug; `series[].category_id` is the safe key |
| DASH-01 | Time range selector — 8 pills, default `1Y` | `useState` for active range; pill active/inactive Tailwind classes from UI-SPEC |
| DASH-02 | Main chart — one coloured series per category + total wealth line on top | `ComposedChart` with `Area`/`Line`/`Bar` + total `<Line dataKey="total">` overlay |
| DASH-03 | Chart tooltip — each category value + total for hovered month | Custom `<Tooltip content={<CustomTooltip />}>` component |
| DASH-04 | Chart type selector — Stacked Area / Line / Stacked Bar; persisted in `localStorage` | `ChartTypeSelector` component; `localStorage` key `dashboard-chart-type` |
| DASH-05 | Summary cards — Total Net Worth, Period Change (€ + %), category breakdown | `SummaryCards` consuming `SummaryResponse`; EUR via `Intl.NumberFormat('de-DE', ...)` |
</phase_requirements>

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| API communication | Browser / Client | — | Relative URL fetch calls via Vite proxy in dev; same origin in prod (API-02 SPA serving) |
| Routing (SPA) | Browser / Client | Frontend Server (Vite dev) | React Router BrowserRouter; server provides SPA catch-all for hard reloads |
| Navigation state | Browser / Client | — | `useLocation()` for active link detection; hamburger open/close as local `useState` |
| Chart rendering | Browser / Client | — | Recharts is a client-side canvas/SVG library; no SSR involved |
| Chart type persistence | Browser / Client | — | `localStorage` — survives page refresh, client-only |
| Summary computation | API / Backend | — | Already implemented in Phase 3 (`aggregateSummary`); frontend only consumes |
| Type safety boundary | Browser / Client | — | `web/src/types/index.ts` mirrors backend interfaces; no runtime schema validation needed |

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| react | ^18.3.1 | UI rendering | Already installed |
| react-dom | ^18.3.1 | DOM mounting | Already installed |
| react-router-dom | ^6.26.0 | Client-side routing | Already in package.json; `BrowserRouter` already in `main.tsx` |
| recharts | ^2.13.0 | Chart rendering | Already in package.json; `ComposedChart` handles all three chart types in one API |
| typescript | ^5.5.4 | Type safety | Already installed |
| tailwindcss | ^3.4.10 | Utility CSS | Already in devDependencies; directives in `index.css`; config at `web/tailwind.config.ts` |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| lucide-react | ^0.400+ (latest ^1.8.0 on npm) | Icons: AreaChart, LineChart, BarChart2, Menu, X | Required by UI-SPEC for Nav hamburger + chart type buttons. **NOT YET IN package.json — Wave 0 install** |
| @vitejs/plugin-react | ^4.3.1 | Vite React integration | Already in devDependencies |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Recharts `ComposedChart` | separate `AreaChart`/`LineChart`/`BarChart` components | `ComposedChart` allows mixing Area + Line (total overlay) in one chart — the only option that supports all three chart modes plus the total-wealth line overlay simultaneously |
| `localStorage` for chart type | React context / URL param | `localStorage` survives hard refresh and is isolated per chart slot (dashboard vs projections) — no need for server state |
| Tailwind arbitrary height `h-[420px]` | inline style | Tailwind JIT handles arbitrary values; `content: ['./src/**/*.{ts,tsx}']` in config ensures it's included |

### Installation

```bash
cd web
npm install
npm install lucide-react
```

**Version verification:**
- recharts: `3.8.1` on npm registry [VERIFIED: npm view recharts version]
- react-router-dom: `7.14.2` on npm registry [VERIFIED: npm view react-router-dom version]
- lucide-react: `1.8.0` on npm registry [VERIFIED: npm view lucide-react version]

> ⚠️ The package.json pins `recharts ^2.13.0` and `react-router-dom ^6.26.0` — these are semver ranges. `npm install` will install the latest compatible minor/patch, not major. Do NOT upgrade to recharts 3.x or react-router-dom 7.x without verifying the Phase 5 API surface is unchanged. The existing constraints are correct for the codebase.

---

## Architecture Patterns

### System Architecture Diagram

```
User Browser
     │
     ▼
┌─────────────────────────────────────────────────────────────┐
│  React SPA (web/src/)                                       │
│                                                             │
│  main.tsx                                                   │
│    └─ <BrowserRouter>                                       │
│         └─ <App>                                            │
│              ├─ <Nav>  ◄── useLocation() active state       │
│              │   ├─ Desktop links  (sm:flex)                │
│              │   └─ Hamburger dropdown  (<640px)            │
│              │                                              │
│              └─ <Routes>                                    │
│                   ├─ /  →  <Dashboard>                      │
│                   │         │                               │
│                   │         ├─ useState(range='1y')         │
│                   │         ├─ getSummary(range) ──────────►│─── fetch /api/v1/summary?range=1y
│                   │         │   └─ SummaryResponse          │◄── JSON response
│                   │         │                               │
│                   │         ├─ <SummaryCards data={...} />  │
│                   │         │                               │
│                   │         ├─ Range pills (YTD…Max)        │
│                   │         │                               │
│                   │         ├─ <ChartTypeSelector           │
│                   │         │   storageKey="dashboard-chart-type"
│                   │         │   └─ localStorage R/W         │
│                   │         │                               │
│                   │         └─ <WealthChart                 │
│                   │             data={flattenedDataPoints}  │
│                   │             chartType={...}             │
│                   │             └─ <ResponsiveContainer>    │
│                   │                  └─ <ComposedChart>     │
│                   │                       ├─ <Area>×N  (stacked)
│                   │                       ├─ <Line>×N  (line mode)
│                   │                       ├─ <Bar>×N   (stacked)
│                   │                       └─ <Line dataKey="total">
│                   │                                         │
│                   ├─ /projections → <Projections> (stub)    │
│                   └─ /admin       → <Admin> (stub)          │
└─────────────────────────────────────────────────────────────┘
                              │
                    Vite proxy /api → localhost:8080
                              │
                    ┌─────────▼─────────┐
                    │  Hono server      │
                    │  /api/v1/summary  │
                    │  (Phase 3, done)  │
                    └───────────────────┘
```

### Recommended Project Structure

```
web/src/
├── api/
│   └── client.ts          # All fetch wrappers + ApiError class
├── types/
│   └── index.ts           # Category, Asset, DataPoint, SummaryResponse, ProjectionsResponse
├── components/
│   ├── Nav.tsx             # Top nav with hamburger (Phase 5)
│   ├── SummaryCards.tsx    # Three summary cards (Phase 5)
│   ├── WealthChart.tsx     # Recharts ComposedChart wrapper (Phase 5)
│   ├── ChartTypeSelector.tsx  # Three icon buttons + localStorage (Phase 5)
│   ├── charts/            # (empty — reserved for Phase 7 Projections chart)
│   ├── admin/             # (empty — reserved for Phase 6)
│   └── shared/            # (empty — reserved for shared UI primitives)
├── pages/
│   ├── Dashboard.tsx      # Dashboard page (Phase 5)
│   ├── Projections.tsx    # Stub page (Phase 5, filled in Phase 7)
│   └── Admin.tsx          # Stub page (Phase 5, filled in Phase 6)
├── App.tsx                # BrowserRouter + Routes (replace scaffold)
├── main.tsx               # Entry point (already has BrowserRouter — adjust per plan)
└── index.css              # Tailwind directives (already correct)
```

> **Note:** `main.tsx` already wraps `<App>` in `<BrowserRouter>`. The plan must decide whether to move `BrowserRouter` ownership to `App.tsx` (ROADMAP 5.2 says `App.tsx` with `<BrowserRouter>`) or leave it in `main.tsx`. Moving it to `App.tsx` means `main.tsx` no longer needs the `BrowserRouter` import — the existing `main.tsx` import will conflict. **Recommended:** Remove `BrowserRouter` from `main.tsx`; put it in `App.tsx` per ROADMAP 5.2.

### Pattern 1: API Client with ApiError

```typescript
// web/src/api/client.ts
// [ASSUMED pattern — standard fetch wrapper]
export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message)
    this.name = 'ApiError'
  }
}

const BASE = '/api/v1'

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

export function getSummary(range: string): Promise<SummaryResponse> {
  return apiFetch(`/summary?range=${range}`)
}
```

> **Base URL:** Use relative `/api/v1/...` — NOT `window.location.origin + '/api/v1/...'`. Vite proxy forwards `/api` to `http://localhost:8080` in dev; in production the server serves the SPA from the same origin (API-02). Relative URLs work in both environments without any environment-specific config.

### Pattern 2: Recharts Data Flattening

```typescript
// Flatten SummaryResponse into Recharts data array
// Each point: { month: string, total: number, [category_id]: number }
// [ASSUMED pattern based on Recharts ComposedChart API]
function buildChartData(response: SummaryResponse) {
  return response.months.map((month, i) => {
    const point: Record<string, string | number> = {
      month,
      total: response.totals[i],
    }
    for (const s of response.series) {
      point[s.category_id] = s.values[i]  // e.g. point['stocks'] = 125000
    }
    return point
  })
}
```

### Pattern 3: ComposedChart with All Three Modes

```typescript
// Source: Recharts ComposedChart API [ASSUMED based on recharts ^2.x docs]
// Parent div MUST have explicit height — otherwise ResponsiveContainer = 0px
<div className="h-[420px]">
  <ResponsiveContainer width="100%" height="100%">
    <ComposedChart data={chartData}>
      <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
      <XAxis dataKey="month" tick={{ fontSize: 12, fill: '#6B7280' }} />
      <YAxis tickFormatter={(v) => new Intl.NumberFormat('de-DE', { notation: 'compact', maximumFractionDigits: 0 }).format(v)} tick={{ fontSize: 12, fill: '#6B7280' }} />
      <Tooltip content={<CustomTooltip />} />
      <Legend wrapperStyle={{ fontSize: '12px', color: '#374151' }} />

      {/* Per-category series — mode determines which component to render */}
      {chartType === 'area' && series.map(s => (
        <Area key={s.category_id} dataKey={s.category_id} stackId="wealth"
              fill={s.color} stroke={s.color} fillOpacity={0.6} name={s.category_name} />
      ))}
      {chartType === 'line' && series.map(s => (
        <Line key={s.category_id} dataKey={s.category_id}
              stroke={s.color} dot={false} strokeWidth={2} name={s.category_name} />
      ))}
      {chartType === 'bar' && series.map(s => (
        <Bar key={s.category_id} dataKey={s.category_id} stackId="wealth"
             fill={s.color} name={s.category_name} />
      ))}

      {/* Total line overlay — NO stackId, always rendered on top */}
      <Line dataKey="total" stroke="#111827" strokeWidth={2} dot={false} name="Total" />
    </ComposedChart>
  </ResponsiveContainer>
</div>
```

### Pattern 4: localStorage Chart Type Persistence

```typescript
// ChartTypeSelector.tsx [ASSUMED pattern]
type ChartType = 'area' | 'line' | 'bar'

function useChartType(storageKey: string): [ChartType, (t: ChartType) => void] {
  const [chartType, setChartType] = useState<ChartType>(() => {
    const stored = localStorage.getItem(storageKey)
    return (stored as ChartType) ?? 'area'
  })
  const update = (t: ChartType) => {
    setChartType(t)
    localStorage.setItem(storageKey, t)
  }
  return [chartType, update]
}
```

### Pattern 5: EUR Currency Formatting

```typescript
// [VERIFIED: from UI-SPEC and REQUIREMENTS.md copywriting contract]
const eurFormatter = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' })
// e.g. eurFormatter.format(1234567.89) → "1.234.567,89 €"
// Period = thousands separator, comma = decimal separator (German locale)
```

### Anti-Patterns to Avoid

- **`dataKey={category.category_name}` in Recharts:** Category names can contain dots (e.g. `"U.S. Stocks"`). Recharts parses `dataKey` as a dot-delimited object path — `"U.S. Stocks"` becomes `obj["U"]["S"]["Stocks"]` which is `undefined`. **Use `category_id` (slug) as the key.**
- **`<ResponsiveContainer>` without explicit parent height:** If the parent has `height: auto` or no height, `ResponsiveContainer` computes 0px and renders nothing. **Always wrap in `<div className="h-[420px]">`.**
- **Stacked series without `stackId`:** Omitting `stackId` from `<Area>` or `<Bar>` causes series to overlap (draw on top of each other) instead of stacking. **All stacked series must share `stackId="wealth"`.**
- **Total line with `stackId`:** The total wealth `<Line dataKey="total">` must NOT have a `stackId` — it is an absolute value overlay, not a stacked series. Adding `stackId` would make it stack on top of all categories (doubling the chart height).
- **`new Date().toISOString().slice(0,7)` for month keys:** UTC conversion causes off-by-one at midnight on UTC+ timezones. **Use integer arithmetic: `String(date.getFullYear()) + '-' + String(date.getMonth() + 1).padStart(2, '0')`.**
- **`window.location.origin + '/api/v1/...'` as base URL:** Unnecessary — relative URLs work with Vite proxy in dev and same-origin serving in prod.
- **`BrowserRouter` in both `main.tsx` AND `App.tsx`:** Nesting two routers causes incorrect routing behaviour. Remove from `main.tsx` when adding to `App.tsx`.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Chart rendering (area/line/bar/tooltip/legend) | Custom SVG chart | `recharts` `ComposedChart` | Handles responsive sizing, animation, tooltip positioning, axis formatting, stacking math |
| Icon components | SVG inline components | `lucide-react` | Consistent sizing, stroke, accessibility; already standard in the project |
| EUR number formatting | Manual string concatenation | `Intl.NumberFormat('de-DE', ...)` | Handles thousands separator, decimal separator, currency symbol placement correctly for German locale |
| Click-outside detection for hamburger | Custom document click listener | Inline `useEffect` with `mousedown` on `document` | Simple enough to hand-write for one component, but must remember to clean up listener on unmount |

**Key insight:** The chart itself is the most complex component — Recharts handles responsive layout, animation, tooltip, and axis math. The only custom logic needed is the data-flattening transform (series arrays → per-point objects) and the conditional rendering of Area/Line/Bar based on `chartType`.

---

## Common Pitfalls

### Pitfall 1: Zero-Height Recharts Chart
**What goes wrong:** Chart renders but is invisible (0px height). No error in console.
**Why it happens:** `<ResponsiveContainer height="100%">` reads the parent element's height. If no explicit height is set, the parent collapses to 0.
**How to avoid:** Always wrap in `<div className="h-[420px]">` before `<ResponsiveContainer width="100%" height="100%">`.
**Warning signs:** Chart area is blank, inspecting DOM shows `<svg height="0">`.

### Pitfall 2: Recharts dataKey Dot-Path Parsing
**What goes wrong:** A category with a name like `"U.S. Bonds"` renders as a flat line (all zeros).
**Why it happens:** Recharts treats `dataKey` strings as dot-delimited accessors. `"U.S. Bonds"` → tries to access `obj.U.S.Bonds`.
**How to avoid:** Always use `category_id` (the slug) as `dataKey`. Map `category_name` to the `name` prop for labels.
**Warning signs:** Series appears as zero values in chart; tooltip shows 0 for that series.

### Pitfall 3: Stacked Area/Bar Without stackId
**What goes wrong:** Series overlap instead of stack (each drawn from the x-axis baseline).
**Why it happens:** Without `stackId`, Recharts treats each series as independent.
**How to avoid:** All `<Area>` and `<Bar>` components in stacked mode must have `stackId="wealth"`.
**Warning signs:** Chart looks like multiple overlapping mountains/bars rather than a single stacked shape.

### Pitfall 4: lucide-react Not Installed
**What goes wrong:** `import { Menu } from 'lucide-react'` fails with module not found at build time.
**Why it happens:** `lucide-react` is not in `web/package.json` (confirmed by codebase scan). [VERIFIED: codebase grep]
**How to avoid:** `npm install lucide-react` as Wave 0 first step.
**Warning signs:** TypeScript compilation fails; Vite dev server throws module resolution error.

### Pitfall 5: npm install Not Run
**What goes wrong:** All imports from `recharts`, `react-router-dom` fail — `node_modules` is empty.
**Why it happens:** `web/node_modules/` directory is empty (no `npm install` has been run). [VERIFIED: codebase scan]
**How to avoid:** `cd web && npm install` before writing any code.
**Warning signs:** Every third-party import fails with module resolution error.

### Pitfall 6: Double BrowserRouter
**What goes wrong:** Navigation appears to work but nested routes break; active link detection is wrong.
**Why it happens:** `main.tsx` already wraps `<App>` in `<BrowserRouter>`. If `App.tsx` also adds `<BrowserRouter>`, there are two nested routers.
**How to avoid:** Remove `BrowserRouter` import from `main.tsx` when restructuring `App.tsx` to own it — or leave `BrowserRouter` in `main.tsx` and just add `<Routes>` inside `App`.
**Warning signs:** React warns "You cannot render a <Router> inside another <Router>".

### Pitfall 7: Total Line Stacked by Accident
**What goes wrong:** Total line height is 2× the actual total (stacked on top of the category series).
**Why it happens:** `<Line dataKey="total">` given a `stackId="wealth"` adds `total` on top of all category values.
**How to avoid:** The total `<Line>` must have NO `stackId`.
**Warning signs:** The "Total" line appears at 2× the expected Y value; it does not match `current_total` from the API.

### Pitfall 8: localStorage Key Discrepancy
**What goes wrong:** Chart type resets on every page load; persisted value never reads.
**Why it happens:** If the write key differs from the read key (e.g. `wealthtrack_chart_type_dashboard` vs `dashboard-chart-type`), the stored value is never found.
**Authoritative key:** `dashboard-chart-type` — per UI-SPEC section 2 and ROADMAP Plan 5.3. [VERIFIED: UI-SPEC and ROADMAP]
**Warning signs:** Chart type always reverts to `"area"` on reload.

---

## Code Examples

### SummaryResponse Type (mirrors backend exactly)

```typescript
// web/src/types/index.ts
// Source: server/src/calc/summary.ts SummaryResponse interface [VERIFIED: codebase]
export interface SummaryResponse {
  months: string[]
  series: {
    category_id: string
    category_name: string
    color: string
    values: number[]           // parallel to months[]
  }[]
  totals: number[]             // parallel to months[]
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

export interface ProjectionsResponse {
  historical: SummaryResponse  // max range, same shape
  projection: {
    months: string[]
    series: { category_id: string; category_name: string; color: string; values: number[] }[]
    totals: number[]
  }
}
```

### Period Change Formatting (U+2212 minus sign)

```typescript
// Source: UI-SPEC copywriting contract [VERIFIED: UI-SPEC]
// Use U+2212 MINUS SIGN (−), NOT hyphen-minus (-) for negative prefix
function formatDelta(abs: number, pct: number): { text: string; positive: boolean } {
  const formatted = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(Math.abs(abs))
  const prefix = abs >= 0 ? '+' : '\u2212'
  const pctStr = abs >= 0 ? `+${pct.toFixed(2)}%` : `\u2212${Math.abs(pct).toFixed(2)}%`
  return { text: `${prefix}${formatted} (${pctStr})`, positive: abs >= 0 }
}
```

### Nav Active Link Detection

```typescript
// Source: react-router-dom v6 API [ASSUMED — standard pattern]
import { NavLink } from 'react-router-dom'

// NavLink provides isActive automatically
<NavLink
  to="/"
  className={({ isActive }) =>
    isActive ? 'text-blue-600 font-medium text-sm' : 'text-gray-500 font-medium text-sm hover:text-gray-900'
  }
>
  Dashboard
</NavLink>
```

### Skeleton Loading State

```typescript
// Source: UI-SPEC Interaction Contract 5 [VERIFIED: UI-SPEC]
{isLoading ? (
  <>
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
      {[0,1,2].map(i => <div key={i} className="h-24 bg-gray-100 rounded-lg animate-pulse" />)}
    </div>
    <div className="h-[420px] bg-gray-100 rounded-lg animate-pulse" />
  </>
) : (
  <> {/* actual SummaryCards + WealthChart */} </>
)}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `toISOString().slice(0,7)` for month keys | Integer arithmetic `padStart` | Phase 1 decision | Prevents UTC-shift month corruption for UTC+ users |
| `window.location.origin` base URL | Relative `/api/v1/...` | Phase 5 design | Works in dev proxy + prod same-origin without env vars |
| `AreaChart` / `LineChart` / `BarChart` separately | `ComposedChart` | Recharts design | Required to mix Area/Bar/Line in one chart (total overlay) |

---

## Open Questions (RESOLVED)

1. **BrowserRouter placement conflict**
   - What we know: `main.tsx` already wraps `<App>` in `<BrowserRouter>`; ROADMAP Plan 5.2 says `App.tsx` should have `<BrowserRouter>`
   - What's unclear: Which file should own the router — moving it to `App.tsx` requires modifying `main.tsx`
   - Recommendation: Keep `BrowserRouter` in `main.tsx` (already works); add only `<Routes>` in `App.tsx`. This is a clean separation and avoids modifying a working file unnecessarily. Alternatively, move it to `App.tsx` and remove from `main.tsx` — either is valid, just must not duplicate.
   - RESOLVED: Keep BrowserRouter in `main.tsx`; Plan 05-02 adds only `<Routes>` inside App.tsx. Acceptance criteria in 05-02 verifies 0 BrowserRouter occurrences in App.tsx.

2. **Stub pages for /projections and /admin**
   - What we know: Routes must exist for nav links to work; full implementation is Phase 6/7
   - What's unclear: How minimal the stubs should be
   - Recommendation: One-liner page components returning `<div className="p-8 text-gray-500">Coming soon</div>` — enough for routing to work, no wasted effort
   - RESOLVED: Plan 05-02 implements one-liner `<div className="p-8 text-gray-500">Coming soon</div>` stubs for ProjectionsPage and AdminPage. DashboardPage stub also created in 05-02 so App.tsx import resolves at compile time.

3. **Range pill labels vs API query param mapping**
   - What we know: Pills are labelled `YTD · 6M · 1Y · 2Y · 3Y · 5Y · 10Y · Max`; API accepts `ytd · 6m · 1y · 2y · 3y · 5y · 10y · max`
   - What's unclear: Mapping is implicit (lowercase the label)
   - Recommendation: `const RANGES = [{ label: 'YTD', value: 'ytd' }, { label: '6M', value: '6m' }, ...]` — explicit mapping avoids bugs
   - RESOLVED: Plan 05-04 implements an explicit `RANGES` constant array with `{ label, value }` pairs. Acceptance criteria verifies `RANGES` is present in DashboardPage.tsx.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | npm install, Vite dev | ✓ | (Darwin host) | — |
| npm | Package installation | ✓ | (bundled with Node) | — |
| recharts (npm registry) | WealthChart | ✓ | ^2.13.0 pin (3.8.1 latest) | — |
| react-router-dom (npm registry) | Nav, routing | ✓ | ^6.26.0 pin (7.14.2 latest) | — |
| lucide-react (npm registry) | Nav, ChartTypeSelector | ✓ | 1.8.0 latest | — |
| web/node_modules/ | All imports | **✗ EMPTY** | — | Run `npm install` — **Wave 0 blocker** |
| lucide-react in package.json | Nav, ChartTypeSelector | **✗ MISSING** | — | Add + install — **Wave 0 blocker** |
| Hono backend (localhost:8080) | API calls during dev | ✓ (built Phase 1–4) | — | `cd server && npm run dev` |

**Missing dependencies with no fallback:**
- `web/node_modules/` is empty — ALL npm packages unavailable until `npm install` is run
- `lucide-react` not in `web/package.json` — Nav hamburger and chart type icons will fail to build

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Node.js built-in `node:test` (used in server tests) |
| Config file | None — invoked directly |
| Quick run (server) | `cd server && npx tsx --test src/calc/*.test.ts` |
| Full suite (server) | `cd server && npx tsx --test src/calc/*.test.ts` |

> **Frontend test infrastructure: NONE.** Phase 5 introduces the first frontend code but there is no frontend test framework (no Vitest, no Jest, no testing-library). The server uses `node:test` for pure calculation units, which is appropriate for backend pure functions but cannot test React components.

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| FE-01 | API client returns typed responses; non-2xx throws ApiError | manual-only | `curl http://localhost:8080/api/v1/summary?range=1y` | ❌ Wave 0 — no frontend test infra |
| FE-02 | TypeScript types match backend interfaces | compile-time | `cd web && npx tsc --noEmit` | ❌ Wave 0 — types file not yet created |
| FE-03 | Nav renders, hamburger works, active link highlights | manual-only | Visual inspection at localhost:5173 | ❌ Wave 0 |
| FE-04 | category_id used as Recharts dataKey | compile-time + manual | `cd web && npx tsc --noEmit` | ❌ Wave 0 |
| DASH-01 | Range pills trigger re-fetch | manual | Select pills in browser | ❌ Wave 0 |
| DASH-02 | Chart renders per-category series + total line | manual | Visual inspection | ❌ Wave 0 |
| DASH-03 | Tooltip shows per-category + total values | manual | Hover chart in browser | ❌ Wave 0 |
| DASH-04 | Chart type persists across reload | manual | Toggle → refresh → confirm | ❌ Wave 0 |
| DASH-05 | Summary cards display correct totals | manual | Compare cards to API JSON | ❌ Wave 0 |

### Sampling Rate

- **Per task commit:** `cd web && npx tsc --noEmit` (type-check only — no runtime test framework)
- **Per wave merge:** `cd web && npx tsc --noEmit && npm run build` (full build)
- **Phase gate:** `npm run build` succeeds (no TS errors, Vite bundles without error) + manual smoke check of all 9 requirements in browser

### Wave 0 Gaps

- [ ] `cd web && npm install` — install all declared dependencies (node_modules is empty)
- [ ] `cd web && npm install lucide-react` — add missing dependency to package.json
- [ ] No frontend test framework — out of scope for Phase 5 (pure Tailwind + Recharts components; testing-library setup is Phase 6+ scope or a separate test infrastructure phase)

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | No auth in scope (single household, trust the network) |
| V3 Session Management | no | No sessions |
| V4 Access Control | no | No access control |
| V5 Input Validation | partial | Range parameter is a fixed enum on the client; server validates with Zod (already done Phase 3) |
| V6 Cryptography | no | No crypto operations on frontend |

### Known Threat Patterns for React SPA

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| XSS via unsanitized API data rendered as HTML | Tampering | React's JSX escapes by default; avoid `dangerouslySetInnerHTML` — not used in this phase |
| Prototype pollution via `category_id` as dynamic object key | Tampering | Category IDs are server-validated slugs (alphanumeric + hyphens); no user-controlled input used as object keys in this phase |

> **Net:** Phase 5 has minimal security surface — read-only data display from a trusted same-origin API, no user authentication, no form submission in this phase (that's Phase 6 Admin).

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `NavLink` from react-router-dom v6 provides `isActive` in className callback | Code Examples | If wrong, active link detection needs manual `useLocation()` comparison — low risk, easy to fix |
| A2 | Recharts `ComposedChart` supports mixing `Area`/`Line`/`Bar` in v2.13.x | Standard Stack / Patterns | Would require switching to mode-specific chart components; medium refactor risk |
| A3 | `localStorage.getItem` returns `null` (not `undefined`) when key is absent | Pattern 4 | `null ?? 'area'` handles this correctly in both cases |
| A4 | `Intl.NumberFormat('de-DE', ...)` is available in all target browsers | Code Examples | All modern browsers support it; not a risk |

---

## Sources

### Primary (HIGH confidence)
- `server/src/calc/summary.ts` — `SummaryResponse` interface verified [VERIFIED: codebase]
- `server/src/models/index.ts` — `Category`, `Asset`, `DataPoint` interfaces verified [VERIFIED: codebase]
- `web/package.json` — installed dependencies verified [VERIFIED: codebase]
- `web/src/main.tsx` — `BrowserRouter` already imported [VERIFIED: codebase]
- `web/vite.config.ts` — Vite proxy `/api` → `http://localhost:8080` verified [VERIFIED: codebase]
- `web/tailwind.config.ts` — content globs, no theme extensions verified [VERIFIED: codebase]
- `.planning/phases/05-dashboard-frontend/05-UI-SPEC.md` — full interaction contracts [VERIFIED: codebase]
- `.planning/ROADMAP.md` Phase 5 plans — plan descriptions and verification gates [VERIFIED: codebase]
- npm registry — recharts 3.8.1, react-router-dom 7.14.2, lucide-react 1.8.0 [VERIFIED: npm view]

### Secondary (MEDIUM confidence)
- `web/src/` directory scan — empty directories, no existing component files [VERIFIED: bash find]
- `web/node_modules/` scan — empty, no packages installed [VERIFIED: bash ls]

### Tertiary (LOW confidence)
- Recharts v2 `ComposedChart` API (Area + Line + Bar mixing) — from training knowledge [ASSUMED: A2 above]
- react-router-dom v6 `NavLink` `isActive` callback — from training knowledge [ASSUMED: A1 above]

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — versions confirmed via npm registry and package.json
- Architecture: HIGH — API shapes verified from backend source; Vite proxy verified from config
- Recharts pitfalls: HIGH — documented verbatim in ROADMAP.md, REQUIREMENTS.md FE-04, and UI-SPEC
- Frontend test strategy: HIGH — confirmed absence of test framework via codebase scan

**Research date:** 2026-04-22
**Valid until:** 2026-07-22 (stable Recharts/React Router APIs; check if recharts 3.x changes ComposedChart API before upgrading)
