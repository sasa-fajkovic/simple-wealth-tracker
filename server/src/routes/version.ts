// server/src/routes/version.ts
import { Hono } from 'hono'

const router = new Hono()

router.get('/', (c) => {
  const sha = process.env.GIT_SHA ?? 'dev'
  return c.json({ sha })
})

export default router
