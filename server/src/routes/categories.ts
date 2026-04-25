import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { readDb, mutateDb } from '../storage/index.js'
import type { Category } from '../models/index.js'

const router = new Hono()

// MANDATORY: pass hook as 3rd arg — default returns { success: false, error: ZodIssue[] }
// which does NOT match the required {"error":"..."} API contract (API-01).
const hook = (result: { success: boolean; error?: z.ZodError }, c: any) => {
  if (!result.success && result.error) {
    return c.json({ error: result.error.issues[0]?.message ?? 'Invalid request' }, 400 as const)
  }
}

const createSchema = z.object({
  name: z.string().min(1, 'name is required'),
  projected_yearly_growth: z.number(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'color must be a 6-digit hex color'),
  track_only: z.boolean().optional(),
})

// id is optional here only to detect change attempts in PUT — not required on create
const updateSchema = createSchema.extend({ id: z.string().optional() })

// MODEL-01: id is a URL-safe slug derived from name
function toSlug(name: string): string {
  return name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
}

// CAT-01: GET all categories
router.get('/', async (c) => {
  const db = await readDb()
  return c.json(db.categories)
})

// CAT-02: POST — validate, generate slug id, persist
router.post('/', zValidator('json', createSchema, hook), async (c) => {
  const body = c.req.valid('json')
  const id = toSlug(body.name)

  const db = await readDb()
  if (db.categories.find((cat) => cat.id === id)) {
    throw new HTTPException(409, { message: `Category with id '${id}' already exists` })
  }

  const category: Category = { id, ...body }
  await mutateDb(
    (db) => ({ ...db, categories: [...db.categories, category] }),
    { action: 'category.create', meta: { id: category.id, name: category.name } },
  )
  return c.json(category, 201)
})

// CAT-03: PUT — full update; reject id change attempts
router.put('/:id', zValidator('json', updateSchema, hook), async (c) => {
  const paramId = c.req.param('id')
  const body = c.req.valid('json')

  if (body.id !== undefined && body.id !== paramId) {
    throw new HTTPException(400, { message: 'id cannot be changed' })
  }

  const db = await readDb()
  const idx = db.categories.findIndex((cat) => cat.id === paramId)
  if (idx === -1) throw new HTTPException(404, { message: 'Category not found' })

  // Destructure _id out so updateData never contains id (noUnusedLocals: _ prefix is exempt)
  const { id: _id, ...updateData } = body
  const updated: Category = { ...db.categories[idx], ...updateData, id: paramId }
  await mutateDb(
    (db) => {
      const cats = [...db.categories]
      cats[idx] = updated
      return { ...db, categories: cats }
    },
    { action: 'category.update', meta: { id: paramId, name: updated.name } },
  )
  return c.json(updated)
})

// CAT-04: DELETE /categories/:id?reassign_to=<category_id>
// Assets in this category are reassigned to reassign_to before the category is removed.
router.delete('/:id', async (c) => {
  const id = c.req.param('id')
  const reassignTo = c.req.query('reassign_to')

  const db = await readDb()
  if (!db.categories.find((cat) => cat.id === id)) {
    throw new HTTPException(404, { message: 'Category not found' })
  }

  const affected = db.assets.filter((a) => a.category_id === id)

  if (affected.length > 0 && reassignTo === undefined) {
    return c.json({ needs_reassign: true, assets: affected }, 409 as const)
  }

  if (reassignTo && !db.categories.find((cat) => cat.id === reassignTo)) {
    throw new HTTPException(400, { message: 'reassign_to category not found' })
  }

  await mutateDb(
    (db) => ({
      ...db,
      categories: db.categories.filter((cat) => cat.id !== id),
      assets: affected.length > 0 && reassignTo
        ? db.assets.map((a) => a.category_id === id ? { ...a, category_id: reassignTo } : a)
        : db.assets,
    }),
    { action: 'category.delete', meta: { id, reassigned_to: reassignTo ?? null } },
  )
  return c.json({ success: true })
})

export default router
