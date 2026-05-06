# Roadmap: WealthTrack

## Overview

WealthTrack is built bottom-up: data model and storage first (the only stateful layer), then CRUD API, then pure calculation layers (summary, projections), then frontend surfaces (Dashboard, Admin, Projections), and finally Docker packaging. Each phase is fully testable before the next begins — no layer is built on an untested foundation. The two highest-risk areas (atomic file I/O and time-series math correctness) are addressed in Phases 1–4 before any UI work starts.

---

## Phases

- [x] **Phase 1: Data Foundation** — TypeScript models, mutex-guarded YAML storage, first-run bootstrap
- [x] **Phase 2: CRUD API** — REST endpoints for categories, assets, data points; Zod validation; SPA static serving
- [x] **Phase 3: Summary Aggregation** — LOCF gap-filling, time range filtering, summary cards computation
- [x] **Phase 4: Projections Calculation** — Compound monthly growth, growth rate resolution, combined response shape
- [x] **Phase 5: Dashboard Frontend** — API client, React Router, Recharts chart, time range selector, summary cards
- [x] **Phase 6: Admin Panel Frontend** — Data Points / Assets / Categories tabs with CRUD modals
- [ ] **Phase 7: People & Person Filter** — Person model + CRUD API, asset person_id, Admin People tab, Dashboard person filter
- [ ] **Phase 8: PrimeReact UI Redesign** — Install PrimeReact, full app redesign (all pages + Phase 7 frontend components)
  - [ ] 08-01-PLAN.md — Foundation: PrimeReact install + theme config + Phase 7 types + API client
  - [ ] 08-02-PLAN.md — Layout + Dashboard: Nav, SummaryCards, ChartTypeSelector, DashboardPage redesign + person filter
  - [ ] 08-03-PLAN.md — Admin Tables: TabView (4 tabs), DataTable for all tabs, PeopleTab (new)
  - [ ] 08-04-PLAN.md — Modals/Dialogs: PrimeReact Dialog for all modals, PersonModal (new), smoke check
- [ ] **Phase 9: Projections Frontend** — Combined historical+projected chart, horizon selector, projection tables
- [ ] **Phase 10: Docker & Deployment** — Multi-stage Dockerfile, docker-compose, non-root user, README

---

## Phase Details

## Phase 1: Data Foundation

**Goal:** Establish the type-safe data model and a crash-safe, concurrency-safe YAML storage layer that every subsequent layer depends on.
**Depends on:** Nothing (first phase)
**Plans:** 4 plans

Plans:
- [x] 01-1-PLAN.md — Remove Go scaffold, initialize Hono backend (package.json, tsconfig.json, health endpoint)
- [x] 01-2-PLAN.md — TypeScript data model interfaces (Category, Asset, DataPoint, Database) + seed constant
- [x] 01-3-PLAN.md — YAML storage layer: singleton mutex + readDb/mutateDb with writeFileAtomic
- [x] 01-4-PLAN.md — First-run bootstrap: ENOENT seed write + corrupt YAML crash guard

### Plans

#### Plan 1.1: Remove Go Scaffold and Initialize Hono Backend

Delete `cmd/server/main.go` (and the `cmd/` directory) and the `go.mod` file. Create `server/` directory with `package.json` (`"type": "module"`), `tsconfig.json` (ESM, strict, NodeNext resolution), and a minimal `server/src/index.ts` that starts a Hono app via `@hono/node-server` on `process.env.PORT ?? 8080`. Install dependencies: `hono ^4.12.14`, `@hono/node-server ^2.0.0`, `@hono/zod-validator ^0.7.0`, `zod ^3.24.4`, `yaml ^2.8.3`, `async-mutex ^0.5.0`, `write-file-atomic ^7.0.1`; dev deps: `tsx ^4.21.0`, `typescript`, `@types/node`, `@types/write-file-atomic`. Add a `dev` script: `tsx watch src/index.ts`.

**Verification:**
- [ ] `cmd/` directory and `go.mod` are deleted from repository
- [ ] `server/package.json` exists with `"type": "module"` and all required dependencies listed
- [ ] `server/src/index.ts` compiles without errors (`npx tsc --noEmit` passes)
- [ ] `GET /api/v1/health` returns `{"status":"ok"}` when server is started with `npm run dev`

#### Plan 1.2: TypeScript Data Models

Create `server/src/models/index.ts` defining four TypeScript interfaces: `Category` (`id: string`, `name: string`, `projected_yearly_growth: number`, `color: string`), `Asset` (`id: string`, `name: string`, `category_id: string`, `projected_yearly_growth: number | null`, `location?: string`, `notes?: string`, `created_at: string`), `DataPoint` (`id: string`, `asset_id: string`, `year_month: string`, `value: number`, `notes?: string`, `created_at: string`, `updated_at: string`), and `Database` (`categories: Category[]`, `assets: Asset[]`, `dataPoints: DataPoint[]`). No runtime logic — pure type definitions only.

> ⚠️ **`year_month` format:** Always built from integer parts — `String(year).padStart(4,'0') + '-' + String(month).padStart(2,'0')` — never `.toISOString().slice(0,7)`. `.toISOString()` uses UTC, which shifts months at local-midnight boundaries.

**Verification:**
- [ ] `server/src/models/index.ts` exports `Category`, `Asset`, `DataPoint`, `Database` interfaces
- [ ] All four types are importable in other modules without compilation errors
- [ ] `projected_yearly_growth` on `Asset` is typed as `number | null` (not optional `?`)

