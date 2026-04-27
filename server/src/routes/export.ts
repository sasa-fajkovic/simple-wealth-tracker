import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { readFile } from 'node:fs/promises'
import { DB_PATH, CSV_PATH } from '../storage/index.js'

const router = new Hono()

async function readOrFail(path: string, label: string): Promise<Buffer> {
  try {
    return await readFile(path)
  } catch (e) {
    const code = (e as NodeJS.ErrnoException).code
    if (code === 'ENOENT') {
      throw new HTTPException(404, { message: `${label} not found` })
    }
    throw e
  }
}

router.get('/database', async (c) => {
  const buf = await readOrFail(DB_PATH, 'database.yaml')
  c.header('Content-Type', 'application/x-yaml; charset=utf-8')
  c.header('Content-Disposition', 'attachment; filename="database.yaml"')
  return c.body(buf)
})

router.get('/datapoints', async (c) => {
  const buf = await readOrFail(CSV_PATH, 'datapoints.csv')
  c.header('Content-Type', 'text/csv; charset=utf-8')
  c.header('Content-Disposition', 'attachment; filename="datapoints.csv"')
  return c.body(buf)
})

export default router
