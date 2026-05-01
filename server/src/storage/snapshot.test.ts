// Auto-snapshot behaviour: each YAML/CSV mutation copies the prior file
// state to <dir>/snapshots/<TS>_<hash>_<basename> before atomic-writing the
// new version. Storage captures DATA_FILE / DATA_POINTS_FILE at module init,
// so set them before importing.

import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm, readFile, writeFile, readdir, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { stringify } from 'yaml'

const tempRoot = await mkdtemp(join(tmpdir(), 'wt-snap-'))
const DATA_FILE = join(tempRoot, 'database.yaml')
const DATA_POINTS_FILE = join(tempRoot, 'datapoints.csv')

process.env.DATA_FILE = DATA_FILE
process.env.DATA_POINTS_FILE = DATA_POINTS_FILE
process.env.LOGS_DIR = join(tempRoot, 'logs')
process.env.SNAPSHOT_RETENTION = '3' // small cap to test pruning

const seedDb = {
  categories: [
    { id: 'c1', name: 'Cat', projected_yearly_growth: 0, color: '#000', type: 'asset' as const },
  ],
  persons: [{ id: 'p1', name: 'Alice' }],
  assets: [
    {
      id: 'a1',
      name: 'A1',
      category_id: 'c1',
      person_id: 'p1',
      projected_yearly_growth: null,
      created_at: '2024-01-01T00:00:00Z',
    },
  ],
}

await mkdir(tempRoot, { recursive: true })
await writeFile(DATA_FILE, stringify(seedDb, { lineWidth: 0 }), 'utf8')
await writeFile(
  DATA_POINTS_FILE,
  'id,asset_id,year_month,value,notes,created_at,updated_at\n' +
    'dp-1,a1,2024-06,100,,2024-06-01T00:00:00Z,2024-06-01T00:00:00Z\n',
  'utf8',
)

const { mutateDb, mutateDataPoints } = await import('./index.js')

const SNAP_DIR = join(tempRoot, 'snapshots')

after(async () => {
  await rm(tempRoot, { recursive: true, force: true })
})

test('mutateDb snapshots the prior YAML before overwriting', async () => {
  const before = await readFile(DATA_FILE, 'utf8')

  await mutateDb(db => ({ ...db, persons: [...db.persons, { id: 'p2', name: 'Bob' }] }))

  const entries = (await readdir(SNAP_DIR)).filter(e => e.endsWith('_database.yaml'))
  assert.equal(entries.length, 1, 'exactly one yaml snapshot expected')
  const snapBytes = await readFile(join(SNAP_DIR, entries[0]), 'utf8')
  assert.equal(snapBytes, before, 'snapshot must capture the file state from BEFORE the write')

  const live = await readFile(DATA_FILE, 'utf8')
  assert.notEqual(live, before, 'live yaml should have been updated')
})

test('mutateDataPoints snapshots the prior CSV before overwriting', async () => {
  const before = await readFile(DATA_POINTS_FILE, 'utf8')

  await mutateDataPoints(points => [
    ...points,
    {
      id: 'dp-2',
      asset_id: 'a1',
      year_month: '2024-07',
      value: 200,
      created_at: '2024-07-01T00:00:00Z',
      updated_at: '2024-07-01T00:00:00Z',
    },
  ])

  const entries = (await readdir(SNAP_DIR)).filter(e => e.endsWith('_datapoints.csv'))
  assert.equal(entries.length, 1, 'exactly one csv snapshot expected')
  const snapBytes = await readFile(join(SNAP_DIR, entries[0]), 'utf8')
  assert.equal(snapBytes, before)
})

test('snapshot retention prunes oldest copies beyond SNAPSHOT_RETENTION', async () => {
  // We've already produced 1 yaml snapshot. Add 4 more mutations → 5 total → cap=3 keeps newest 3.
  for (let i = 0; i < 4; i++) {
    await mutateDb(db => ({ ...db, persons: [...db.persons.filter(p => p.id !== 'tmp'), { id: 'tmp', name: `T${i}` }] }))
    // ensure each snapshot lands in a distinct second so timestamp ordering is deterministic
    await new Promise(r => setTimeout(r, 1100))
  }
  const entries = (await readdir(SNAP_DIR)).filter(e => e.endsWith('_database.yaml')).sort()
  assert.equal(entries.length, 3, 'only newest SNAPSHOT_RETENTION (3) should remain')
})