#### Plan 1.3: YAML Storage Layer with Mutex and Atomic Writes

Create `server/src/storage/mutex.ts` exporting a single `dbMutex = new Mutex()` singleton — never instantiate `Mutex` anywhere else. Create `server/src/storage/index.ts` implementing `readDb(): Promise<Database>` and `mutateDb(fn: (db: Database) => Database): Promise<void>`. Both functions must call `dbMutex.runExclusive(...)` for the full read-modify-write cycle. The write path must write to `DB_PATH + '.tmp'` via `writeFile` then `rename(tmp, DB_PATH)` — never write directly to `database.yaml`. Storage path: `process.env.DATA_FILE ?? '/data/database.yaml'`.

> ⚠️ **Atomic rename:** Use `write-file-atomic`'s `writeFileAtomic()` or the manual `writeFile(tmp) → rename(tmp, dest)` pattern. Never call `fs.writeFile(DB_PATH, ...)` directly — a crash mid-write produces a zero-byte or truncated YAML file with no recovery path.
>
> ⚠️ **Singleton mutex:** One `new Mutex()` in `mutex.ts`. Any additional `new Mutex()` elsewhere provides zero protection — each instance has its own independent queue.

**Verification:**
- [ ] `readDb()` and `mutateDb()` both use `dbMutex.runExclusive(...)`
- [ ] Write path creates a `.tmp` file then renames it (grep confirms no direct `writeFile(DB_PATH, ...)` call)
- [ ] `DATA_FILE` env var overrides the default `/data/database.yaml` path
- [ ] Two concurrent `mutateDb` calls serialize correctly (second awaits first)

#### Plan 1.4: First-Run Bootstrap Logic

In `server/src/index.ts`, before starting the HTTP server, call a `bootstrapDatabase()` function. If `DATA_FILE` path does not exist (catch `ENOENT`), create the directory if needed and write a fresh `database.yaml` containing four seeded categories: `{ id: 'stocks', name: 'Stocks', projected_yearly_growth: 0.08, color: '#6366f1' }`, `{ id: 'real-estate', name: 'Real Estate', projected_yearly_growth: 0.05, color: '#10b981' }`, `{ id: 'crypto', name: 'Crypto', projected_yearly_growth: 0.15, color: '#f59e0b' }`, `{ id: 'cash', name: 'Cash', projected_yearly_growth: 0.02, color: '#64748b' }` — with empty `assets: []` and `dataPoints: []` arrays. Use `mutateDb` or the atomic write helper; never `fs.writeFile` directly.

**Verification:**
- [ ] Server starts cleanly when `DATA_FILE` path does not exist
- [ ] After first boot, `database.yaml` exists with 4 seeded categories and empty `assets`/`dataPoints`
- [ ] Second boot with existing file does not overwrite or modify it
- [ ] Bootstrap uses atomic write (no direct `fs.writeFile` to target path)

**Requirements covered:** STOR-01, STOR-02, STOR-03, STOR-04, MODEL-01, MODEL-02, MODEL-03

---

## Phase 2: CRUD API

**Goal:** Deliver a complete REST API for all three resources — categories, assets, data points — with Zod validation, referential integrity enforcement, and React SPA static serving.
**Depends on:** Phase 1
**Plans:** 3 plans

Plans:
- [x] 02-1-PLAN.md — Categories and Assets route handlers (GET/POST/PUT/DELETE, Zod validation, referential integrity)
- [x] 02-2-PLAN.md — Data Points route handlers (GET sorted desc, POST UUID+timestamps, PUT updated_at, DELETE)
- [x] 02-3-PLAN.md — Wire routers into index.ts: onError handler, serveStatic, SPA catch-all

### Plans

#### Plan 2.1: Categories and Assets Route Handlers

Create `server/src/routes/categories.ts` implementing `GET /api/v1/categories`, `POST /api/v1/categories`, `PUT /api/v1/categories/:id`, `DELETE /api/v1/categories/:id`. Post/Put schemas (Zod): `name` (string, min 1), `projected_yearly_growth` (number), `color` (hex string). For `POST`, generate `id` as a URL-friendly slug from `name` (lowercase, spaces→hyphens, strip non-alphanumeric). `PUT` must reject attempts to change `id` with 400. `DELETE` must call `readDb()`, check if any asset has `category_id === id`, and return 409 `{"error":"Category is in use by N asset(s)"}` if so. Create `server/src/routes/assets.ts` with the same pattern: `GET`, `POST`, `PUT`, `DELETE /api/v1/assets/:id`. `POST` validates `category_id` exists in `db.categories`; `DELETE` checks for referencing data points (409 if any). Asset `created_at` is set on creation using `new Date().toISOString()` and is immutable. Mount both routers in `index.ts`.

> **Plans 2.1 and 2.2 can be developed in parallel** once Phase 1 storage layer is confirmed working.

**Verification:**
- [ ] `GET /api/v1/categories` returns array of all categories (200)
- [ ] `POST /api/v1/categories` creates and returns new category; returns 400 for missing fields
- [ ] `DELETE /api/v1/categories/:id` returns 409 when an asset references it
- [ ] `DELETE /api/v1/assets/:id` returns 409 when a data point references it
- [ ] `PUT /api/v1/assets/:id` with a changed `id` field returns 400

#### Plan 2.2: Data Points Route Handlers

