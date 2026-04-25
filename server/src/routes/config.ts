// server/src/routes/config.ts
import { Hono } from 'hono'
import { readDb } from '../storage/index.js'

const router = new Hono()

router.get('/', async (c) => {
  const db = await readDb()
  return c.json({ title: db.title ?? 'WealthTrack' })
})

export default router
