---
phase: 06-admin-panel-frontend
plan: "01"
subsystem: web/admin
tags: [react, typescript, admin, crud, modal, table]
dependency_graph:
  requires: [05-dashboard-frontend]
  provides: [admin-data-points-tab, admin-page-shell]
  affects: [web/src/pages/AdminPage.tsx]
tech_stack:
  added: []
  patterns:
    - cancelled-fetch guard (mirrors DashboardPage pattern)
    - EUR formatter at module scope (Intl.NumberFormat de-DE)
    - modal overlay with backdrop-click cancel
    - spread-sort (never mutate state arrays)
    - disabled asset dropdown in edit mode (server contract)
key_files:
  created:
    - web/src/components/admin/ConfirmDialog.tsx
    - web/src/components/admin/DataPointModal.tsx
    - web/src/components/admin/DataPointsTab.tsx
  modified:
    - web/src/pages/AdminPage.tsx
decisions:
  - "month picker uses <input type='month'> .value string directly — never parsed through Date (UTC shift bug prevention)"
  - "asset dropdown disabled in edit mode — server rejects asset_id changes with 400"
  - "EUR formatter at module scope — avoids recreating Intl.NumberFormat per render"
  - "retryCount pattern used to trigger refetch after mutations"
metrics:
  duration: "~15 minutes"
  completed: "2026-04-22"
  tasks_completed: 2
  tasks_total: 2
  files_created: 3
  files_modified: 1
---

# Phase 6 Plan 01: Admin Panel Frontend — Data Points Tab Summary

**One-liner:** Three-tab Admin shell with fully functional Data Points CRUD table — sortable, modal-driven, with ConfirmDialog for deletes and DataPointModal for create/edit.

## What Was Built

### `ConfirmDialog.tsx`
Generic delete confirmation modal used exclusively for DataPoint deletes (Assets/Categories handle inline 409 errors). Features:
- Fixed inset-0 z-50 overlay with `bg-gray-900/50` backdrop
- Backdrop click cancels (no Escape key handler needed per spec)
- Cancel + Delete buttons with appropriate color scheme

### `DataPointModal.tsx`
Create/Edit modal form for DataPoint entities. Features:
- Asset dropdown **disabled in edit mode** (server rejects asset_id changes on PUT with 400)
- Month picker using `<input type="month">` with `.value` string passed directly as `year_month` — **never parsed through Date** (avoids UTC shift bug for UTC+ users)
- Value > 0 client-side validation with inline error before API call
- Notes textarea (optional)
- Saving state with disabled Save button + spinner text
- Both validation error and API save error displayed inline

### `DataPointsTab.tsx`
Sortable table with full CRUD orchestration:
- Cancelled-fetch guard pattern (mirrors DashboardPage exactly)
- `Promise.all([getDataPoints(), getAssets()])` on mount + after mutations
- Three sortable columns: Date, Asset, Value — with ChevronUp/Down icons
- EUR formatter at **module scope** (`new Intl.NumberFormat('de-DE', ...)`)
- Spread-sort: `[...rows].sort(...)` — never mutates state array
- `retryCount` pattern triggers refetch after create/update/delete
- Empty state row shown when no data points
- Edit button opens DataPointModal pre-populated; Delete button opens ConfirmDialog

### `AdminPage.tsx` (replaced stub)
Three-tab shell:
- Tabs: Data Points · Assets · Categories
- DataPoints tab wired to `<DataPointsTab />`
- Assets/Categories tabs show placeholder divs (Plans 02/03 will wire real components)
- `document.title = 'Admin — WealthTrack'` set on mount
- No imports of non-existent AssetsTab/CategoriesTab (import-error-safe)

## Commits

| Hash | Message |
|------|---------|
| `dd20e37` | feat(06-01): add ConfirmDialog and DataPointModal components |
| `1b47df8` | feat(06-01): add DataPointsTab and AdminPage tab shell |

## Verification

Both `npx tsc --noEmit` and `npm run build` exit 0 with zero TypeScript errors.

Build output: `dist/assets/index-DZl3kuC9.js 597.07 kB │ gzip: 169.28 kB` — chunk size warning only (pre-existing, not introduced by this plan).

## Deviations from Plan

None — plan executed exactly as written. All typography constraints honored (no `font-semibold` or `font-normal`; only `font-medium` for labels/secondary text).

## Threat Model Coverage

| Threat ID | Status |
|-----------|--------|
| T-06-01 (value > 0 validation) | ✅ Implemented — `parseFloat(value) <= 0` blocked before `onSave` call |
| T-06-02 (asset_id immutable in edit) | ✅ Implemented — `disabled={mode === 'edit'}` on asset dropdown |
| T-06-03 (ApiError disclosure) | ✅ Accepted — single household trust model |
| T-06-04 (Delete cascade DoS) | ✅ Accepted — ConfirmDialog adds friction |

## Self-Check: PASSED

- `web/src/components/admin/ConfirmDialog.tsx` — FOUND ✓
- `web/src/components/admin/DataPointModal.tsx` — FOUND ✓
- `web/src/components/admin/DataPointsTab.tsx` — FOUND ✓
- `web/src/pages/AdminPage.tsx` — FOUND ✓ (replaced stub)
- Commit `dd20e37` — FOUND ✓
- Commit `1b47df8` — FOUND ✓
- TypeScript: 0 errors ✓
- Build: exit 0 ✓