Create `server/src/routes/dataPoints.ts` implementing `GET /api/v1/data-points` (returns all, sorted by `year_month` descending), `POST /api/v1/data-points`, `PUT /api/v1/data-points/:id`, `DELETE /api/v1/data-points/:id`. Zod schema for create/update: `asset_id` (string), `year_month` (string matching `/^\d{4}-\d{2}$/`), `value` (number, positive — reject ≤ 0 with 400), `notes` (string optional). `POST` generates `id` via `crypto.randomUUID()`, sets both `created_at` and `updated_at` to `new Date().toISOString()`, and validates `asset_id` exists. `PUT` updates `updated_at` to `new Date().toISOString()` and must not allow `id` or `asset_id` changes. `DELETE` has no restrictions. Mount router in `index.ts`.

> ⚠️ **`year_month` input:** Accept the client-provided `YYYY-MM` string. Do not convert it server-side with `toISOString()`. The client's month picker must also supply integer-derived values.

**Verification:**
- [ ] `POST /api/v1/data-points` with `value: 0` returns 400
- [ ] `POST /api/v1/data-points` with non-existent `asset_id` returns 404
- [ ] `PUT /api/v1/data-points/:id` updates `updated_at` to current time
- [ ] `GET /api/v1/data-points` returns points sorted newest `year_month` first
- [ ] `DELETE /api/v1/data-points/:id` returns 200 with no restrictions

#### Plan 2.3: Error Handling, Health Endpoint, and SPA Static Serving

Register a global Hono error handler that catches unhandled errors and returns `{"error":"Internal server error"}` with 500. Add `GET /api/v1/health → {"status":"ok"}`. In `server/src/index.ts`, configure middleware registration order: (1) API routes (`/api/v1/*`), (2) `serveStatic` from `@hono/node-server/serve-static` pointing at `process.env.WEB_DIST ?? '../web/dist'`, (3) SPA catch-all: any non-API `GET *` returns `web/dist/index.html`. All error responses across all routes use the shape `{"error":"<message>"}` — 400 for validation, 404 for not found, 409 for constraint violations, 500 for unexpected errors.

> ⚠️ **Middleware order is critical:** API routes must be registered _before_ `serveStatic`, and `serveStatic` must come _before_ the SPA catch-all. Reversing any part silently breaks either API routing or static asset delivery.

**Verification:**
- [ ] `GET /api/v1/health` returns `{"status":"ok"}` (200)
- [ ] `GET /api/v1/categories/nonexistent` returns `{"error":"..."}` shape (404)
- [ ] `GET /dashboard` (non-API path) returns HTML content of `index.html`
- [ ] Static assets (`/assets/main.js`) are served correctly without hitting catch-all
- [ ] Unhandled thrown errors return 500 with `{"error":"Internal server error"}`

**Requirements covered:** CAT-01, CAT-02, CAT-03, CAT-04, ASSET-01, ASSET-02, ASSET-03, ASSET-04, DP-01, DP-02, DP-03, DP-04, API-01, API-02, API-03

---

## Phase 3: Summary Aggregation

**Goal:** Deliver `GET /api/v1/summary?range=` with correct LOCF gap-filling, per-range month boundaries, upsert semantics, and summary card data.
**Depends on:** Phase 2
**Plans:** 3 plans

Plans:
- [x] 03-01-PLAN.md — Month key utilities (toMonthKey, monthRange) + LOCF gap-fill algorithm (locfFill)
- [x] 03-02-PLAN.md — Range bounds calculation (getRangeBounds) + summary endpoint wiring + index.ts mount
- [x] 03-03-PLAN.md — aggregateSummary + SummaryResponse + full response shape wired into route handler

### Plans

#### Plan 3.1: Month Key Utilities and LOCF Gap-Fill Algorithm

Create `server/src/calc/utils.ts` with: `toMonthKey(year: number, month: number): string` — pads and joins with `-`; `monthRange(startYM: string, endYM: string): string[]` — generates ordered array of `YYYY-MM` strings using integer arithmetic (`m > 12 → m=1, y++`), never `new Date()` for iteration. Create `server/src/calc/summary.ts` with `locfFill(months: string[], dataPoints: DataPoint[], assets: Asset[]): Map<string, Map<string, number>>` — for each asset, for each month in `months`: find data points for that `asset_id + year_month`, select the one with latest `updated_at` (upsert semantics), carry forward last known value if none found, use `0` if no prior value exists at all.

> ⚠️ **LOCF boundary:** Before an asset's _first ever_ data point, the carried value must be `0` — not the first known value. Seed the carry variable as `null`; when a month has data, update carry to that value; when carry is `null`, emit `0`. A backward-carry bug (using first known value for prior months) overstates historical wealth.
>
> ⚠️ **Month iteration:** Use `if (m > 12) { m = 1; y++ }` pattern — `new Date(y, m, 1)` can produce wrong results at DST boundaries in some timezones.

**Verification:**
- [ ] `toMonthKey(2024, 1)` returns `"2024-01"` and `toMonthKey(2024, 12)` returns `"2024-12"`
- [ ] `monthRange("2024-11", "2025-02")` returns `["2024-11","2024-12","2025-01","2025-02"]`
- [ ] Month before asset's first data point is filled with `0`, not the first value
- [ ] Two data points for same asset + month: the one with later `updated_at` wins

#### Plan 3.2: Range Calculation and Summary Endpoint Wiring

Create `server/src/calc/ranges.ts` with `getRangeBounds(range: string, latestMonth: string): { startYM: string, endYM: string }` supporting all eight range values: `ytd` (Jan of current year → latest), `6m` (6 months back → latest), `1y`, `2y`, `3y`, `5y`, `10y`, `max` (earliest data point → latest). Create `server/src/routes/summary.ts` implementing `GET /api/v1/summary?range=` — accepts the range param (default `1y`, reject unknown values with 400), calls `readDb()`, resolves range bounds, runs LOCF fill, aggregates per-category totals, and returns the full response.

