# Requirements: WealthTrack

**Defined:** 2026-04-22
**Core Value:** See your full net worth picture — past and future — in one glance, with zero friction to add new data.

## v1 Requirements

### Storage

- [ ] **STOR-01**: Server bootstraps `database.yaml` with seeded categories (Stocks, Real Estate, Crypto, Cash) if file does not exist on startup
- [ ] **STOR-02**: All reads and writes go through a single in-process async mutex (`async-mutex`) — no concurrent file access
- [ ] **STOR-03**: Writes use atomic rename pattern (`write-file-atomic`) — no partial writes on crash
- [ ] **STOR-04**: Storage path is configurable via `DATA_FILE` env var, defaulting to `/data/database.yaml`

### Data Model

- [ ] **MODEL-01**: Category has: `id` (slug, immutable after create), `name`, `projected_yearly_growth` (float, e.g. 0.08), `color` (hex)
- [ ] **MODEL-02**: Asset has: `id` (slug, immutable after create), `name`, `category_id`, `projected_yearly_growth` (float or null — inherits from category if null), `location` (optional), `notes` (optional), `created_at` (ISO timestamp, immutable)
- [ ] **MODEL-03**: DataPoint has: `id` (UUID v4 via `crypto.randomUUID()`), `asset_id`, `year_month` (YYYY-MM, month key built from `getFullYear()`/`getMonth()` — no `toISOString()` for keys), `value` (float64, EUR), `notes` (optional), `created_at`, `updated_at`

### API — Categories

- [ ] **CAT-01**: `GET /api/v1/categories` — returns all categories
- [ ] **CAT-02**: `POST /api/v1/categories` — creates a category; validates required fields
- [ ] **CAT-03**: `PUT /api/v1/categories/:id` — full update; rejects if id change attempted
- [ ] **CAT-04**: `DELETE /api/v1/categories/:id` — rejects with 409 if any asset uses this category

### API — Assets

- [ ] **ASSET-01**: `GET /api/v1/assets` — returns all assets
- [ ] **ASSET-02**: `POST /api/v1/assets` — creates an asset; validates category_id exists
- [ ] **ASSET-03**: `PUT /api/v1/assets/:id` — full update; rejects id change attempts
- [ ] **ASSET-04**: `DELETE /api/v1/assets/:id` — rejects with 409 if any data point references this asset

### API — Data Points

- [ ] **DP-01**: `GET /api/v1/data-points` — returns all data points sorted by `year_month` desc
- [ ] **DP-02**: `POST /api/v1/data-points` — creates a data point; validates asset_id exists and value > 0
- [ ] **DP-03**: `PUT /api/v1/data-points/:id` — full update; updates `updated_at`
- [ ] **DP-04**: `DELETE /api/v1/data-points/:id` — deletes without restriction

### API — Summary

- [x] **SUM-01**: `GET /api/v1/summary?range={range}` — accepts `ytd`, `6m`, `1y`, `2y`, `3y`, `5y`, `10y`, `max`; defaults to `1y`
- [x] **SUM-02
**: For each month in range, per asset: select the data point with latest `updated_at` for that `year_month` (upsert semantics)
- [x] **SUM-03
**: LOCF gap-filling: if a month has no data for an asset, carry forward the last known value; if no prior value, use 0
- [ ] **SUM-04**: Response includes `months[]`, `series[]` (one per category with `category_id`, `category_name`, `color`, `values[]`), and `totals[]`
- [ ] **SUM-05**: Response includes `current_total` (latest month), `period_delta_abs` (€), `period_delta_pct` (%), and `category_breakdown[]` (value + % of total per category) for summary cards

### API — Projections

- [x] **PROJ-01
**: `GET /api/v1/projections?years={n}` — default 10, max 30
- [x] **PROJ-02
**: Uses compound monthly rate: `monthly_rate = (1 + yearly_rate)^(1/12) - 1` — never `annualRate / 12`
- [x] **PROJ-03
**: Growth rate resolution: asset-level `projected_yearly_growth` if set; otherwise inherits from parent category
- [x] **PROJ-04
**: Projection starts from the month immediately after each asset's latest data point
- [x] **PROJ-05
**: Response includes `historical` (same shape as summary max range) and `projection` (`months[]`, `series[]`, `totals[]`)

### API — General

- [ ] **API-01**: All errors return `{ "error": "message" }` with appropriate HTTP status (400, 404, 409, 500)
- [ ] **API-02**: Server serves compiled React SPA (`web/dist/`) as static files for all non-API routes (SPA catch-all)
- [ ] **API-03**: `GET /api/v1/health` returns `{ "status": "ok" }` (already implemented)

### Frontend — Foundation

