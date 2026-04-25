import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { randomUUID } from 'node:crypto'
import { readDb, readDataPoints, mutateDataPoints } from '../storage/index.js'
import type { DataPoint } from '../models/index.js'

const router = new Hono()

// MANDATORY hook — returns {"error":"..."} on failure (API-01 compliance)
const hook = (result: { success: boolean; error?: z.ZodError }, c: any) => {
  if (!result.success && result.error) {
    return c.json({ error: result.error.issues[0]?.message ?? 'Invalid request' }, 400 as const)
  }
}

const createSchema = z.object({
  asset_id: z.string().min(1, 'asset_id is required'),
  // D-02/D-03: year_month is always provided by the client — validated format only, never server-computed
  year_month: z.string().regex(/^\d{4}-\d{2}$/, 'year_month must be YYYY-MM'),
  value: z.number().finite('value must be a finite number'),
  notes: z.string().optional(),
})

const updateSchema = z.object({
  id: z.string().optional(),       // included only to detect and reject id change attempts
  asset_id: z.string().optional(), // included only to detect and reject asset_id change attempts
  year_month: z.string().regex(/^\d{4}-\d{2}$/, 'year_month must be YYYY-MM'),
  value: z.number().finite('value must be a finite number'),
  notes: z.string().optional(),
})

// DP-01: GET all data points sorted by year_month descending
// localeCompare on YYYY-MM strings is correct — ISO format ensures lexicographic = chronological
router.get('/', async (c) => {
  const dataPoints = await readDataPoints()
  const sorted = [...dataPoints].sort((a, b) =>
    b.year_month.localeCompare(a.year_month)
  )
  return c.json(sorted)
})

// DP-02: POST — validate asset_id exists, generate UUID id, set both timestamps
router.post('/', zValidator('json', createSchema, hook), async (c) => {
  const body = c.req.valid('json')

  const db = await readDb()
  if (!db.assets.find((a) => a.id === body.asset_id)) {
    throw new HTTPException(404, { message: 'Asset not found' })
  }

  const now = new Date().toISOString()
  const point: DataPoint = {
    id: randomUUID(),
    ...body,
    created_at: now,
    updated_at: now,
  }
  await mutateDataPoints(
    (points) => [...points, point],
    { action: 'datapoint.create', meta: { id: point.id, asset_id: point.asset_id, year_month: point.year_month } },
  )
  return c.json(point, 201)
})

// DP-03: PUT — update year_month/value/notes; refresh updated_at; block id and asset_id changes
router.put('/:id', zValidator('json', updateSchema, hook), async (c) => {
  const paramId = c.req.param('id')
  const body = c.req.valid('json')

  if (body.id !== undefined && body.id !== paramId) {
    throw new HTTPException(400, { message: 'id cannot be changed' })
  }

  const dataPoints = await readDataPoints()
  const existing = dataPoints.find((dp) => dp.id === paramId)
  if (!existing) throw new HTTPException(404, { message: 'Data point not found' })

  if (body.asset_id !== undefined && body.asset_id !== existing.asset_id) {
    throw new HTTPException(400, { message: 'asset_id cannot be changed' })
  }

  // Destructure immutable fields out so they are never overridden from body
  // _ prefix exempts variables from noUnusedLocals
  const { id: _id, asset_id: _assetId, ...updateFields } = body
  const updated: DataPoint = {
    ...existing,     // preserves id, asset_id, created_at
    ...updateFields, // applies year_month, value, notes from body
    id: paramId,     // force correct id
    asset_id: existing.asset_id, // preserve immutable asset_id
    updated_at: new Date().toISOString(),
  }
  await mutateDataPoints(
    (points) => points.map((dp) => (dp.id === paramId ? updated : dp)),
    { action: 'datapoint.update', meta: { id: paramId, asset_id: updated.asset_id, year_month: updated.year_month } },
  )
  return c.json(updated)
})

// DP-04: DELETE — no referential integrity check, delete unconditionally
router.delete('/:id', async (c) => {
  const id = c.req.param('id')

  const dataPoints = await readDataPoints()
  if (!dataPoints.find((dp) => dp.id === id)) {
    throw new HTTPException(404, { message: 'Data point not found' })
  }

  await mutateDataPoints(
    (points) => points.filter((dp) => dp.id !== id),
    { action: 'datapoint.delete', meta: { id } },
  )
  return c.json({ success: true })
})

export default router