**Verification:**
- [ ] `range=ytd` returns months from `YYYY-01` to current month
- [ ] `range=6m` returns exactly 6 months
- [ ] Unknown `range=foo` returns 400 `{"error":"..."}`
- [ ] Response `months[]` count matches the range span
- [ ] `series[]` has one entry per category; each `values[]` length matches `months[]` length

#### Plan 3.3: Aggregated Response Shape and Summary Cards

Extend `server/src/calc/summary.ts` with `aggregateSummary(locfData, categories, months)` that returns: `months: string[]`, `series: { category_id, category_name, color, values: number[] }[]` (one per category), `totals: number[]` (sum across all categories per month), `current_total` (last element of `totals`), `period_delta_abs` (last minus first total in range, in EUR), `period_delta_pct` (delta / first × 100, guard divide-by-zero with 0 if first is 0), `category_breakdown: { category_id, category_name, color, value, pct_of_total }[]` (value = last month per category, pct = value / current_total × 100). Wire this output into the route handler.

**Verification:**
- [ ] `current_total` equals the sum of all category values in the most recent month
- [ ] `period_delta_abs` is negative when wealth decreased over the period
- [ ] `category_breakdown[].pct_of_total` values sum to ~100% (float tolerance)
- [ ] `series[].values` contains LOCF-filled values (no `null`, no gaps)
- [ ] Response for a database with zero data points returns all-zero arrays without throwing

**Requirements covered:** SUM-01, SUM-02, SUM-03, SUM-04, SUM-05

---

## Phase 4: Projections Calculation

**Goal:** Deliver `GET /api/v1/projections?years=` with compound monthly growth per asset, growth rate inheritance, and a combined historical + projection response.
**Depends on:** Phase 3

### Plans

#### Plan 4.1: Compound Monthly Rate Helper and Growth Rate Resolution

Create `server/src/calc/projections.ts` with: `compoundMonthlyRate(annualRate: number): number` — returns `Math.pow(1 + annualRate, 1 / 12) - 1`. Add `resolveGrowthRate(asset: Asset, categories: Category[]): number` — returns `asset.projected_yearly_growth` if non-null, otherwise looks up `asset.category_id` in categories and returns the category's `projected_yearly_growth`. If the category is not found, default to `0`.

> ⚠️ **Never use `annualRate / 12`** as the monthly rate. Simple division understates compounding by ~2% over 10 years at 7% — a meaningful error for a retirement planning tool. The formula `(1 + r)^(1/12) - 1` is mandatory.

**Verification:**
- [ ] `compoundMonthlyRate(0.08)` returns approximately `0.006434` (not `0.006667`)
- [ ] Asset with `projected_yearly_growth: null` inherits from its category
- [ ] Asset with explicit `projected_yearly_growth: 0.10` overrides category value
- [ ] Missing category ID defaults to growth rate `0`

#### Plan 4.2: Projection Sequence Calculation

Add `buildProjection(assets: Asset[], categories: Category[], dataPoints: DataPoint[], years: number): ProjectionSeries[]` to `server/src/calc/projections.ts`. For each asset: find its latest data point (by `year_month` string comparison), set the starting value to that data point's value (LOCF-selected — latest `updated_at` wins for the latest month). Projection starts the month _after_ the latest data point. Apply `value * (1 + monthlyRate)` per month for `years * 12` months. Assets with no data points start projecting from current month with value `0`. Return per-asset monthly values, then aggregate per category and as totals.

**Verification:**
- [ ] Projection first month is the month after the asset's latest data point
- [ ] After 12 months at 8% annual rate, value equals `startValue * 1.08` (±0.01%)
- [ ] Asset with no data points projects from current month with value `0`
- [ ] `years=30` generates exactly `360` projection months

#### Plan 4.3: Projections Endpoint and Combined Response Shape

Add `GET /api/v1/projections?years=` route to `server/src/routes/summary.ts` (or a dedicated `routes/projections.ts`). Accepts `years` param: integer, default 10, max 30 (clamp or reject with 400). Calls `readDb()`, runs LOCF summary for `max` range (for historical portion), runs `buildProjection`, and returns: `historical: { months, series, totals }` (same shape as summary max range), `projection: { months, series, totals }` (projection shape). The last month of `historical` and first month of `projection` must not overlap — `projection.months[0]` is always one month after the last element of `historical.months`.

**Verification:**
- [ ] `GET /api/v1/projections` returns both `historical` and `projection` keys
- [ ] `projection.months[0]` is one month after `historical.months` last element
- [ ] `years=31` returns 400 `{"error":"..."}`
- [ ] `series` arrays in both portions share the same `category_id` set
- [ ] `totals` length equals `months` length in both portions

**Requirements covered:** PROJ-01, PROJ-02, PROJ-03, PROJ-04, PROJ-05

---

## Phase 5: Dashboard Frontend

**Goal:** Deliver the Dashboard page with a typed API client, responsive navigation, Recharts chart with time range and chart type selectors, and summary cards.
**Depends on:** Phase 4
**Plans:** 4 plans

Plans:
- [ ] 05-01-PLAN.md — npm install + lucide-react + shared TypeScript types + typed API client (Wave 1)
- [ ] 05-02-PLAN.md — React Router wiring (App.tsx Routes) + responsive Nav component with hamburger (Wave 2)
- [ ] 05-03-PLAN.md — ChartTypeSelector (icon buttons + localStorage hook) + WealthChart (ComposedChart, 3 modes) (Wave 3)
- [ ] 05-04-PLAN.md — SummaryCards (3 financial summary cards) + DashboardPage (range pills, fetch lifecycle, full layout) (Wave 4)

