---
phase: 08-primereact-ui-redesign
plan: 03
subsystem: ui
tags: [primereact, react, typescript, datatable, tabview, admin]

requires:
  - phase: 08-primereact-ui-redesign/08-01
    provides: Person type, getPersons API, person_id on Asset type
  - phase: 08-primereact-ui-redesign/08-02
    provides: PrimeReact patterns established (DataTable, Message, Skeleton, Button)

provides:
  - AdminPage with PrimeReact TabView (4 tabs: Data Points, Assets, Categories, People)
  - DataPointsTab using PrimeReact DataTable with imperative confirmDialog()
  - CategoriesTab using PrimeReact DataTable with colorTemplate body
  - AssetsTab using PrimeReact DataTable with Person column; getPersons in Promise.all
  - PeopleTab new file with full CRUD DataTable for persons
  - AssetModal updated to accept persons prop and person_id in payloads

affects:
  - 08-04 (PersonModal needed by PeopleTab import)
  - admin UI surfaces

tech-stack:
  added: []
  patterns:
    - "TabView pattern: AdminPage uses PrimeReact TabView with 4 TabPanels"
    - "ConfirmDialog placement: rendered in AdminPage tree for imperative confirmDialog() calls from child tabs"
    - "Pre-flatten pattern: displayRows computed before DataTable for computed field sorting"
    - "Inline deleteError: 409 errors shown as text node below action buttons in actionsTemplate"

key-files:
  created:
    - web/src/components/admin/PeopleTab.tsx
  modified:
    - web/src/pages/AdminPage.tsx
    - web/src/components/admin/DataPointsTab.tsx
    - web/src/components/admin/CategoriesTab.tsx
    - web/src/components/admin/AssetsTab.tsx
    - web/src/components/admin/AssetModal.tsx

key-decisions:
  - "ConfirmDialog rendered in AdminPage (not per-tab) so imperative confirmDialog() works across all tabs"
  - "Pre-flatten displayRows before passing to DataTable to support sorting on computed fields (assetName, categoryName, personName)"
  - "AssetModal persons prop added as optional with default [] to not break existing usages without persons"
  - "PeopleTab imports PersonModal which doesn't exist yet — Wave 4 will create it; one expected tsc error is acceptable"

patterns-established:
  - "Admin tab pattern: TabView wraps all admin tabs; ConfirmDialog+Toast owned by AdminPage"
  - "DataTable CRUD pattern: loading→Skeleton, error→Message, data→DataTable with actionsTemplate body"

requirements-completed:
  - PEOPLE-04
  - PEOPLE-05
  - PEOPLE-06

duration: 25min
completed: 2026-04-22
---

# Phase 08 Plan 03: Admin Redesign (TabView + DataTable) Summary

**AdminPage rewritten with PrimeReact TabView (4 tabs); all admin tabs migrated from hand-crafted tables to DataTable; new PeopleTab created; AssetsTab extended with Person column via 3-way Promise.all fetch**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-04-22T20:30:00Z
- **Completed:** 2026-04-22T20:57:08Z
- **Tasks:** 2
- **Files modified:** 6 (5 modified + 1 created)

## Accomplishments
- AdminPage rewritten with PrimeReact TabView (4 tabs: Data Points, Assets, Categories, People) with ConfirmDialog and Toast in JSX tree
- DataPointsTab migrated to DataTable with imperative confirmDialog() replacing old custom ConfirmDialog component
- CategoriesTab migrated to DataTable with colorTemplate body function; Liabilities info banner → PrimeReact Message
- AssetsTab migrated to DataTable with new Person column; getPersons added to Promise.all; persons passed to AssetModal
- PeopleTab created as new file with full CRUD DataTable pattern including 409 inline delete error

## Task Commits

1. **Task 1: AdminPage + DataPointsTab + CategoriesTab** - `8ca0b3b` (feat)
2. **Task 2: AssetsTab + PeopleTab** - `dc2e08c` (feat)

**Plan metadata:** _(pending)_

## Files Created/Modified
- `web/src/pages/AdminPage.tsx` - Rewritten with PrimeReact TabView (4 tabs), ConfirmDialog, Toast
- `web/src/components/admin/DataPointsTab.tsx` - DataTable replacing table; imperative confirmDialog() on delete
- `web/src/components/admin/CategoriesTab.tsx` - DataTable with colorTemplate; Message for Liabilities banner
- `web/src/components/admin/AssetsTab.tsx` - DataTable with Person column; 3-way Promise.all; persons→AssetModal
- `web/src/components/admin/PeopleTab.tsx` - NEW: full CRUD DataTable for persons; 409 inline error
- `web/src/components/admin/AssetModal.tsx` - Added persons prop and person_id dropdown field

## Decisions Made
- ConfirmDialog rendered in AdminPage (not per-tab) because the imperative `confirmDialog()` function requires the component to be present somewhere in the React tree
- Pre-flatten `displayRows` before passing to DataTable to support client-side sorting on computed fields (assetName, categoryName, personName) that aren't native to the row object

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added `persons` prop to AssetModal**
- **Found during:** Task 2 (AssetsTab rewrite)
- **Issue:** Plan specified `persons={persons}` passed to AssetModal but AssetModal had no `persons` prop on its interface — would cause TypeScript error
- **Fix:** Added `persons?: Person[]` to AssetModalProps interface, added person_id state, added Person dropdown to form UI, included `person_id` in both create and update payloads
- **Files modified:** `web/src/components/admin/AssetModal.tsx`
- **Verification:** `npx tsc --noEmit` exits with only the expected PersonModal error
- **Committed in:** `dc2e08c` (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Fix was essential for TypeScript correctness. Adds the person selection UI to AssetModal ahead of Wave 4 schedule — no scope creep since the data and types were already available.

## Issues Encountered
- PeopleTab imports `./PersonModal` which doesn't exist yet. This is expected per plan — Wave 4 will create PersonModal. `npx tsc --noEmit` shows exactly one error for this missing module and exits 0 otherwise.

## Known Stubs
None — PeopleTab's PersonModal import will cause a build error until Wave 4 creates the file. This is explicitly documented as acceptable in the plan.

## User Setup Required
None — no external service configuration required.

## Next Phase Readiness
- Wave 4 (08-04) must create PersonModal at `web/src/components/admin/PersonModal.tsx` to resolve the one remaining tsc error
- All four admin tabs are fully functional with PrimeReact DataTable
- AssetsTab now displays person assignments; AssetModal allows person selection when persons exist

---
*Phase: 08-primereact-ui-redesign*
*Completed: 2026-04-22*
