---
phase: 02-crud-api
plan: 03
type: execute
wave: 2
depends_on:
  - 02-1
  - 02-2
files_modified:
  - server/src/index.ts
autonomous: true
requirements:
  - API-01
  - API-02
  - API-03

must_haves:
  truths:
    - "All errors from any route return {error: message} JSON — not HTML, not raw Zod shape, not stack traces"
    - "GET /api/v1/health returns {status: ok}"
    - "All three resource routers are mounted: /api/v1/categories, /api/v1/assets, /api/v1/data-points"
    - "GET requests to non-API paths (e.g. /dashboard) return index.html content"
    - "Static assets (e.g. /assets/main.js) are served as files, not as index.html"
    - "POST/PUT/DELETE to non-API paths do NOT return index.html (SPA catch-all is GET only)"
    - "app.onError is registered BEFORE any route — catches HTTPException from all mounted sub-routers"
    - "WEB_DIST resolved via import.meta.url — works regardless of CWD"
  artifacts:
    - path: "server/src/index.ts"
      provides: "Main Hono app with error handler, API routes, serveStatic, SPA catch-all"
      contains: "app.onError|serveStatic|app.get('*'"
  key_links:
    - from: "server/src/index.ts"
      to: "server/src/routes/categories.ts"
      via: "app.route('/api/v1/categories', categoriesRouter)"
      pattern: "app.route.*categories"
    - from: "server/src/index.ts"
      to: "server/src/routes/assets.ts"
      via: "app.route('/api/v1/assets', assetsRouter)"
      pattern: "app.route.*assets"
    - from: "server/src/index.ts"
      to: "server/src/routes/dataPoints.ts"
      via: "app.route('/api/v1/data-points', dataPointsRouter)"
      pattern: "app.route.*data-points"
    - from: "server/src/index.ts"
      to: "web/dist/"
      via: "serveStatic({ root: WEB_DIST }) then readFile(resolve(WEB_DIST, 'index.html'))"
      pattern: "serveStatic|WEB_DIST"
---

<objective>
Rewrite `server/src/index.ts` to wire all three resource routers, register the global error handler, and configure React SPA static file serving.

Purpose: Plans 2.1 and 2.2 created the route handler files; this plan activates them by mounting them in the main app with the correct middleware registration order. This is the final integration step that makes the entire Phase 2 API live.
Output: Updated `server/src/index.ts` with global error handler, all three routers mounted, static file serving, and SPA catch-all — in the required registration order.
</objective>

<execution_context>
@.github/get-shit-done/workflows/execute-plan.md
@.github/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/REQUIREMENTS.md
@.planning/phases/02-crud-api/02-RESEARCH.md
@.planning/phases/01-data-foundation/01-CONTEXT.md

<interfaces>
<!-- Current server/src/index.ts content (this file WILL be fully replaced) -->
```typescript
// Current state (Phase 1 output):
import { Hono } from 'hono'
import { serve } from '@hono/node-server'
import { bootstrapDatabase } from './bootstrap.js'

const app = new Hono()

app.get('/api/v1/health', (c) => c.json({ status: 'ok' }))

await bootstrapDatabase()

const PORT = Number(process.env.PORT ?? 8080)

serve({ fetch: app.fetch, port: PORT }, () => {
  console.log(`WealthTrack listening on port ${PORT}`)
})
```

<!-- Router exports from Plans 2.1 and 2.2 (available after those plans execute) -->
```typescript
// server/src/routes/categories.ts
export default router  // Hono router for /api/v1/categories

// server/src/routes/assets.ts
export default router  // Hono router for /api/v1/assets

// server/src/routes/dataPoints.ts
export default router  // Hono router for /api/v1/data-points
```

