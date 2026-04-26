import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { readDb, mutateDb } from '../storage/index.js'
import type { Person } from '../models/index.js'
import { toSlug } from '../util/slug.js'
import { zodErrorHook as hook } from '../util/zodHook.js'

const router = new Hono()

const createSchema = z.object({
  name: z.string().min(1, 'name is required'),
})

const updateSchema = createSchema.extend({ id: z.string().optional() })

// GET /api/v1/persons
router.get('/', async (c) => {
  const db = await readDb()
  return c.json([...(db.persons ?? [])].sort((a, b) => a.name.localeCompare(b.name)))
})

// POST /api/v1/persons
router.post('/', zValidator('json', createSchema, hook), async (c) => {
  const body = c.req.valid('json')
  const id = toSlug(body.name)
  const db = await readDb()
  if ((db.persons ?? []).find((p) => p.id === id)) {
    throw new HTTPException(409, { message: `Person with id '${id}' already exists` })
  }
  const person: Person = { id, name: body.name }
  await mutateDb(
    (db) => ({ ...db, persons: [...(db.persons ?? []), person] }),
    { action: 'person.create', meta: { id: person.id, name: person.name } },
  )
  return c.json(person, 201)
})

// PUT /api/v1/persons/:id
router.put('/:id', zValidator('json', updateSchema, hook), async (c) => {
  const paramId = c.req.param('id')
  const body = c.req.valid('json')
  if (body.id !== undefined && body.id !== paramId) {
    throw new HTTPException(400, { message: 'id cannot be changed' })
  }
  const db = await readDb()
  const idx = (db.persons ?? []).findIndex((p) => p.id === paramId)
  if (idx === -1) throw new HTTPException(404, { message: 'Person not found' })
  const { id: _id, ...updateData } = body
  const updated: Person = { ...(db.persons ?? [])[idx], ...updateData, id: paramId }
  await mutateDb(
    (db) => {
      const persons = [...(db.persons ?? [])]
      persons[idx] = updated
      return { ...db, persons }
    },
    { action: 'person.update', meta: { id: paramId, name: updated.name } },
  )
  return c.json(updated)
})

// DELETE /api/v1/persons/:id?reassign_to=<person_id>
// Assets assigned to this person must be reassigned to another person before deletion
// (person_id is required on all assets — "unassign" is not allowed).
router.delete('/:id', async (c) => {
  const id = c.req.param('id')
  const reassignTo = c.req.query('reassign_to')   // undefined or empty = not provided
  const db = await readDb()

  if (!(db.persons ?? []).find((p) => p.id === id)) {
    throw new HTTPException(404, { message: 'Person not found' })
  }

  const affected = db.assets.filter((a) => a.person_id === id)

  if (affected.length > 0 && !reassignTo) {
    // Frontend hasn't confirmed reassignment yet — return affected assets for the dialog
    return c.json({ needs_reassign: true, assets: affected }, 409 as const)
  }

  if (reassignTo && !(db.persons ?? []).find((p) => p.id === reassignTo)) {
    throw new HTTPException(400, { message: 'reassign_to person not found' })
  }

  await mutateDb(
    (db) => ({
      ...db,
      persons: (db.persons ?? []).filter((p) => p.id !== id),
      assets: db.assets.map((a) =>
        a.person_id === id ? { ...a, person_id: reassignTo! } : a
      ),
    }),
    { action: 'person.delete', meta: { id, reassigned_to: reassignTo ?? null } },
  )
  return c.json({ success: true })
})

export default router
