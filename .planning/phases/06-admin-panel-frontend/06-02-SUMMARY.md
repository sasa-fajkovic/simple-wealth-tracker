---
phase: 06-admin-panel-frontend
plan: 02
subsystem: web/admin
tags: [admin, assets, crud, modal, slug, growth-rate]
dependency_graph:
  requires: ["06-01"]
  provides: ["AssetsTab", "AssetModal", "AdminPage-assets-wired"]
  affects: ["web/src/pages/AdminPage.tsx"]
tech_stack:
  added: []
  patterns:
    - slug-preview (toSlug mirrors server implementation exactly)
    - growth-rate-percent-decimal-conversion (UI% ↔ API decimal)
    - inline-409-delete-error (no ConfirmDialog for protected resources)
    - cancelled-fetch-guard (mirrors DashboardPage pattern)
key_files:
  created:
    - web/src/components/admin/AssetModal.tsx
    - web/src/components/admin/AssetsTab.tsx
  modified:
    - web/src/pages/AdminPage.tsx
decisions:
  - "deleteError state uses { id, message } | null (single active error) rather than Record<string, string> — matches plan interface code exactly"
  - "slug preview in create mode auto-derives via toSlug(name); in edit mode shows immutable item.id — both always readOnly"
  - "Growth rate null (inherit) sorted to bottom when sorting by growth column (uses -Infinity as sentinel)"
metrics:
  duration: "~5 minutes"
  completed: "2026-04-22T19:29:26Z"
  tasks_completed: 3
  files_changed: 3
---

# Phase 6 Plan 02: Assets Tab — Summary

**One-liner:** Assets CRUD tab with slug preview, growth-rate %↔decimal conversion, and inline 409 delete errors (no ConfirmDialog).

## What Was Built

### AssetModal (`web/src/components/admin/AssetModal.tsx`)
- Create/Edit modal form matching DataPointModal layout and styling conventions
- **Slug preview field**: always `readOnly`. In create mode derives `toSlug(name)` live; in edit mode shows the immutable `item.id`
- `toSlug()` defined at module scope, mirrors server implementation exactly: `.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')`
- **Category dropdown**: populated from `categories` prop passed down from AssetsTab
- **Growth rate field**: optional; blank = null (inherit from category). Input accepts percentage (e.g. `8`) → saved as decimal (`0.08`). Initialized from `item.projected_yearly_growth * 100` on edit
- Location and Notes: optional text fields
- Validation: name required, category required, growth rate must be numeric if provided

### AssetsTab (`web/src/components/admin/AssetsTab.tsx`)
- Fetches `getAssets()` + `getCategories()` in parallel with cancelled-fetch guard (mirrors DashboardPage pattern)
- Default sort: name ASC (configurable — name/category/growth columns all sortable)
- Table columns: Name, Category, Growth Rate, Location, Notes, Actions
- Growth rate display: `null` → "Inherits"; decimal → `"8.00%"` via `(rate * 100).toFixed(2)`
- **Inline delete error**: no ConfirmDialog. 409 errors from `deleteAsset()` stored as `{ id, message } | null` and rendered inline below the action buttons in that row. Other errors are silently dropped (non-409 deletes would be unexpected server errors)
- Add/Edit via AssetModal; save triggers `retryCount` increment → refetch

### AdminPage (`web/src/pages/AdminPage.tsx`)
- Replaced the "Assets tab coming soon" placeholder div with `<AssetsTab />`
- Added `AssetsTab` import

## Verification

```
✓ npx tsc --noEmit   exit 0
✓ npm run build      exit 0 (vite build, 606.86 kB bundle)
```

## Commits

| Hash | Message |
|------|---------|
| `2c62289` | feat(06-02): add Assets tab with AssetModal and AssetsTab components |

## Deviations from Plan

None — plan executed exactly as written.

The plan spec mentioned both `Record<string, string>` (in the prompt text) and `{ id: string; message: string } | null` (in the interface code). The interface code was used — it's the authoritative contract and only one delete error is active at a time (clicking delete clears the previous error first via `setDeleteError(null)`).

## Self-Check

- [x] `web/src/components/admin/AssetModal.tsx` — created ✓
- [x] `web/src/components/admin/AssetsTab.tsx` — created ✓
- [x] `web/src/pages/AdminPage.tsx` — modified ✓
- [x] Commit `2c62289` — present ✓
- [x] TypeScript: exit 0 ✓
- [x] Build: exit 0 ✓

## Known Stubs

None — AssetsTab fetches live data from API on mount; no hardcoded mock data.

## Threat Flags

None — no new network endpoints, auth paths, or trust boundary changes introduced. All data flows through existing API client.