<!-- serveStatic import — CRITICAL: must use @hono/node-server/serve-static, NOT hono/middleware -->
```typescript
import { serveStatic } from '@hono/node-server/serve-static'
// NOT: import { serveStatic } from 'hono/middleware'  -- edge runtime only, does not read local files
```
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Rewrite server/src/index.ts with full wiring</name>
  <files>server/src/index.ts</files>

  <read_first>
    - server/src/index.ts — read current content first to understand what exists (Phase 1 state)
    - .planning/phases/02-crud-api/02-RESEARCH.md — Section 4 (onError + HTTPException), Section 5 (serveStatic path resolution and SPA fallthrough), Section 6 (CRITICAL middleware registration order), Pattern 2 (complete updated index.ts), Pitfall B (wrong serveStatic import), Pitfall D (SPA catch-all must be app.get not app.use)
    - server/src/routes/categories.ts — confirm it exists and exports default router
    - server/src/routes/assets.ts — confirm it exists and exports default router
    - server/src/routes/dataPoints.ts — confirm it exists and exports default router
  </read_first>

  <action>
Replace the entire content of `server/src/index.ts` with the following. Read the current file first so you understand what you are replacing (Phase 1 state shown in the context interfaces block above).

CRITICAL registration order — MUST NOT be changed:
1. `app.onError(...)` — registered FIRST, before any routes
2. `app.get('/api/v1/health', ...)` and `app.route(...)` — API routes
3. `app.use('*', serveStatic(...))` — static file serving, AFTER all API routes
4. `app.get('*', ...)` — SPA catch-all, LAST; MUST be `app.get` not `app.use` (prevents POST/DELETE from receiving HTML)

WEB_DIST resolution: Use `dirname(fileURLToPath(import.meta.url))` to get absolute path independent of CWD. The `process.env.WEB_DIST` override allows Docker to point to the built frontend.

serveStatic import: MUST be from `@hono/node-server/serve-static` — the `hono/middleware` variant is for edge runtimes and does not read Node.js filesystem.

Write this exact file:

