import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { readDb, readDbAndDataPoints, mutateDb, mutateDbAndDataPoints } from '../storage/index.js'
import type { Asset } from '../models/index.js'

const router = new Hono()

// MANDATORY hook — returns {"error":"..."} on failure (API-01 compliance)
const hook = (result: { success: boolean; error?: z.ZodError }, c: any) => {
  if (!result.success && result.error) {
    return c.json({ error: result.error.issues[0]?.message ?? 'Invalid request' }, 400 as const)
  }
}

const createSchema = z.object({
  name: z.string().min(1, 'name is required'),
  category_id: z.string().min(1, 'category_id is required'),
  projected_yearly_growth: z.number().nullable(),
  location: z.string().optional(),
  notes: z.string().optional(),
  person_id: z.string().nullable().optional(),   // Phase 7: optional person assignment
})

// id optional only to detect change attempts in PUT
const updateSchema = createSchema.extend({ id: z.string().optional() })

// MODEL-02: id is a URL-safe slug derived from name
function toSlug(name: string): string {
  return name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
}

// ASSET-01: GET all assets
router.get('/', async (c) => {
  const db = await readDb()
  return c.json(db.assets)
})

// ASSET-02: POST — validate category_id exists, generate slug id, set created_at
router.post('/', zValidator('json', createSchema, hook), async (c) => {
  const body = c.req.valid('json')
  const id = toSlug(body.name)

  const db = await readDb()
  if (!db.categories.find((cat) => cat.id === body.category_id)) {
    throw new HTTPException(404, { message: 'Category not found' })
  }
  if (db.assets.find((a) => a.id === id)) {
    throw new HTTPException(409, { message: `Asset with id '${id}' already exists` })
  }

  const asset: Asset = { id, ...body, created_at: new Date().toISOString() }
  await mutateDb(
    (db) => ({ ...db, assets: [...db.assets, asset] }),
    { action: 'asset.create', meta: { id: asset.id, name: asset.name, category_id: asset.category_id } },
  )
  return c.json(asset, 201)
})

// ASSET-03: PUT — full update; reject id changes; preserve created_at
router.put('/:id', zValidator('json', updateSchema, hook), async (c) => {
  const paramId = c.req.param('id')
  const body = c.req.valid('json')

  if (body.id !== undefined && body.id !== paramId) {
    throw new HTTPException(400, { message: 'id cannot be changed' })
  }

  const db = await readDb()
  const idx = db.assets.findIndex((a) => a.id === paramId)
  if (idx === -1) throw new HTTPException(404, { message: 'Asset not found' })

  // Destructure _id out so updateData never re-applies id (noUnusedLocals: _ prefix is exempt)
  const { id: _id, ...updateData } = body
  // Spread existing first (preserves created_at), then updateData, then force id: paramId
  const updated: Asset = { ...db.assets[idx], ...updateData, id: paramId }
  await mutateDb(
    (db) => {
      const assets = [...db.assets]
      assets[idx] = updated
      return { ...db, assets }
    },
    { action: 'asset.update', meta: { id: paramId, name: updated.name, category_id: updated.category_id } },
  )
  return c.json(updated)
})

// ASSET-04: DELETE /assets/:id?force=true
// With force=true, deletes the asset AND all its data points.
// Without force, returns 409 with the data point count so the frontend can confirm.
router.delete('/:id', async (c) => {
  const id = c.req.param('id')
  const force = c.req.query('force') === 'true'

  const { db, dataPoints } = await readDbAndDataPoints()
  if (!db.assets.find((a) => a.id === id)) {
    throw new HTTPException(404, { message: 'Asset not found' })
  }

  const affected = dataPoints.filter((dp) => dp.asset_id === id)

  if (affected.length > 0 && !force) {
    return c.json({ needs_confirm: true, data_point_count: affected.length }, 409 as const)
  }

  await mutateDbAndDataPoints(
    (db, points) => ({
      db: { ...db, assets: db.assets.filter((a) => a.id !== id) },
      points: points.filter((dp) => dp.asset_id !== id),
    }),
    { action: 'asset.delete', meta: { id, data_points_removed: affected.length } },
  )
  return c.json({ success: true })
})

export default router
