import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { bootstrapDatabase } from './bootstrap.js'
import { pruneAuditLogs } from './audit/index.js'
import categoriesRouter from './routes/categories.js'
import assetsRouter from './routes/assets.js'
import dataPointsRouter from './routes/dataPoints.js'
import summaryRouter from './routes/summary.js'
import projectionsRouter from './routes/projections.js'
import personsRouter from './routes/persons.js'
import exportRouter from './routes/export.js'

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
app.route('/api/v1/summary', summaryRouter)
app.route('/api/v1/projections', projectionsRouter)
app.route('/api/v1/persons', personsRouter)
app.route('/api/v1/export', exportRouter)

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
// Best-effort log retention; never blocks startup if it fails.
await pruneAuditLogs()

const PORT = Number(process.env.PORT ?? 8080)

serve({ fetch: app.fetch, port: PORT }, () => {
  console.log(`WealthTrack listening on port ${PORT}`)
})