- [x] **FE-01
**: TypeScript API client (`src/api/client.ts`) with typed functions for all endpoints
- [x] **FE-02
**: Shared TypeScript types (`src/types/index.ts`) matching backend data model
- [x] **FE-03
**: Persistent top nav: Dashboard · Projections · Admin; collapses to hamburger on mobile
- [x] **FE-04
**: Category IDs used as Recharts `dataKey` (never category name — dots in names break Recharts' nested path parser)

### Frontend — Dashboard

- [x] **DASH-01
**: Time range selector: `YTD · 6M · 1Y · 2Y · 3Y · 5Y · 10Y · Max` pill buttons; default `1Y`
- [x] **DASH-02
**: Main chart renders one coloured series per category + total wealth line on top
- [x] **DASH-03
**: Chart tooltip shows each category value + total for hovered month
- [x] **DASH-04
**: Chart type selector (icon buttons, top-right of chart): Stacked Area (default) · Line · Stacked Bar; persisted per chart slot in `localStorage`
- [x] **DASH-05
**: Summary cards: Total Net Worth, Change over selected period (€ + %), breakdown per category (value + % of total)

### Frontend — Projections

- [x] **PROJ-FE-01
**: Year selector: `5Y · 10Y · 20Y · 30Y` pill buttons; default `10Y`
- [x] **PROJ-FE-02
**: Combined chart: historical portion solid, projected portion dashed + lower opacity; vertical dashed line at "today"
- [x] **PROJ-FE-03
**: Same chart type selector as Dashboard (Stacked Area default); persisted separately in `localStorage`
- [x] **PROJ-FE-04
**: Projection summary table: projected total net worth at +1Y, +3Y, +5Y, +10Y, +20Y, +30Y milestones
- [ ] **PROJ-FE-05**: Growth rate table: each category with its effective growth rate (for user verification)

### Frontend — Admin Panel

- [ ] **ADMIN-01**: Three tabs: Data Points · Assets · Categories
- [ ] **ADMIN-02**: Data Points tab: sortable table (Date, Asset, Category, Value, Notes, Actions); Add/Edit modal with asset dropdown, month picker (YYYY-MM), value (> 0), notes; Delete with confirm dialog
- [ ] **ADMIN-03**: Assets tab: table (Name, Category, Growth Rate, Location, Notes, Actions); Add/Edit modal with name, slug (auto-suggested, immutable after save), category dropdown, growth rate (% optional), location, notes; Delete blocked with error if data points exist
- [ ] **ADMIN-04**: Categories tab: table (Name, Growth Rate, Color, Actions); Add/Edit modal with name, slug (immutable after save), growth rate (required), color picker; Delete blocked with error if assets use it
- [ ] **ADMIN-05**: Liabilities convention: UI labels or help text documenting that negative-value categories (e.g. "Liabilities") are the supported pattern for tracking debts

### Infrastructure

- [ ] **INFRA-01**: Multi-stage Dockerfile: Stage 1 (node:22-alpine) builds Vite frontend; Stage 2 (node:22-alpine) builds/compiles backend; Stage 3 (`gcr.io/distroless/nodejs22-debian12` — NOT `distroless/base`) runs the server
- [ ] **INFRA-02**: `docker-compose.yml` with volume mount `./data:/data`, port `8080:8080`, `DATA_FILE=/data/database.yaml`, `restart: unless-stopped`
- [ ] **INFRA-03**: Docker image runs as non-root `node` user
- [ ] **INFRA-04**: README with quickstart instructions (clone → docker compose up)

## v2 Requirements

### AI-Powered Import

- **AI-01**: LLM abstraction layer supporting Anthropic / OpenAI / custom endpoint
- **AI-02**: File text extractor for CSV, JSON, PDF uploads
- **AI-03**: LLM import parser — sends extracted text + asset context, receives structured data points
- **AI-04**: Import preview/confirm UI before committing parsed data points
- **AI-05**: Settings page to configure LLM provider and API key

### Household Members & Income Tracking

- **HH-01**: HouseholdMember model with name and optional income data
- **HH-02**: IncomeCategory model (salary, rental, freelance, etc.)
- **HH-03**: DataPoint entry_type toggle (asset snapshot vs income entry)
- **HH-04**: Income summary endpoint and income chart on Dashboard + Projections
- **HH-05**: Per-person portfolio filter on Dashboard
- **HH-06**: Admin tabs for Household and Income Categories

## Out of Scope

| Feature | Reason |
|---------|--------|
| Authentication / login | Single household, trust the network — adds complexity with no benefit |
| Multi-currency | EUR only for v1 — keeps aggregation logic simple |
| Automatic data import | Manual entry only for v1; AI import is scoped to v2 |
| Multiple user accounts | Single household — out of scope by design |
| Mobile app | Web-only, responsive design is sufficient |
| Liabilities as first-class entity | Negative-value category convention handles v1 needs without schema complexity |
| Database migrations | Flat YAML file, schema flexibility is the point |
| Real-time updates / websockets | No concurrent users, polling or page refresh is sufficient |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| STOR-01–04, MODEL-01–03 | Phase 1 | Pending |
| CAT-01–04, ASSET-01–04, DP-01–04, API-01–03 | Phase 2 | Pending |
| SUM-01–05 | Phase 3 | Pending |
| PROJ-01–05 | Phase 4 | Pending |
| FE-01–04 | Phase 5 | Pending |
| DASH-01–05 | Phase 5 | Pending |
| ADMIN-01–05 | Phase 6 | Pending |
| PROJ-FE-01–05 | Phase 7 | Pending |
| INFRA-01–04 | Phase 8 | Pending |

**Coverage:**
- v1 requirements: 52 total
- Mapped to phases: 52
- Unmapped: 0 ✓

---
*Requirements defined: 2026-04-22*
*Last updated: 2026-04-22 after initial definition*
