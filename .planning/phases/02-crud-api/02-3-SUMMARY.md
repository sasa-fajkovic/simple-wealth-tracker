---
plan: 02-3
phase: 02
status: complete
commit: e2dbf0d
---

# Summary: Plan 02-3 — Wire Routers into index.ts

## What Was Built

- `server/src/index.ts` — Full rewrite: error handler, API route mounts, serveStatic, SPA catch-all

## Acceptance Criteria Results

| ID | Requirement | Result |
|----|-------------|--------|
| API-01 | GET /api/v1/health returns {"status":"ok"} | ✅ |
| API-02 | Middleware order: onError → routes → serveStatic → SPA catch-all | ✅ |
| API-03 | Global onError returns {"error":"Internal server error"} (500) | ✅ |

## Smoke Test Results (verified with DATA_FILE=/tmp/wealthtrack-test.yaml)

| Test | Expected | Actual | Pass |
|------|----------|--------|------|
| GET /api/v1/health | {"status":"ok"} | {"status":"ok"} | ✅ |
| GET /api/v1/categories | count: 4 | count: 4 | ✅ |
| DELETE /api/v1/categories/nonexistent | {"error":"Category not found"} | {"error":"Category not found"} | ✅ |
| POST /api/v1/data-points (bad year_month) | {"error":"year_month must be YYYY-MM"} | {"error":"year_month must be YYYY-MM"} | ✅ |
| GET /dashboard (no web/dist) | 404 JSON | {"error":"Not found"} | ✅ |
| POST /dashboard | 404 (not HTML) | 404 Not Found | ✅ |

## Key Implementation Details

- `serveStatic` imported from `@hono/node-server/serve-static` (NOT `hono/middleware` — edge only)
- `WEB_DIST` resolved via `dirname(fileURLToPath(import.meta.url))` — CWD-independent
- `app.onError(...)` registered FIRST before any routes
- SPA catch-all: `app.get('*', ...)` — GET only, not `app.use('*', ...)` — POST to non-API paths correctly 404
- `bootstrapDatabase()` called before `serve()` to ensure DB exists before first request
