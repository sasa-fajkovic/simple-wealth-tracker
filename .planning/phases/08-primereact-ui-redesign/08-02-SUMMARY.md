---
phase: 08-primereact-ui-redesign
plan: 02
subsystem: ui
tags: [primereact, tailwindcss, typescript, react, selectbutton, skeleton, card]

# Dependency graph
requires:
  - phase: 08-01
    provides: PrimeReactProvider, Person types, getPersons/getSummary API functions, Tailwind important:true coexistence
provides:
  - Nav hamburger with PrimeReact Button (pi-bars/pi-times icons)
  - SummaryCards with three PrimeReact Card components; EUR formatter at module scope
  - ChartTypeSelector with PrimeReact SelectButton and lucide icon itemTemplate
  - DashboardPage range selector as PrimeReact SelectButton (8 options)
  - DashboardPage person filter SelectButton (conditional on persons.length > 0)
  - DashboardPage Skeleton loading state and Message error state
  - WealthChart wrapped in PrimeReact Card
  - Person filter wired: getSummary(range, person ?? undefined)
affects:
  - 08-03 (AssetList page shares same Nav and PrimeReact patterns)
  - 08-04 (Settings page shares same Nav and Card patterns)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - SelectButton with e.value != null guard prevents deselect events from clearing controlled state
    - Sentinel string 'all' maps to null person state — avoids PrimeReact SelectButton null-value quirks
    - Two separate useEffects on DashboardPage — mount-only [] for persons, [range, person, retryCount] for summary
    - PrimeReact Card wrapping WealthChart for consistent surface elevation

key-files:
  created: []
  modified:
    - web/src/components/Nav.tsx
    - web/src/components/SummaryCards.tsx
    - web/src/components/ChartTypeSelector.tsx
    - web/src/pages/DashboardPage.tsx

key-decisions:
  - "Sentinel value 'all' (string) used instead of null in SelectButton to avoid PrimeReact SelectButton null-value deselect quirk"
  - "persons useEffect dep array is [] — persons are not refetched on summary retry, avoiding extra network calls"
  - "e.value != null guard on both SelectButton onChange handlers prevents clicking an already-selected item from clearing state"
  - "getSummary(range, person ?? undefined) — null maps to undefined so URLSearchParams omits the query param entirely"

patterns-established:
  - "Pattern: PrimeReact SelectButton with sentinel string — use a non-null string sentinel (e.g. 'all') to represent null/empty state; map back to null before API calls"
  - "Pattern: Two useEffects for independent data — mount-only fetch (persons) separate from reactive fetch (summary); prevents persons re-fetching on retry"

requirements-completed: [PEOPLE-07]

# Metrics
duration: 15min
completed: 2026-04-22
---

# Phase 8 Plan 02: PrimeReact Dashboard UI Redesign Summary

**Nav, SummaryCards, ChartTypeSelector, and DashboardPage redesigned with PrimeReact Card/SelectButton/Skeleton/Message components, with Phase 7 person filter fully wired in.**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-04-22T21:00:00Z
- **Completed:** 2026-04-22T21:15:00Z
- **Tasks:** 2 completed
- **Files modified:** 4

## Accomplishments

- Replaced Nav hamburger `<button>` + lucide icons with PrimeReact `Button` using PrimeIcons (pi-bars/pi-times); all NavLink logic preserved
- Replaced three hand-crafted `<div>` cards in SummaryCards with PrimeReact `Card` components; eurFormatter kept at module scope; U+2212 minus sign preserved
- Replaced three icon-buttons in ChartTypeSelector with PrimeReact `SelectButton` using a custom `itemTemplate` rendering lucide icons; `useChartType` hook unchanged
- Full DashboardPage rewrite: range selector → SelectButton (8 options); person filter → conditional SelectButton with 'all' sentinel; loading → PrimeReact Skeleton; error → PrimeReact Message + Button retry; WealthChart wrapped in Card; Phase 7 `getPersons` wired in with separate mount-only useEffect

## Task Commits

1. **Task 1: Redesign Nav, SummaryCards, and ChartTypeSelector** - `ab2a6ba` (feat)
2. **Task 2: Redesign DashboardPage with PrimeReact SelectButton, Skeleton, Message, person filter** - `b9cece4` (feat)

## Files Created/Modified

- `web/src/components/Nav.tsx` — removed lucide Menu/X imports; hamburger replaced with PrimeReact Button using pi-bars/pi-times icons
- `web/src/components/SummaryCards.tsx` — added Card import; three div cards replaced with PrimeReact Card components
- `web/src/components/ChartTypeSelector.tsx` — added SelectButton import; three icon-buttons replaced with SelectButton + itemTemplate
- `web/src/pages/DashboardPage.tsx` — full rewrite: SelectButton range + person filter, Skeleton, Message, Card, getPersons mount-only useEffect

## Decisions Made

- **Sentinel 'all' for person state:** PrimeReact SelectButton sets `e.value = null` when the currently selected item is clicked again. Using a string sentinel `'all'` avoids this ambiguity — the value is always a non-null string, and we map `'all' → null` before calling the API.
- **Two separate useEffects:** Persons are fetched once at mount (dep array `[]`) and do not participate in retry logic. Summary is fetched whenever `range`, `person`, or `retryCount` changes. This prevents unnecessary re-fetching of persons on data retry.
- **`e.value != null` guard:** Both SelectButton onChange handlers check `e.value != null` before updating state, which handles the deselect-click edge case gracefully without resetting the user's selection.

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

None — TypeScript compilation and `npm run build` both passed on first attempt.

## Known Stubs

None — all data flows are wired to live API calls.

## Threat Flags

None — no new network endpoints or trust boundaries introduced. Person IDs sourced from server GET /api/v1/persons (as noted in plan threat model T-08-04).

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- Dashboard UI fully redesigned with PrimeReact components
- Person filter is functional end-to-end (requires running backend with persons seeded)
- Wave 3 (08-03) can proceed: AssetList page redesign
- Wave 4 (08-04) can proceed: Settings persons management page

---
*Phase: 08-primereact-ui-redesign*
*Completed: 2026-04-22*
