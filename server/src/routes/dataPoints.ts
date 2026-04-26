import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { randomUUID } from 'node:crypto'
import { categoryType as getCategoryType } from '../models/index.js'
import type { DataPoint } from '../models/index.js'
import { readDb, readDataPoints, readDbAndDataPoints, mutateDataPoints } from '../storage/index.js'

const router = new Hono()

// MANDATORY hook — returns {"error":"..."} on failure (API-01 compliance)
const hook = (result: { success: boolean; error?: z.ZodError }, c: any) => {
  if (!result.success && result.error) {
    return c.json({ error: result.error.issues[0]?.message ?? 'Invalid request' }, 400 as const)
  }
}

// Optional query params for listing — all params are additive and optional (backward-compat)
const listQuerySchema = z.object({
  limit: z.coerce.number().int().positive().optional(),
  offset: z.coerce.number().int().min(0).optional(),
  person_id: z.string().optional(),
  asset_id: z.string().optional(),
  category_id: z.string().optional(),
  year_month: z.string().regex(/^\d{4}-\d{2}$/, 'year_month must be YYYY-MM').optional(),
  sort: z.enum(['year_month', 'asset_id', 'value', 'created_at', 'updated_at']).optional(),
  order: z.enum(['asc', 'desc']).optional(),
})

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

// DP-01: GET data points with optional pagination and filtering.
// Without limit: returns a plain DataPoint[] (backward-compatible).
// With limit: returns { items: DataPoint[], total: number }.
// Filters (person_id, asset_id, category_id, year_month) and sort/order are applied server-side.
router.get('/', zValidator('query', listQuerySchema, hook), async (c) => {
  const {
    limit, offset = 0,
    person_id, asset_id, category_id, year_month,
    sort = 'year_month', order = 'desc',
  } = c.req.valid('query')

  const needsAssetJoin = person_id !== undefined || category_id !== undefined

  let dataPoints: DataPoint[]
  let assetMeta: Map<string, { person_id: string; category_id: string }> | null = null

  if (needsAssetJoin) {
    const { db, dataPoints: pts } = await readDbAndDataPoints()
    dataPoints = pts
    assetMeta = new Map(db.assets.map(a => [a.id, { person_id: a.person_id, category_id: a.category_id }]))
  } else {
    dataPoints = await readDataPoints()
  }

  // Sort — numeric comparison for value, lexicographic for string fields
  const sorted = [...dataPoints].sort((a, b) => {
    let cmp: number
    if (sort === 'value') {
      cmp = a.value - b.value
    } else if (sort === 'year_month') {
      cmp = a.year_month.localeCompare(b.year_month)
    } else if (sort === 'asset_id') {
      cmp = a.asset_id.localeCompare(b.asset_id)
    } else if (sort === 'created_at') {
      cmp = a.created_at.localeCompare(b.created_at)
    } else {
      cmp = a.updated_at.localeCompare(b.updated_at)
    }
    return order === 'desc' ? -cmp : cmp
  })

  // Filter
  const filtered = sorted.filter(dp => {
    if (year_month !== undefined && dp.year_month !== year_month) return false
    if (asset_id !== undefined && dp.asset_id !== asset_id) return false
    if (assetMeta) {
      const meta = assetMeta.get(dp.asset_id)
      if (!meta) return false
      if (person_id !== undefined && meta.person_id !== person_id) return false
      if (category_id !== undefined && meta.category_id !== category_id) return false
    }
    return true
  })

  const total = filtered.length

  if (limit !== undefined) {
    return c.json({ items: filtered.slice(offset, offset + limit), total })
  }

  // Backward compat: no limit → return plain sorted/filtered array
  return c.json(filtered)
})