### Plans

#### Plan 5.1: TypeScript API Client and Shared Types

Create `web/src/types/index.ts` mirroring all backend interfaces: `Category`, `Asset`, `DataPoint`, `SummaryResponse` (with `months`, `series`, `totals`, `current_total`, `period_delta_abs`, `period_delta_pct`, `category_breakdown`), `ProjectionsResponse` (with `historical` and `projection`). Create `web/src/api/client.ts` with typed `fetch` wrappers: `getCategories()`, `createCategory(data)`, `updateCategory(id, data)`, `deleteCategory(id)`, `getAssets()`, `createAsset(data)`, `updateAsset(id, data)`, `deleteAsset(id)`, `getDataPoints()`, `createDataPoint(data)`, `updateDataPoint(id, data)`, `deleteDataPoint(id)`, `getSummary(range: string)`, `getProjections(years: number)`. All functions throw a typed `ApiError` with `message` and `status` on non-2xx responses.

> ⚠️ **No `toISOString()` for month keys on the frontend either.** When constructing `year_month` from a date picker, use `String(date.getFullYear()) + '-' + String(date.getMonth() + 1).padStart(2, '0')`.

**Verification:**
- [ ] `web/src/types/index.ts` exports all model types with no `any`
- [ ] `getSummary('1y')` returns `Promise<SummaryResponse>` (TypeScript compiles without errors)
- [ ] Non-2xx responses throw `ApiError` with `status` and `message` populated
- [ ] API base URL is derived from `window.location.origin` (works both in dev proxy and production)

#### Plan 5.2: React Router Setup and Top Navigation

Install `react-router-dom ^6`. Create `web/src/App.tsx` with `<BrowserRouter>` and three routes: `/` → `<Dashboard>`, `/projections` → `<Projections>`, `/admin` → `<Admin>`. Create `web/src/components/Nav.tsx`: horizontal nav bar with "WealthTrack" logo/title on left, three nav links (Dashboard · Projections · Admin) on right; on mobile (<640px) collapses to a hamburger button that toggles a vertical dropdown. Active route is highlighted. Nav is persistent across all pages (rendered outside `<Routes>`).

**Verification:**
- [ ] Navigating to `/`, `/projections`, `/admin` renders the correct page without full reload
- [ ] Active nav link is visually highlighted on each route
- [ ] On mobile viewport (375px), nav links are hidden and hamburger button is visible
- [ ] Hamburger click toggles nav link visibility
- [ ] Reloading `/projections` directly (SPA catch-all) works without 404

#### Plan 5.3: Dashboard Chart with Range Selector and Chart Type Toggle

Create `web/src/components/ChartTypeSelector.tsx`: three icon buttons (Stacked Area / Line / Stacked Bar), reads/writes chart type to `localStorage` under a `storageKey` prop. Create `web/src/components/WealthChart.tsx`: wraps a Recharts `ComposedChart` inside `ResponsiveContainer` with an explicit `h-[420px]` parent div. Renders one `<Area>` (or `<Line>` or `<Bar>`) per category. All `<Area>`/`<Bar>` share `stackId="wealth"` when in stacked mode. `dataKey` for each series uses `category_id` (the slug, e.g. `"stocks"`) — never `category_name`. Tooltip shows each category value + total. Legend uses category `color`. Create `web/src/pages/Dashboard.tsx`: fetches `getSummary(range)` on mount and on range change, renders time range pill buttons (`YTD · 6M · 1Y · 2Y · 3Y · 5Y · 10Y · Max`, default `1Y`), `<ChartTypeSelector storageKey="dashboard-chart-type" />`, and `<WealthChart>`.

> ⚠️ **`dataKey` must be `category_id` (e.g., `"real-estate"`), not `category_name` (e.g., `"Real Estate"`).** Recharts parses `dataKey` as a dot-delimited object path — a name containing `.` (like `"U.S. Stocks"`) causes the series to render as zero. Category IDs are stable slugs; names are user-editable and unsafe as keys.
>
> ⚠️ **`ResponsiveContainer` requires a parent with explicit height.** Wrapping it in a `div` with `className="h-[420px]"` prevents the zero-height collapse that silently renders a blank chart.
>
> ⚠️ **Stacked charts require `stackId`** — all `<Area>` and `<Bar>` components must share the same `stackId` value (e.g. `"wealth"`) for stacking to work. Omitting it causes series to overlap instead.

**Verification:**
- [ ] Selecting `6M` pill fetches `getSummary('6m')` and re-renders chart with updated data
- [ ] Chart renders one coloured series per category from API `series[]`
- [ ] Chart type toggle switches between Area / Line / Bar views
- [ ] Selected chart type persists in `localStorage` across page refreshes
- [ ] Category IDs (not names) appear as Recharts `dataKey` values in rendered output

#### Plan 5.4: Summary Cards

Create `web/src/components/SummaryCards.tsx` consuming `SummaryResponse`. Renders: (1) "Total Net Worth" card — `current_total` formatted as `€X,XXX`, (2) "Period Change" card — `period_delta_abs` (€ with sign) and `period_delta_pct` (% with sign), coloured green/red based on sign, (3) Category breakdown list — one row per `category_breakdown` entry showing category name, value, and percentage of total. All monetary values formatted with `Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' })`. Mount cards above the chart in `Dashboard.tsx`.

