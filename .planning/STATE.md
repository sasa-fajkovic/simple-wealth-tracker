---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: unknown
last_updated: "2026-04-22T20:58:41.824Z"
progress:
  total_phases: 8
  completed_phases: 6
  total_plans: 27
  completed_plans: 24
  percent: 89
---

# WealthTrack — Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-04-22)

**Core value:** See your full net worth picture — past and future — in one glance, with zero friction to add new data.
**Current focus:** Phase 8 — PrimeReact UI Redesign

## Current Status

**Phase:** 8 of 10 — 🔄 In progress (Wave 1 ✅, Wave 2 ✅)
**Last action:** Phase 8 Wave 2 complete — Nav, SummaryCards, ChartTypeSelector, DashboardPage redesigned with PrimeReact; person filter wired

## Roadmap Snapshot

| Phase | Name | Status |
|-------|------|--------|
| 1 | Data Foundation | ✅ Complete |
| 2 | CRUD API | ✅ Complete |
| 3 | Summary Aggregation | ✅ Complete |
| 4 | Projections Calculation | ✅ Complete |
| 5 | Dashboard Frontend | ✅ Complete |
| 6 | Admin Panel Frontend | ✅ Complete |
| 7 | People & Person Filter | 🔄 In progress (backend ✅, frontend in Phase 8) |
| 8 | PrimeReact UI Redesign | 🔄 In progress (Wave 1 ✅, Wave 2 ✅) |
| 9 | Projections Frontend | ⬜ Not started |
| 10 | Docker & Deployment | ⬜ Not started |

## Planning Artifacts

| File | Purpose |
|------|---------|
| `.planning/PROJECT.md` | Project context, requirements, constraints, decisions |
| `.planning/REQUIREMENTS.md` | 52 v1 requirements across 8 phases |
| `.planning/ROADMAP.md` | 8 phases, 26 plans |
| `.planning/research/SUMMARY.md` | Research synthesis |
| `.planning/research/STACK.md` | Recommended stack (Hono v4, Node 22, async-mutex, write-file-atomic) |
| `.planning/research/FEATURES.md` | Table stakes, differentiators, anti-features |
| `.planning/research/ARCHITECTURE.md` | Component boundaries, build order, patterns |
| `.planning/research/PITFALLS.md` | 14 catalogued pitfalls with prevention strategies |

## Key Technical Decisions

- **Backend:** Node.js + Hono v4 (replaces Go scaffold)
- **Storage:** YAML flat file — `async-mutex` + `write-file-atomic` (crash-safe)
- **Month keys:** `padStart(2,'0')` integer arithmetic — never `toISOString()` (UTC shift for UTC+ users)
- **LOCF carry seed:** `null` (not `0`) — months before first data point emit `0` via `carry ?? 0`
- **Upsert comparison:** ISO 8601 string lexicographic order for `updated_at` — no Date.parse needed
- **Projection math:** `(1 + r)^(1/12) - 1` — never `annualRate / 12`
- **Recharts dataKey:** category `id` (not `name`) — dots in names break nested path parser
- **Docker runtime:** `gcr.io/distroless/nodejs22-debian12` — NOT `distroless/base`
- **Liabilities:** negative-value category convention (no schema change needed)
- **Inclusive range count:** `6m` = 6 months total → subtract 5 not 6; `Nm` = N×12 months → subtract N×12-1
- **subtractMonths private:** Not exported from ranges.ts — integer carry loop `while (m <= 0) { m += 12; y-- }`
- **aggregateSummary separation:** Route owns data loading (readDb, locfFill); pure aggregation function is easier to test
- **All categories in series[]:** Empty categories produce all-zero arrays (no frontend gaps)
- **Divide-by-zero guards:** `period_delta_pct=0` when `firstTotal=0`; `pct_of_total=0` when `currentTotal=0`

- **API base URL:** `BASE = '/api/v1'` relative URL — Vite proxy handles dev; prevents SSRF redirect (T-05-03)
- **RangeKey type:** `getSummary` accepts `RangeKey` not bare `string` — type-safe range enforcement at compile time
- **Nav ref cast:** `ref={menuRef as React.RefObject<HTMLElement>}` — HTMLDivElement ref assignable to HTMLElement for nav element

- **ChartTypeSelector storageKey:** Accepts `storageKey` as prop (not hardcoded) — reusable for DashboardPage (`'dashboard-chart-type'`) and future ProjectionsPage
- **WealthChart ComposedChart:** Uses `ComposedChart` not `AreaChart/LineChart/BarChart` — only component supporting Area + Line overlay in one chart
- **dataKey=category_id:** Category slugs used as Recharts dataKeys — names with dots break nested path parser

- **deleteError single-instance state:** `{ id, message } | null` (not Record) — only one delete can be in-flight; new delete clears prior error
- **slug preview readOnly always:** create mode derives toSlug(name) live; edit mode shows immutable item.id
- **asset dropdown disabled in edit mode:** server rejects asset_id changes on PUT with 400
- **retryCount refetch pattern:** increment after create/update/delete to trigger useEffect re-fetch
- **EUR formatter module-scope:** Instantiated at module scope — avoids recreating Intl.NumberFormat per render
- **U+2212 MINUS SIGN:** (not hyphen-minus) for negative delta prefix in Period Change card

## Next Step

Plan and execute Phase 8: PrimeReact UI Redesign (full app + Phase 7 frontend components).

- **Sentinel 'all' for person SelectButton:** String sentinel 'all' maps to null person state — avoids PrimeReact SelectButton deselect-to-null quirk
- **Two useEffects on DashboardPage:** mount-only dep [] for persons, [range, person, retryCount] for summary — prevents unnecessary re-fetches on retry
- **e.value != null guard:** SelectButton onChange handlers check e.value != null before updating state — handles deselect-click gracefully
- **getSummary(range, person ?? undefined):** null maps to undefined so URLSearchParams omits person query param

---
*Initialized: 2026-04-22*
*Last session: 2026-04-22T21:15:00Z — Completed 08-02-PLAN.md — Nav, SummaryCards, ChartTypeSelector, DashboardPage redesigned with PrimeReact; person filter wired*
