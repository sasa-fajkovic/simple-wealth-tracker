// Route-level integration tests using Hono's app.fetch(new Request(...)) pattern.
//
// IMPORTANT: env vars must be set before any module that reads them. Storage
// captures DATA_FILE / DATA_POINTS_FILE / LOGS_DIR at module init, so we set
// them at the top of the file and use dynamic imports() inside the suite.

import { test, before, after, describe } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { stringify } from 'yaml'

const tempRoot = await mkdtemp(join(tmpdir(), 'wt-routes-'))
const DATA_FILE = join(tempRoot, 'database.yaml')
const DATA_POINTS_FILE = join(tempRoot, 'datapoints.csv')
const LOGS_DIR = join(tempRoot, 'logs')

process.env.DATA_FILE = DATA_FILE
process.env.DATA_POINTS_FILE = DATA_POINTS_FILE
process.env.LOGS_DIR = LOGS_DIR

// Seed the temp YAML before any module reads it.
const seedDb = {
  categories: [
    { id: 'stocks', name: 'Stocks', projected_yearly_growth: 0.08, color: '#6366f1', type: 'asset' as const },
    { id: 'cash', name: 'Cash', projected_yearly_growth: 0.02, color: '#22c55e', type: 'asset' as const },
    { id: 'mortgage', name: 'Mortgage', projected_yearly_growth: 0, color: '#ef4444', type: 'liability' as const },
    { id: 'salary', name: 'Salary', projected_yearly_growth: 0.03, color: '#eab308', type: 'cash-inflow' as const },
  ],
  persons: [
    { id: 'alice', name: 'Alice' },
    { id: 'bob', name: 'Bob' },
  ],
  assets: [
    {
      id: 'vanguard-vti',
      name: 'Vanguard VTI',
      category_id: 'stocks',
      person_id: 'alice',
      projected_yearly_growth: null,
      created_at: '2024-01-01T00:00:00Z',
    },
    {
      id: 'home-loan',
      name: 'Home Loan',
      category_id: 'mortgage',
      person_id: 'bob',
      projected_yearly_growth: null,
      created_at: '2024-01-01T00:00:00Z',
    },
  ],
}

await mkdir(tempRoot, { recursive: true })
await writeFile(DATA_FILE, stringify(seedDb, { lineWidth: 0 }), 'utf8')
await writeFile(
  DATA_POINTS_FILE,
  // header + one row for vanguard-vti so summary/projections have data
  'id,asset_id,year_month,value,notes,created_at,updated_at\n' +
    'dp-1,vanguard-vti,2024-06,1000,,2024-06-01T00:00:00Z,2024-06-01T00:00:00Z\n',
  'utf8',
)

// Now import the modules under test. Dynamic imports keep env-var ordering correct.
const { Hono } = await import('hono')
const { HTTPException } = await import('hono/http-exception')
const categoriesRouter = (await import('../routes/categories.js')).default
const assetsRouter = (await import('../routes/assets.js')).default
const personsRouter = (await import('../routes/persons.js')).default
const dataPointsRouter = (await import('../routes/dataPoints.js')).default
const summaryRouter = (await import('../routes/summary.js')).default
const projectionsRouter = (await import('../routes/projections.js')).default
const importRouter = (await import('../routes/import.js')).default

function buildApp() {
  const app = new Hono()
  app.onError((err, c) => {
    if (err instanceof HTTPException) {
      return c.json({ error: err.message }, err.status)
    }
    console.error(err)
    return c.json({ error: 'Internal server error' }, 500)
  })
  app.route('/api/v1/categories', categoriesRouter)
  app.route('/api/v1/assets', assetsRouter)
  app.route('/api/v1/persons', personsRouter)
  app.route('/api/v1/data-points', dataPointsRouter)
  app.route('/api/v1/summary', summaryRouter)
  app.route('/api/v1/projections', projectionsRouter)
  app.route('/api/v1/import', importRouter)
  return app
}

const app = buildApp()