**Verification:**
- [ ] Total Net Worth card shows correct value matching `current_total` from API
- [ ] Period Change card shows negative values in red, positive in green
- [ ] Category breakdown percentages sum to ~100%
- [ ] EUR formatting uses comma as decimal separator (European locale)

**Requirements covered:** FE-01, FE-02, FE-03, FE-04, DASH-01, DASH-02, DASH-03, DASH-04, DASH-05

---

## Phase 6: Admin Panel Frontend

**Goal:** Deliver a fully functional Admin panel with three tabs — Data Points, Assets, Categories — each with sortable tables, Add/Edit modals, and Delete confirmation.
**Depends on:** Phase 5

### Plans

#### Plan 6.1: Admin Shell and Data Points Tab

Create `web/src/pages/Admin.tsx` with a three-tab layout (tab bar: "Data Points · Assets · Categories") using local state for active tab. Create `web/src/components/admin/DataPointsTab.tsx`: fetches `getDataPoints()` and `getAssets()` on mount; renders a sortable table with columns Date, Asset, Category (derived from asset's `category_id`), Value (€), Notes, Actions (Edit / Delete). "Add Data Point" button opens `<DataPointModal>` in create mode. Edit button opens modal in edit mode pre-populated. Delete shows a `<ConfirmDialog>` before calling `deleteDataPoint(id)`. `<DataPointModal>` form fields: asset dropdown (from `getAssets()`), month picker (HTML `<input type="month">`), value (number, > 0), notes (optional textarea). On save, call `createDataPoint` or `updateDataPoint`, then refetch.

> ⚠️ **Month picker to `year_month`:** Extract `year_month` from the `<input type="month">` value string directly — it already returns `YYYY-MM`. Do not parse it into a `Date` and re-derive via `toISOString()`.

**Verification:**
- [ ] Data Points table displays all data points with correct asset names
- [ ] Clicking "Add" opens modal; saving calls `POST /api/v1/data-points` and row appears in table
- [ ] Clicking "Edit" pre-populates modal with existing values; saving calls `PUT`
- [ ] Clicking "Delete" shows confirmation dialog; confirming calls `DELETE` and removes row
- [ ] Attempting to save a data point with value `0` or empty shows inline validation error

#### Plan 6.2: Assets Tab

Create `web/src/components/admin/AssetsTab.tsx`: table with columns Name, Category, Growth Rate (% if set, "Inherits" if null), Location, Notes, Actions. `<AssetModal>` form: name (text), slug/id (text, auto-suggested from name as lowercase-slug, read-only after first save), category dropdown, growth rate (number in %, optional — stored as decimal: UI `8` → stored `0.08`), location, notes. On create, `id` is generated from name slug; user can edit before first save. On edit, `id` field is disabled (immutable). Delete calls `deleteAsset(id)`; displays the 409 error message inline if assets have data points.

**Verification:**
- [ ] Slug field auto-populates from name input during create (e.g. "My House" → "my-house")
- [ ] Slug field is disabled/read-only in edit mode
- [ ] Growth rate `8` in UI is sent as `0.08` to API
- [ ] Deleting an asset with data points shows inline error from 409 response
- [ ] Category dropdown populates from `getCategories()`

#### Plan 6.3: Categories Tab

Create `web/src/components/admin/CategoriesTab.tsx`: table with columns Name, Slug, Growth Rate (%), Color (colour swatch), Actions. `<CategoryModal>` form: name (text), slug (auto-suggested, immutable after save — same pattern as Asset), growth rate (%, required), color (HTML `<input type="color">`). Delete calls `deleteCategory(id)`; displays 409 error inline if category has assets. Add a "Liabilities convention" info banner at the top of the Categories tab: "To track debts, create a category (e.g. 'Liabilities') and enter asset values as negative numbers. The total net worth chart will subtract them automatically."

**Verification:**
- [ ] Color picker displays current category colour and updates preview in modal
- [ ] Growth rate is required (form cannot submit without it)
- [ ] Deleting a category with assets shows the 409 error message inline
- [ ] "Liabilities convention" info banner is visible on the Categories tab
- [ ] Slug is read-only in edit mode

**Requirements covered:** ADMIN-01, ADMIN-02, ADMIN-03, ADMIN-04, ADMIN-05

---

## Phase 7: People & Person Filter

**Goal:** Add a lightweight Person dimension to WealthTrack — Person CRUD API, asset person_id assignment, Admin People tab, and Dashboard person filter pills.
**Depends on:** Phase 6

**Plans:** 3 plans

Plans:
- [ ] 07-01-PLAN.md — Backend: Person model, seed, bootstrap migration, CRUD route, summary filter, asset schema
- [ ] 07-02-PLAN.md — Frontend Admin: Types, API client, PersonModal, PeopleTab, AdminPage 4th tab
- [ ] 07-03-PLAN.md — Frontend: AssetsTab Person column, AssetModal Person dropdown, Dashboard filter pills

**Requirements covered:** PEOPLE-01, PEOPLE-02, PEOPLE-03, PEOPLE-04, PEOPLE-05, PEOPLE-06, PEOPLE-07, PEOPLE-08

---

## Phase 8: Projections Frontend

**Goal:** Deliver the Projections page with a combined historical+projected chart (solid → dashed at today), horizon selector, projection summary table, and growth rate assumptions table.
**Depends on:** Phase 5

### Plans

#### Plan 7.1: Combined Historical and Projected Chart

Create `web/src/pages/Projections.tsx`. Fetch `getProjections(years)` on mount and on horizon change. Merge `historical` and `projection` data arrays into a single Recharts `data` array where each entry has `{ month, [category_id]: value, total, isProjected: boolean }`. Render a `ComposedChart` with two overlapping `<Area>` series per category: one for historical (solid fill, `strokeDasharray` unset) and one for projected (dashed stroke `strokeDasharray="4 4"`, lower opacity `fillOpacity={0.2}`). Add a vertical `<ReferenceLine x={todayYM} strokeDasharray="3 3" label="Today" />` at the current month boundary. Use the same `<ChartTypeSelector>` component with a separate `storageKey="projections-chart-type"`.

> ⚠️ **Merge shape:** Both `historical.series` and `projection.series` use `category_id` as the key on data objects — the same key used in the Dashboard chart. This ensures the same colour mapping works. Never use category names as keys.

**Verification:**
- [ ] Chart renders historical portion with solid lines/fills
- [ ] Chart renders projection portion with dashed lines and lower opacity
- [ ] Vertical "Today" reference line appears at the boundary month
- [ ] Chart type toggle works independently from Dashboard (separate `localStorage` key)
- [ ] No gap or overlap at the historical/projection boundary month

#### Plan 7.2: Horizon Selector and Projection Summary Table

Add year horizon pill buttons to `Projections.tsx`: `5Y · 10Y · 20Y · 30Y` (default `10Y`). On selection, call `getProjections(years)` and update chart. Create `web/src/components/ProjectionSummaryTable.tsx`: a table showing projected total net worth at milestone offsets from today — `+1Y`, `+3Y`, `+5Y`, `+10Y`, `+20Y`, `+30Y`. Look up the corresponding month in `projection.months` array (e.g. `+1Y` = 12 months out), extract `totals[index]`, and format as EUR. Display "N/A" for milestones beyond the selected horizon.

**Verification:**
- [ ] Selecting `30Y` horizon re-fetches with `years=30` and extends the chart
- [ ] Projection summary table shows 6 milestone rows
- [ ] Milestone values match the totals at the correct month indices in the projection response
- [ ] Milestones beyond the selected horizon show "N/A" instead of a value
- [ ] `+1Y` row shows the sum of all category projections 12 months from now

#### Plan 7.3: Growth Rate Assumptions Table

Create `web/src/components/GrowthRateTable.tsx`: fetches `getCategories()` and `getAssets()` and renders a table with columns Category, Effective Growth Rate (%), Assets Using Rate. For each category: show `projected_yearly_growth * 100`%. List assets that inherit the category rate (asset's `projected_yearly_growth` is null). Show assets with overrides separately with their own rates in a sub-row or tooltip. This gives users a transparent view of what the projections assume before trusting the numbers.

**Verification:**
- [ ] Table shows one row per category with correct growth rate
- [ ] Assets inheriting from category are listed under the category row
- [ ] Assets with overrides show their asset-level rate, not the category rate
- [ ] Growth rate displayed as percentage (e.g. `8.0%` not `0.08`)

**Requirements covered:** PROJ-FE-01, PROJ-FE-02, PROJ-FE-03, PROJ-FE-04, PROJ-FE-05

---

## Phase 8: Docker & Deployment

**Goal:** Package WealthTrack as a production-ready single Docker container with a multi-stage build, correct non-root runtime, and a docker-compose quickstart.
**Depends on:** Phase 7

### Plans

#### Plan 8.1: Multi-Stage Dockerfile

Rewrite the existing `Dockerfile` with three stages. **Stage 1 (`builder-web`):** `FROM node:22-alpine AS builder-web` — copies `web/`, runs `npm ci && npm run build`, produces `web/dist/`. **Stage 2 (`builder-server`):** `FROM node:22-alpine AS builder-server` — copies `server/`, runs `npm ci && npx tsc`, produces `server/dist/`. **Stage 3 (runtime):** `FROM gcr.io/distroless/nodejs22-debian12` — copies `server/dist/` and `server/node_modules/` from stage 2, copies `web/dist/` from stage 1 into the runtime image at a path the server reads via `WEB_DIST`. Sets `ENV PORT=8080`, `ENV DATA_FILE=/data/database.yaml`. Declares `EXPOSE 8080`. Sets `USER nonroot` (distroless uses `nonroot`, not `node`).

> ⚠️ **Use `gcr.io/distroless/nodejs22-debian12`**, not `gcr.io/distroless/base` or `gcr.io/distroless/static`. The `base` image contains no Node.js binary — the server process will not start. The `nodejs22-debian12` variant includes Node.js 22.
>
> ⚠️ **Volume permissions:** The `/data` directory in the runtime image must be writable by `nonroot`. Add `RUN mkdir -p /data && chown nonroot:nonroot /data` in the runtime stage _before_ switching to `USER nonroot`.

**Verification:**
- [ ] `docker build -t wealthtrack .` completes without errors
- [ ] Final image uses `gcr.io/distroless/nodejs22-debian12` (verify with `docker inspect`)
- [ ] Running `docker run -p 8080:8080 wealthtrack` starts the server and `GET /api/v1/health` returns 200
- [ ] Container process runs as non-root user (verify with `docker exec ... id`)
- [ ] Static assets from `web/dist/` are served correctly from the container

#### Plan 8.2: docker-compose.yml and Volume Configuration

Create `docker-compose.yml` at project root with a single `wealthtrack` service: `image: wealthtrack` (or `build: .`), `ports: ["8080:8080"]`, `environment: DATA_FILE=/data/database.yaml`, `volumes: ["./data:/data"]`, `restart: unless-stopped`. Create `data/.gitkeep` so the local `./data/` directory exists in the repo but `database.yaml` itself is gitignored. Add `/data/database.yaml` to `.gitignore` (the volume-mounted file should never be committed).

**Verification:**
- [ ] `docker compose up` starts the container and mounts `./data:/data`
- [ ] First boot creates `./data/database.yaml` on the host (bootstrap logic in Phase 1)
- [ ] Stopping and restarting preserves all data (file persists on host volume)
- [ ] `restart: unless-stopped` is present in docker-compose.yml
- [ ] `./data/database.yaml` is in `.gitignore`

#### Plan 8.3: README Quickstart

Replace the existing `README.md` placeholder with a complete quickstart: (1) Prerequisites (Docker + Docker Compose), (2) one-liner clone + start: `git clone ... && cd family-wealth-tracker && docker compose up`, (3) access URL (`http://localhost:8080`), (4) data persistence note (data stored in `./data/database.yaml`, survives container restarts), (5) configuration (env vars: `DATA_FILE`, `PORT`), (6) liabilities convention (brief mention — negative values under a Liabilities category), (7) development setup (`cd server && npm run dev` + `cd web && npm run dev`). Keep it under 60 lines.

**Verification:**
- [ ] README contains a copy-pasteable `docker compose up` command
- [ ] README mentions `./data/database.yaml` as the persistence path
- [ ] README documents `DATA_FILE` and `PORT` env vars
- [ ] README includes local development instructions for both server and web
- [ ] README mentions the liabilities convention

**Requirements covered:** INFRA-01, INFRA-02, INFRA-03, INFRA-04

---

## Progress

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Data Foundation | 4/4 | ✅ Complete | 2026-04-22 |
| 2. CRUD API | 3/3 | ✅ Complete | 2026-04-22 |
| 3. Summary Aggregation | 3/3 | ✅ Complete | 2026-04-22 |
| 4. Projections Calculation | 3/3 | ✅ Complete | 2026-04-22 |
| 5. Dashboard Frontend | 4/4 | ✅ Complete | 2026-04-22 |
| 6. Admin Panel Frontend | 3/3 | ✅ Complete | 2026-04-22 |
| 7. People & Person Filter | 0/3 | Not started | - |
| 8. Projections Frontend | 0/3 | Not started | - |
| 9. Docker & Deployment | 0/3 | Not started | - |

---

## Coverage

| Requirement | Phase | Status |
|-------------|-------|--------|
| STOR-01 | Phase 1 | Pending |
| STOR-02 | Phase 1 | Pending |
| STOR-03 | Phase 1 | Pending |
| STOR-04 | Phase 1 | Pending |
| MODEL-01 | Phase 1 | Pending |
| MODEL-02 | Phase 1 | Pending |
| MODEL-03 | Phase 1 | Pending |
| CAT-01 | Phase 2 | Pending |
| CAT-02 | Phase 2 | Pending |
| CAT-03 | Phase 2 | Pending |
| CAT-04 | Phase 2 | Pending |
| ASSET-01 | Phase 2 | Pending |
| ASSET-02 | Phase 2 | Pending |
| ASSET-03 | Phase 2 | Pending |
| ASSET-04 | Phase 2 | Pending |
| DP-01 | Phase 2 | Pending |
| DP-02 | Phase 2 | Pending |
| DP-03 | Phase 2 | Pending |
| DP-04 | Phase 2 | Pending |
| API-01 | Phase 2 | Pending |
| API-02 | Phase 2 | Pending |
| API-03 | Phase 2 | Pending |
| SUM-01 | Phase 3 | Pending |
| SUM-02 | Phase 3 | Pending |
| SUM-03 | Phase 3 | Pending |
| SUM-04 | Phase 3 | Pending |
| SUM-05 | Phase 3 | Pending |
| PROJ-01 | Phase 4 | Pending |
| PROJ-02 | Phase 4 | Pending |
| PROJ-03 | Phase 4 | Pending |
| PROJ-04 | Phase 4 | Pending |
| PROJ-05 | Phase 4 | Pending |
| FE-01 | Phase 5 | Pending |
| FE-02 | Phase 5 | Pending |
| FE-03 | Phase 5 | Pending |
| FE-04 | Phase 5 | Pending |
| DASH-01 | Phase 5 | Pending |
| DASH-02 | Phase 5 | Pending |
| DASH-03 | Phase 5 | Pending |
| DASH-04 | Phase 5 | Pending |
| DASH-05 | Phase 5 | Pending |
| ADMIN-01 | Phase 6 | Pending |
| ADMIN-02 | Phase 6 | Pending |
| ADMIN-03 | Phase 6 | Pending |
| ADMIN-04 | Phase 6 | Pending |
| ADMIN-05 | Phase 6 | Pending |
| PROJ-FE-01 | Phase 7 | Pending |
| PROJ-FE-02 | Phase 7 | Pending |
| PROJ-FE-03 | Phase 7 | Pending |
| PROJ-FE-04 | Phase 7 | Pending |
| PROJ-FE-05 | Phase 7 | Pending |
| INFRA-01 | Phase 8 | Pending |
| INFRA-02 | Phase 8 | Pending |
| INFRA-03 | Phase 8 | Pending |
| INFRA-04 | Phase 8 | Pending |

**v1 coverage: 56/56 requirements mapped ✓**

---

*Roadmap created: 2026-04-22*
*Granularity: Standard (3–4 plans per phase)*