```typescript
import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { bootstrapDatabase } from './bootstrap.js'
import categoriesRouter from './routes/categories.js'
import assetsRouter from './routes/assets.js'
import dataPointsRouter from './routes/dataPoints.js'

// import.meta.url gives reliable absolute path regardless of CWD (RESEARCH.md Section 5)
// In src/: resolves to server/src/ → ../../web/dist = web/dist
// In dist/: resolves to server/dist/ → ../../web/dist = web/dist
const __dirname = dirname(fileURLToPath(import.meta.url))
const WEB_DIST = process.env.WEB_DIST ?? resolve(__dirname, '../../web/dist')

const app = new Hono()

// STEP 1: Global error handler — MUST be registered before any routes (RESEARCH.md Section 4)
// Catches HTTPException thrown from all mounted sub-routers (Pitfall F: parent onError handles sub-routers)
app.onError((err, c) => {
  if (err instanceof HTTPException) {
    return c.json({ error: err.message }, err.status)
  }
  console.error(err)
  return c.json({ error: 'Internal server error' }, 500)
})

// STEP 2: API routes — must be registered before serveStatic so /api/v1/* never hits the filesystem
app.get('/api/v1/health', (c) => c.json({ status: 'ok' }))
app.route('/api/v1/categories', categoriesRouter)
app.route('/api/v1/assets', assetsRouter)
app.route('/api/v1/data-points', dataPointsRouter)

// STEP 3: Static file serving — after API routes, before SPA catch-all
// serveStatic calls next() when file not found — falls through to SPA catch-all naturally
// Import is @hono/node-server/serve-static (NOT hono/middleware — that is edge-runtime only)
app.use('*', serveStatic({ root: WEB_DIST }))

// STEP 4: SPA catch-all — MUST be last, MUST be app.get (not app.use)
// app.use would serve index.html for POST/PUT/DELETE to unknown paths — incorrect behavior
app.get('*', async (c) => {
  try {
    const html = await readFile(resolve(WEB_DIST, 'index.html'), 'utf-8')
    return c.html(html)
  } catch {
    return c.json({ error: 'Not found' }, 404)
  }
})

// Bootstrap runs before accepting requests (STOR-01: create database.yaml with seed data if missing)
await bootstrapDatabase()

const PORT = Number(process.env.PORT ?? 8080)

serve({ fetch: app.fetch, port: PORT }, () => {
  console.log(`WealthTrack listening on port ${PORT}`)
})
```
  </action>

  <verify>
    <automated>grep -n "from '\.\." server/src/index.ts | grep -v "\.js'" && echo "FAIL: missing .js extension" || echo "OK: all local imports have .js extension"</automated>
    <automated>cd server && npx tsc --noEmit 2>&1 | head -30</automated>
  </verify>

  <acceptance_criteria>
    - grep "from '@hono/node-server/serve-static'" server/src/index.ts returns a match (correct import, not 'hono/middleware')
    - grep "from 'hono/middleware'" server/src/index.ts returns NO match
    - grep "app.onError" server/src/index.ts returns a match
    - grep "instanceof HTTPException" server/src/index.ts returns a match
    - grep "Internal server error" server/src/index.ts returns a match (500 fallback)
    - grep "app.route('/api/v1/categories'" server/src/index.ts returns a match
    - grep "app.route('/api/v1/assets'" server/src/index.ts returns a match
    - grep "app.route('/api/v1/data-points'" server/src/index.ts returns a match
    - grep "serveStatic({ root: WEB_DIST })" server/src/index.ts returns a match
    - grep "app.get('\*'" server/src/index.ts returns a match (SPA catch-all is GET not use)
    - grep "app.use('\*'" server/src/index.ts returns exactly 1 match (the serveStatic line only — not a second catch-all)
    - grep "import.meta.url" server/src/index.ts returns a match (reliable WEB_DIST resolution)
    - grep "dirname(fileURLToPath" server/src/index.ts returns a match
    - grep "bootstrapDatabase" server/src/index.ts returns a match (Phase 1 bootstrap preserved)
    - Verify registration order: grep -n "onError\|app.get.*health\|app.route\|serveStatic\|app.get.*\*" server/src/index.ts shows onError on a lower line number than all app.route lines, and serveStatic on a higher line number than all app.route lines, and SPA catch-all last
    - cd server && npx tsc --noEmit exits 0
  </acceptance_criteria>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <what-built>
    server/src/index.ts has been rewritten with:
    - Global onError handler (returns {"error":"..."} for HTTPException, {"error":"Internal server error"} for 500s)
    - All three resource routers mounted at /api/v1/categories, /api/v1/assets, /api/v1/data-points
    - serveStatic middleware from @hono/node-server/serve-static for the web/dist directory
    - SPA catch-all as app.get('*') serving index.html (falls back to 404 if index.html not yet built)
    - TypeScript compiles clean (npx tsc --noEmit exits 0)
  </what-built>

  <how-to-verify>
Run the server and execute these curl checks. Start the server first:
```bash
cd server && npm run dev
```

1. Health endpoint (API-03):
```bash
curl -s http://localhost:8080/api/v1/health | jq .
```
Expected: `{"status":"ok"}`

2. GET categories — returns seeded data (API routes working):
```bash
curl -s http://localhost:8080/api/v1/categories | jq 'length'
```
Expected: 4 (the seeded categories from Phase 1)

3. Consistent error shape — 404 from category route (API-01):
```bash
curl -s http://localhost:8080/api/v1/categories/nonexistent | jq .
```
Expected: `{"error":"Category not found"}` — NOT HTML, NOT `{"success":false,...}`

4. Validation error shape — 400 from zValidator (API-01):
```bash
curl -s -X POST http://localhost:8080/api/v1/categories \
  -H 'Content-Type: application/json' \
  -d '{"name":"Test"}' | jq .
```
Expected: `{"error":"..."}` with a message about missing fields — NOT raw Zod shape

5. SPA catch-all for GET (API-02) — note: web/dist may not be built yet, so 404 JSON is acceptable:
```bash
curl -s http://localhost:8080/dashboard
```
Expected: either HTML content (if web/dist is built) OR `{"error":"Not found"}` JSON — NOT a Node.js crash

