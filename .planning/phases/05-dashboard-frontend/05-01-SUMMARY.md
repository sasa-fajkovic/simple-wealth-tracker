---
phase: 05-dashboard-frontend
plan: "01"
subsystem: frontend-foundation
tags: [typescript, api-client, types, lucide-react, fetch]
dependency_graph:
  requires: []
  provides:
    - web/src/types/index.ts (all frontend TypeScript interfaces)
    - web/src/api/client.ts (typed API client)
    - web/node_modules (fully populated, lucide-react added)
  affects:
    - web/src/types/index.ts (consumed by all Phase 5 components)
    - web/src/api/client.ts (consumed by all Phase 5 components)
tech_stack:
  added:
    - lucide-react@^1.8.0 (icon library for dashboard UI)
  patterns:
    - Generic fetch wrapper with typed return (apiFetch<T>)
    - ApiError class extending Error with status field
    - Relative API base URL (/api/v1) — Vite proxy handles dev routing
    - Pure type-only file (zero imports, zero runtime code)
key_files:
  created:
    - web/src/types/index.ts
    - web/src/api/client.ts
  modified:
    - web/package.json (lucide-react added)
    - web/package-lock.json (generated)
decisions:
  - BASE = '/api/v1' (relative, not absolute) — prevents SSRF redirect to attacker host (T-05-03)
  - getSummary accepts RangeKey not string — type-safe range enforcement at compile time
  - 204 No Content check in apiFetch — DELETE endpoints return no body
  - ProjectionsResponse named with 's' (not ProjectionResponse) — matches plan frontmatter exports list
metrics:
  duration: "2m 9s"
  completed: "2026-04-22T18:05:08Z"
  tasks_completed: 3
  files_created: 2
  files_modified: 2
---

# Phase 5 Plan 1: Dependencies, Types & API Client Summary

**One-liner:** TypeScript type contracts and typed fetch client for all 14 API endpoints using relative /api/v1 base with ApiError class and 204 handling.

## What Was Built

### Task 0 — Install dependencies and verify baseline compile
Ran `npm install` to populate empty `node_modules/`, then `npm install lucide-react` to add the icon library missing from `package.json`. Verified `npx tsc --noEmit` exits 0 on the unmodified scaffold.

### Task 1 — Create shared TypeScript types (`web/src/types/index.ts`)
Pure type-definition file with zero imports and zero runtime code:
- **Domain models:** `Category`, `Asset`, `DataPoint` — mirror `server/src/models/index.ts` exactly
- **CRUD payloads:** `CreateCategoryPayload`, `UpdateCategoryPayload`, `CreateAssetPayload`, `UpdateAssetPayload`, `CreateDataPointPayload`, `UpdateDataPointPayload`
- **Summary API:** `RangeKey` union type + `SummaryResponse` mirroring `server/src/calc/summary.ts`
- **Projections API:** `ProjectionsResponse` with `historical: SummaryResponse` and `projection` shape

### Task 2 — Create typed API client (`web/src/api/client.ts`)
Typed fetch wrapper with 14 exported functions:
- `ApiError` class (extends Error, `status: number` field)
- `apiFetch<T>` — throws `ApiError` on non-2xx, skips `res.json()` on 204 No Content
- Categories: `getCategories`, `createCategory`, `updateCategory`, `deleteCategory`
- Assets: `getAssets`, `createAsset`, `updateAsset`, `deleteAsset`
- Data Points: `getDataPoints`, `createDataPoint`, `updateDataPoint`, `deleteDataPoint`
- Summary: `getSummary(range: RangeKey)` — typed range parameter, no bare string
- Projections: `getProjections(years: number)`

## Deviations from Plan

None — plan executed exactly as written.

Note: Acceptance criteria said `grep -c "^export interface"` returns 10, but the plan's action block defines 11 interfaces (Category, Asset, DataPoint, CreateCategoryPayload, UpdateCategoryPayload, CreateAssetPayload, UpdateAssetPayload, CreateDataPointPayload, UpdateDataPointPayload, SummaryResponse, ProjectionsResponse). The content in the action block is the source of truth — all 11 interfaces were created as specified.

## Known Stubs

None — this plan creates type definitions and a fetch client only. No UI components, no stub data.

## Threat Flags

None — no new network endpoints, auth paths, or trust boundary surfaces introduced. The `BASE = '/api/v1'` relative URL mitigation for T-05-03 is in place and verified.

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| Task 0 | `201b0fb` | chore(05-01): install deps and add lucide-react |
| Task 1 | `b2b181f` | feat(05-01): add shared TypeScript types |
| Task 2 | `ded19c3` | feat(05-01): add typed API client |

## Self-Check: PASSED

Files verified:
- `web/src/types/index.ts` ✓ exists
- `web/src/api/client.ts` ✓ exists
- `web/package.json` contains lucide-react ✓
- Commits 201b0fb, b2b181f, ded19c3 ✓ in git log
- `npx tsc --noEmit` exits 0 ✓
