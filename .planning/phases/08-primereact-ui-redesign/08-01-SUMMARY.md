---
phase: 08-primereact-ui-redesign
plan: 01
subsystem: ui
tags: [primereact, tailwindcss, typescript, react]

# Dependency graph
requires:
  - phase: 07-persons-backend
    provides: Person model and /api/v1/persons endpoints that client functions target
provides:
  - PrimeReactProvider wrapping app with lara-light-blue theme
  - Tailwind important:true coexistence configuration
  - Person, CreatePersonPayload, UpdatePersonPayload types in web/src/types/index.ts
  - person_id field on Asset, CreateAssetPayload, UpdateAssetPayload
  - getPersons, createPerson, updatePerson, deletePerson in web/src/api/client.ts
  - getSummary with optional person?: string filter parameter
affects:
  - 08-02 (CategoryBreakdown persona filter uses Person types + getPersons)
  - 08-03 (AssetList uses person_id on Asset and Person API functions)
  - 08-04 (Settings persons management uses CRUD functions)

# Tech tracking
tech-stack:
  added:
    - primereact 10.x (component library with lara-light-blue theme)
    - primeicons (icon font for PrimeReact components)
  patterns:
    - PrimeReactProvider as outermost React wrapper (outside BrowserRouter)
    - CSS import order: theme → primereact.css → primeicons → index.css (Tailwind)
    - Tailwind important:true to win specificity over PrimeReact theme

key-files:
  created: []
  modified:
    - web/package.json
    - web/package-lock.json
    - web/src/main.tsx
    - web/tailwind.config.ts
    - web/src/types/index.ts
    - web/src/api/client.ts

key-decisions:
  - "PrimeReactProvider wraps BrowserRouter — PrimeReact context must be outermost"
  - "important:true in tailwind.config.ts prevents Tailwind utility classes losing specificity battles to PrimeReact theme CSS"
  - "CSS import order is load-order-sensitive: wrong order = PrimeReact component styles overridden by Tailwind base reset"
  - "getSummary optional person?: string uses URLSearchParams to avoid double-encoding and is backward-compatible"

patterns-established:
  - "Pattern: PrimeReact CSS order — theme.css → primereact.css → primeicons.css → index.css (Tailwind last)"
  - "Pattern: Person slugs are URL-safe strings matching server-side Person.id (e.g. 'sasa', 'matea')"

requirements-completed: [PEOPLE-01, PEOPLE-02, PEOPLE-03]

# Metrics
duration: 12min
completed: 2026-04-22
---

# Phase 8 Plan 01: PrimeReact Foundation + Person Types Summary

**PrimeReact installed with lara-light-blue theme, Tailwind coexistence configured, and Person model wired into TypeScript types and API client — build passes clean.**

## Performance

- **Duration:** ~12 min
- **Started:** 2026-04-22T20:32:00Z
- **Completed:** 2026-04-22T20:44:26Z
- **Tasks:** 2 completed
- **Files modified:** 6

## Accomplishments

- Installed `primereact` and `primeicons`; wrapped app in `PrimeReactProvider` with correct CSS import order ensuring theme is not overridden by Tailwind base reset
- Added `important: true` to `tailwind.config.ts` so Tailwind utility classes win specificity battles against PrimeReact component styles
- Added `Person`, `CreatePersonPayload`, `UpdatePersonPayload` interfaces plus `person_id` fields on Asset payloads; wired four Person CRUD functions into `api/client.ts`
- Extended `getSummary` with backward-compatible optional `person?: string` parameter using `URLSearchParams` for clean query-string construction

## Task Commits

1. **Task 1: Install PrimeReact, configure theme + Tailwind coexistence** - `11c5c20` (feat)
2. **Task 2: Add Phase 7 Person types and API client functions** - `ec12fff` (feat)

## Files Created/Modified

- `web/package.json` — added `primereact` and `primeicons` dependencies
- `web/package-lock.json` — lock file updated
- `web/src/main.tsx` — PrimeReactProvider wrapper + ordered CSS imports before index.css
- `web/tailwind.config.ts` — added `important: true`
- `web/src/types/index.ts` — Person interface, CreatePersonPayload, UpdatePersonPayload; person_id on Asset + payloads
- `web/src/api/client.ts` — getPersons, createPerson, updatePerson, deletePerson; getSummary optional person param

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check: PASSED

- `web/node_modules/primereact/` exists ✓
- `web/node_modules/primeicons/` exists ✓
- `main.tsx` has PrimeReactProvider and correct CSS import order ✓
- `tailwind.config.ts` has `important: true` ✓
- `types/index.ts` exports Person, CreatePersonPayload, UpdatePersonPayload ✓
- `Asset.person_id`, `CreateAssetPayload.person_id`, `UpdateAssetPayload.person_id` exist ✓
- `api/client.ts` exports getPersons, createPerson, updatePerson, deletePerson ✓
- `getSummary` accepts optional `person?: string` ✓
- `npx tsc --noEmit` exits 0 ✓
- `npm run build` exits 0 ✓
- Commits `11c5c20` and `ec12fff` exist in git log ✓