6. SPA catch-all does NOT fire for POST to non-existent path (API-02 boundary):
```bash
curl -s -X POST http://localhost:8080/dashboard | head -5
```
Expected: empty body or 404 — NOT `index.html` content (app.get('*') does not match POST)

7. TypeScript clean:
```bash
cd server && npx tsc --noEmit
```
Expected: exits 0, no output
  </how-to-verify>

  <resume-signal>Type "approved" if all checks pass, or describe which check failed and what the actual output was.</resume-signal>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| HTTP client → Hono app | All requests enter here; onError is the last line of defense for unhandled errors |
| Hono app → web/dist filesystem | serveStatic reads files from WEB_DIST; path normalization prevents traversal |
| Hono app → sub-routers | app.route() delegates to trusted internal routers |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-02-16 | Information Disclosure | app.onError 500 handler | mitigate | Returns "Internal server error" string only; `console.error(err)` logs stack to server stdout (not client) |
| T-02-17 | Tampering | SPA catch-all method matching | mitigate | `app.get('*', ...)` not `app.use('*', ...)` — POST/PUT/DELETE to unknown paths do not receive HTML |
| T-02-18 | Tampering | Path traversal via serveStatic root | accept | @hono/node-server serveStatic normalizes paths internally (verified in RESEARCH.md Section 5 live source inspection); WEB_DIST is an absolute path from import.meta.url |
| T-02-19 | Denial of Service | SPA catch-all reading index.html on every unmatched GET | accept | Single-user self-hosted app; one file read per unknown GET is negligible; OS page cache covers this |
| T-02-20 | Spoofing | Middleware registration order wrong | mitigate | onError before routes (RESEARCH.md Section 6); serveStatic after API routes (prevents /api/v1/* hitting filesystem); SPA catch-all last (prevents premature HTML responses) |
</threat_model>

<verification>
Full Phase 2 acceptance checks after Plan 2.3 completes:

```bash
# Start server
cd server && npm run dev &
sleep 3

# API-03: health
curl -s http://localhost:8080/api/v1/health
# Expected: {"status":"ok"}

# API-01: all errors use {"error":"..."} shape
curl -s http://localhost:8080/api/v1/categories/nonexistent
# Expected: {"error":"Category not found"}

curl -s -X POST http://localhost:8080/api/v1/categories \
  -H 'Content-Type: application/json' -d '{"name":"Test"}' | jq .error
# Expected: a non-null string (not null, not undefined)

# CAT-01 through DP-04: all four resources fully functional
curl -s http://localhost:8080/api/v1/categories | jq 'type'    # "array"
curl -s http://localhost:8080/api/v1/assets | jq 'type'        # "array"
curl -s http://localhost:8080/api/v1/data-points | jq 'type'   # "array"

# API-02: SPA catch-all
curl -s http://localhost:8080/dashboard
# Expected: HTML (if web/dist built) or {"error":"Not found"} JSON — NOT Node.js error

# TypeScript
cd server && npx tsc --noEmit
# Expected: exit 0

# Grep structural checks
grep "app.onError" server/src/index.ts          # must exist
grep "serveStatic" server/src/index.ts          # must exist
grep "app.get('\*'" server/src/index.ts         # SPA catch-all as GET
grep -v "app.use('\*'" server/src/index.ts | grep "app.use" | grep -v serveStatic
# Expected: no output (only app.use is serveStatic)
```
</verification>

<success_criteria>
- server/src/index.ts rebuilt with all required sections in the correct order
- `cd server && npx tsc --noEmit` exits 0 for the entire server codebase
- app.onError registered before routes (line number check)
- All three routers mounted at correct API paths
- serveStatic uses @hono/node-server/serve-static (not hono/middleware)
- SPA catch-all is app.get('*') not app.use('*')
- WEB_DIST uses import.meta.url resolution
- Health endpoint returns {"status":"ok"}
- 404 on unknown category returns {"error":"Category not found"} not HTML or Zod shape
- Human verification checkpoint passed
</success_criteria>

<output>
After completion, create `.planning/phases/02-crud-api/02-3-SUMMARY.md`
</output>