const get = (path: string) => app.fetch(new Request(`http://test${path}`))
const json = (path: string, method: string, body: unknown) =>
  app.fetch(
    new Request(`http://test${path}`, {
      method,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
  )

after(async () => {
  await rm(tempRoot, { recursive: true, force: true })
})

// ── Categories ──────────────────────────────────────────────────────────────
describe('GET /api/v1/categories', () => {
  test('returns all seed categories', async () => {
    const res = await get('/api/v1/categories')
    assert.equal(res.status, 200)
    const body = await res.json() as Array<{ id: string }>
    assert.ok(Array.isArray(body))
    assert.ok(body.find((c) => c.id === 'stocks'))
  })
})

describe('POST /api/v1/categories', () => {
  test('rejects invalid color', async () => {
    const res = await json('/api/v1/categories', 'POST', {
      name: 'Bad', projected_yearly_growth: 0.05, color: 'not-a-color', type: 'asset',
    })
    assert.equal(res.status, 400)
    const body = await res.json() as { error: string }
    assert.match(body.error, /color/)
  })

  test('rejects positive growth on liability', async () => {
    const res = await json('/api/v1/categories', 'POST', {
      name: 'Bad Liability', projected_yearly_growth: 0.1, color: '#000000', type: 'liability',
    })
    assert.equal(res.status, 400)
  })
})

describe('DELETE /api/v1/categories/:id', () => {
  test('returns 409 needs_reassign when category has assets', async () => {
    const res = await app.fetch(new Request('http://test/api/v1/categories/stocks', { method: 'DELETE' }))
    assert.equal(res.status, 409)
    const body = await res.json() as { needs_reassign: boolean }
    assert.equal(body.needs_reassign, true)
  })

  test('returns 404 for unknown category', async () => {
    const res = await app.fetch(new Request('http://test/api/v1/categories/does-not-exist', { method: 'DELETE' }))
    assert.equal(res.status, 404)
  })
})

// ── Assets ──────────────────────────────────────────────────────────────────
describe('GET /api/v1/assets', () => {
  test('returns seed assets', async () => {
    const res = await get('/api/v1/assets')
    assert.equal(res.status, 200)
    const body = await res.json() as Array<{ id: string }>
    assert.ok(body.find((a) => a.id === 'vanguard-vti'))
  })
})

describe('POST /api/v1/assets', () => {
  test('returns 404 for unknown category_id', async () => {
    const res = await json('/api/v1/assets', 'POST', {
      name: 'Orphan', category_id: 'no-such-cat', person_id: 'alice', projected_yearly_growth: null,
    })
    assert.equal(res.status, 404)
  })

  test('rejects empty name', async () => {
    const res = await json('/api/v1/assets', 'POST', {
      name: '', category_id: 'stocks', person_id: 'alice', projected_yearly_growth: null,
    })
    assert.equal(res.status, 400)
  })
})

// ── Persons ─────────────────────────────────────────────────────────────────
describe('GET /api/v1/persons', () => {
  test('returns persons sorted by name', async () => {
    const res = await get('/api/v1/persons')
    assert.equal(res.status, 200)
    const body = await res.json() as Array<{ name: string }>
    assert.deepEqual(body.map((p) => p.name), ['Alice', 'Bob'])
  })
})

describe('PUT /api/v1/persons/:id', () => {
  test('returns 404 for unknown person', async () => {
    const res = await json('/api/v1/persons/ghost', 'PUT', { name: 'Ghost' })
    assert.equal(res.status, 404)
  })

  test('rejects id change', async () => {
    const res = await json('/api/v1/persons/alice', 'PUT', { id: 'changed', name: 'Alice' })
    assert.equal(res.status, 400)
  })
})

// ── Data points ─────────────────────────────────────────────────────────────
describe('GET /api/v1/data-points', () => {
  test('returns seed data point', async () => {
    const res = await get('/api/v1/data-points')
    assert.equal(res.status, 200)
    const body = await res.json() as Array<{ asset_id: string }>
    assert.ok(body.find((dp) => dp.asset_id === 'vanguard-vti'))
  })

  test('rejects malformed year_month filter', async () => {
    const res = await get('/api/v1/data-points?year_month=2024-6')
    assert.equal(res.status, 400)
  })
})

describe('POST /api/v1/data-points', () => {
  test('returns 404 for unknown asset', async () => {
    const res = await json('/api/v1/data-points', 'POST', {
      asset_id: 'no-asset', year_month: '2024-06', value: 100,
    })
    assert.equal(res.status, 404)
  })

  test('rejects positive value on liability asset', async () => {
    const res = await json('/api/v1/data-points', 'POST', {
      asset_id: 'home-loan', year_month: '2024-06', value: 100,
    })
    assert.equal(res.status, 400)
  })
})

// ── Summary ─────────────────────────────────────────────────────────────────
describe('GET /api/v1/summary', () => {
  test('returns aggregated series for default range', async () => {
    const res = await get('/api/v1/summary')
    assert.equal(res.status, 200)
    const body = await res.json() as { series: unknown[] }
    assert.ok(Array.isArray(body.series))
  })

  test('rejects invalid range', async () => {
    const res = await get('/api/v1/summary?range=forever')
    assert.equal(res.status, 400)
  })
})

// ── Projections ─────────────────────────────────────────────────────────────
describe('GET /api/v1/projections', () => {
  test('returns historical and projection blocks', async () => {
    const res = await get('/api/v1/projections?years=5')
    assert.equal(res.status, 200)
    const body = await res.json() as { historical: unknown; projection: unknown }
    assert.ok(body.historical)
    assert.ok(body.projection)
  })

  test('rejects out-of-range years', async () => {
    const res = await get('/api/v1/projections?years=999')
    assert.equal(res.status, 400)
  })

  test('rejects unknown scenario', async () => {
    const res = await get('/api/v1/projections?scenario=wild')
    assert.equal(res.status, 400)
  })
})

// Silences the "no tests in file" complaint if a runner imports this file standalone.
before(() => undefined)

// ── Import ──────────────────────────────────────────────────────────────────
describe('POST /api/v1/import', () => {
  async function postMultipart(path: string, filename: string, content: string, contentType: string): Promise<Response> {
    const fd = new FormData()
    fd.append('file', new Blob([content], { type: contentType }), filename)
    return app.fetch(new Request(`http://test${path}`, { method: 'POST', body: fd }))
  }

  test('rejects YAML upload with wrong extension', async () => {
    const res = await postMultipart('/api/v1/import/database', 'pwned.txt', 'categories: []\nassets: []\npersons: []\n', 'text/yaml')
    assert.equal(res.status, 400)
    const body = await res.json() as { error: string }
    assert.match(body.error, /extension/i)
  })

  test('rejects YAML missing required arrays', async () => {
    const res = await postMultipart('/api/v1/import/database', 'db.yaml', 'categories: []\n', 'text/yaml')
    assert.equal(res.status, 400)
    const body = await res.json() as { error: string }
    assert.match(body.error, /assets|persons/)
  })

  test('rejects YAML where asset references missing category', async () => {
    const yaml = `
categories: []
persons: []
assets:
  - id: x
    name: X
    category_id: ghost
    person_id: y
    projected_yearly_growth: null
    created_at: '2024-01-01T00:00:00Z'
`
    const res = await postMultipart('/api/v1/import/database', 'db.yaml', yaml, 'text/yaml')
    assert.equal(res.status, 400)
    const body = await res.json() as { error: string }
    assert.match(body.error, /missing category/)
  })

  test('returns 409 with orphan report when assets that hold data points are missing', async () => {
    // Seed db has data points for vanguard-vti. Remove that asset from upload.
    const yaml = stringify({
      categories: [{ id: 'cash', name: 'Cash', projected_yearly_growth: 0, color: '#22c55e', type: 'asset' }],
      persons: [{ id: 'alice', name: 'Alice' }],
      assets: [],
    }, { lineWidth: 0 })
    const res = await postMultipart('/api/v1/import/database', 'db.yaml', yaml, 'text/yaml')
    assert.equal(res.status, 409)
    const body = await res.json() as { needs_force: boolean; orphans: { kind: string; ids: string[] }[] }
    assert.equal(body.needs_force, true)
    assert.ok(body.orphans[0].ids.includes('vanguard-vti'))
  })

  test('rejects CSV with malformed header', async () => {
    const res = await postMultipart('/api/v1/import/datapoints', 'dp.csv', 'foo,bar\n1,2\n', 'text/csv')
    assert.equal(res.status, 400)
    const body = await res.json() as { error: string }
    assert.match(body.error, /CSV/)
  })

  test('returns 409 when CSV references unknown asset_ids', async () => {
    const csv = 'id,asset_id,year_month,value,notes,created_at,updated_at\n' +
      'dp-x,ghost-asset,2024-06,1000,,2024-06-01T00:00:00Z,2024-06-01T00:00:00Z\n'
    const res = await postMultipart('/api/v1/import/datapoints', 'dp.csv', csv, 'text/csv')
    assert.equal(res.status, 409)
    const body = await res.json() as { needs_force: boolean; orphans: { ids: string[] }[] }
    assert.equal(body.needs_force, true)
    assert.ok(body.orphans[0].ids.includes('ghost-asset'))
  })

  test('successfully imports valid CSV that matches existing assets', async () => {
    const csv = 'id,asset_id,year_month,value,notes,created_at,updated_at\n' +
      'dp-import-1,vanguard-vti,2024-07,2000,,2024-07-01T00:00:00Z,2024-07-01T00:00:00Z\n'
    const res = await postMultipart('/api/v1/import/datapoints', 'dp.csv', csv, 'text/csv')
    assert.equal(res.status, 200)
    const body = await res.json() as { ok: boolean; backup: string; counts: { data_points: number } }
    assert.equal(body.ok, true)
    assert.match(body.backup, /^backup_\d{4}-\d{2}-\d{2}_\d{2}_\d{2}_\d{2}_[a-f0-9]{8}_datapoints\.csv$/)
    assert.equal(body.counts.data_points, 1)
  })

  test('successfully imports valid YAML with force=true even when orphans present', async () => {
    const yaml = stringify({
      categories: [{ id: 'cash', name: 'Cash', projected_yearly_growth: 0, color: '#22c55e', type: 'asset' }],
      persons: [{ id: 'alice', name: 'Alice' }],
      assets: [],
    }, { lineWidth: 0 })
    const fd = new FormData()
    fd.append('file', new Blob([yaml], { type: 'text/yaml' }), 'db.yaml')
    const res = await app.fetch(new Request('http://test/api/v1/import/database?force=true', { method: 'POST', body: fd }))
    assert.equal(res.status, 200)
    const body = await res.json() as { ok: boolean; counts: { categories: number; assets: number; persons: number } }
    assert.equal(body.ok, true)
    assert.equal(body.counts.assets, 0)
  })
})