// DP-02: POST — validate asset_id exists, generate UUID id, set both timestamps
router.post('/', zValidator('json', createSchema, hook), async (c) => {
  const body = c.req.valid('json')

  const db = await readDb()
  const asset = db.assets.find((a) => a.id === body.asset_id)
  if (!asset) {
    throw new HTTPException(404, { message: 'Asset not found' })
  }

  const category = db.categories.find((cat) => cat.id === asset.category_id)
  const catType = category ? getCategoryType(category) : 'asset'
  if (catType === 'liability' && body.value > 0) {
    throw new HTTPException(400, { message: 'Liability values must be zero or negative' })
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

// DP-BATCH: POST /batch — upsert multiple data points atomically.
// Creates missing data points and updates existing ones for the given (asset_id, year_month) pairs.
// Returns per-item error details alongside aggregate counts.
const batchUpsertSchema = z.object({
  items: z.array(z.object({
    asset_id: z.string().min(1, 'asset_id is required'),
    year_month: z.string().regex(/^\d{4}-\d{2}$/, 'year_month must be YYYY-MM'),
    value: z.number().finite('value must be a finite number'),
    notes: z.string().optional(),
  })).min(1, 'items must not be empty').max(500, 'too many items (max 500)'),
})

router.post('/batch', zValidator('json', batchUpsertSchema, hook), async (c) => {
  const { items } = c.req.valid('json')

  // Read db + data points together for consistent validation snapshot
  const { db, dataPoints: snapshotPoints } = await readDbAndDataPoints()
  const assetMap = new Map(db.assets.map(a => [a.id, a]))
  const categoryMap = new Map(db.categories.map(cat => [cat.id, cat]))

  // Pre-validate all items (asset existence + liability constraint)
  type ValidItem = (typeof items)[number] & { existing: DataPoint | undefined }
  const validItems: ValidItem[] = []
  const errors: { asset_id: string; year_month: string; error: string }[] = []
  let failed = 0

  const snapshotIndex = new Map(snapshotPoints.map(dp => [`${dp.asset_id}|${dp.year_month}`, dp]))

  for (const item of items) {
    const asset = assetMap.get(item.asset_id)
    if (!asset) {
      errors.push({ asset_id: item.asset_id, year_month: item.year_month, error: 'Asset not found' })
      failed++
      continue
    }
    const category = categoryMap.get(asset.category_id)
    const catType = category ? getCategoryType(category) : 'asset'
    if (catType === 'liability' && item.value > 0) {
      errors.push({ asset_id: item.asset_id, year_month: item.year_month, error: 'Liability values must be zero or negative' })
      failed++
      continue
    }
    validItems.push({ ...item, existing: snapshotIndex.get(`${item.asset_id}|${item.year_month}`) })
  }

  let created = 0
  let updated = 0
  const now = new Date().toISOString()

  if (validItems.length > 0) {
    // Apply creates + updates atomically inside the mutex; counts are computed from fresh data.
    await mutateDataPoints(
      (pts) => {
        created = 0
        updated = 0
        const liveIndex = new Map(pts.map(dp => [`${dp.asset_id}|${dp.year_month}`, dp]))
        const toCreate: DataPoint[] = []
        const toUpdate = new Map<string, DataPoint>()

        for (const item of validItems) {
          const key = `${item.asset_id}|${item.year_month}`
          const existing = liveIndex.get(key)
          if (existing) {
            toUpdate.set(existing.id, {
              ...existing,
              value: item.value,
              notes: item.notes,
              updated_at: now,
            })
            updated++
          } else {
            toCreate.push({
              id: randomUUID(),
              asset_id: item.asset_id,
              year_month: item.year_month,
              value: item.value,
              notes: item.notes,
              created_at: now,
              updated_at: now,
            })
            created++
          }
        }

        return [...pts.map(dp => toUpdate.get(dp.id) ?? dp), ...toCreate]
      },
      { action: 'datapoint.batch', meta: { created, updated, failed } },
    )
  }

  return c.json({ created, updated, skipped: 0, failed, errors }, 200)
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

  if (body.value !== undefined) {
    const db = await readDb()
    const asset = db.assets.find((a) => a.id === existing.asset_id)
    const category = db.categories.find((cat) => cat.id === asset?.category_id)
    const catType = category ? getCategoryType(category) : 'asset'
    if (catType === 'liability' && body.value > 0) {
      throw new HTTPException(400, { message: 'Liability values must be zero or negative' })
    }
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
