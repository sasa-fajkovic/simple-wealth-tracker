import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { readDb, readDbAndDataPoints, mutateDb, mutateDbAndDataPoints } from '../storage/index.js'
import type { Asset } from '../models/index.js'
import { toSlug } from '../util/slug.js'
import { zodErrorHook as hook } from '../util/zodHook.js'

const router = new Hono()

const yearMonth = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'must be YYYY-MM')

// Accept missing, null, empty string (clear), or YYYY-MM. Empty/null are normalized to undefined later.
const yearMonthInput = z.union([yearMonth, z.literal(''), z.null()]).optional()

const baseSchema = z.object({
  name: z.string().min(1, 'name is required'),
  category_id: z.string().min(1, 'category_id is required'),
  projected_yearly_growth: z.number().nullable(),
  notes: z.string().optional(),
  person_id: z.string().min(1, 'person_id is required'),
  show_from: yearMonthInput,
  show_until: yearMonthInput,
})

function normalizeWindow<T extends { show_from?: string | null; show_until?: string | null }>(body: T): Omit<T, 'show_from' | 'show_until'> & { show_from?: string; show_until?: string } {
  const out = { ...body } as Omit<T, 'show_from' | 'show_until'> & { show_from?: string; show_until?: string }
  if (!body.show_from) delete out.show_from
  else out.show_from = body.show_from
  if (!body.show_until) delete out.show_until
  else out.show_until = body.show_until
  return out
}

const windowRefinement = (v: { show_from?: string | null; show_until?: string | null }) =>
  !v.show_from || !v.show_until || v.show_from <= v.show_until
const windowError = { message: 'show_from must be on or before show_until', path: ['show_until'] }

const createSchema = baseSchema.refine(windowRefinement, windowError)

// id optional only to detect change attempts in PUT
const updateSchema = baseSchema.extend({ id: z.string().optional() }).refine(windowRefinement, windowError)

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

  const asset: Asset = { id, ...normalizeWindow(body), created_at: new Date().toISOString() }
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
  const { id: _id, ...rest } = body
  const updateData = normalizeWindow(rest)
  // Spread existing first (preserves created_at), then drop window fields if cleared, then apply update
  const merged: Asset = { ...db.assets[idx], ...updateData, id: paramId }
  if (!updateData.show_from) delete (merged as { show_from?: string }).show_from
  if (!updateData.show_until) delete (merged as { show_until?: string }).show_until
  const updated = merged
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
