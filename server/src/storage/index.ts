import { readFile, mkdir, writeFile, readdir, unlink } from 'node:fs/promises'
import { dirname, join, basename } from 'node:path'
import { createHash } from 'node:crypto'
import { parse, stringify } from 'yaml'
import writeFileAtomic from 'write-file-atomic'
import { dbMutex } from './mutex.js'
import type { Database, DataPoint } from '../models/index.js'
import { auditLog } from '../audit/index.js'
import { encodeDataPoints, decodeDataPoints } from './csv.js'

// STOR-04: configurable via DATA_FILE env var, default is /data/database.yaml
export const DB_PATH = process.env.DATA_FILE ?? '/data/database.yaml'
// CSV for data points — separate from config, survives container rebuilds alongside DB_PATH
export const CSV_PATH = process.env.DATA_POINTS_FILE ?? '/data/datapoints.csv'

// STOR-05: auto-snapshot before every mutation so unintended overwrites
// (e.g. accidental imports, bulk deletes) can be recovered from disk.
const SNAPSHOT_RETENTION = Number(process.env.SNAPSHOT_RETENTION ?? 100)
const SNAPSHOTS_ENABLED = process.env.SNAPSHOTS_ENABLED !== 'false'

async function _snapshotPriorState(filePath: string): Promise<void> {
  if (!SNAPSHOTS_ENABLED) return
  let raw: string
  try {
    raw = await readFile(filePath, 'utf8')
  } catch (err) {
    // ENOENT just means there's nothing to snapshot yet (first write)
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return
    console.error(`snapshot read failed for ${filePath}: ${(err as Error).message}`)
    return
  }
  try {
    const snapDir = join(dirname(filePath), 'snapshots')
    await mkdir(snapDir, { recursive: true })
    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
    const hash = createHash('sha256').update(raw).digest('hex').slice(0, 8)
    const file = basename(filePath)
    await writeFile(join(snapDir, `${ts}_${hash}_${file}`), raw)
    await _pruneSnapshots(snapDir, file)
  } catch (err) {
    // never block a write because snapshotting failed
    console.error(`snapshot write failed for ${filePath}: ${(err as Error).message}`)
  }
}

async function _pruneSnapshots(dir: string, suffix: string): Promise<void> {
  try {
    const entries = await readdir(dir)
    const matching = entries.filter(e => e.endsWith('_' + suffix)).sort()
    while (matching.length > SNAPSHOT_RETENTION) {
      const oldest = matching.shift()
      if (oldest) await unlink(join(dir, oldest))
    }
  } catch {
    // best-effort
  }
}

// ── Private helpers (always called inside dbMutex.runExclusive) ────────────────

async function _readYaml(): Promise<Database> {
  const raw = await readFile(DB_PATH, 'utf8')
  try {
    return parse(raw) as Database
  } catch (err) {
    // STOR-01: parse-failure at request time (post-boot) shouldn't kill the
    // server — bootstrap.ts already validates the YAML on startup, so reaching
    // this branch means the file was corrupted while we were running. Throw so
    // the request fails with a 500 and the audit log captures it; let the
    // operator decide whether to restart.
    throw new Error(`Failed to parse database at ${DB_PATH}: ${(err as Error).message}`)
  }
}

async function _writeYaml(db: Database): Promise<void> {
  await _snapshotPriorState(DB_PATH)
  await writeFileAtomic(DB_PATH, stringify(db, { lineWidth: 0 }))
}

async function _readCsv(): Promise<DataPoint[]> {
  let raw: string
  try {
    raw = await readFile(CSV_PATH, 'utf8')
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return []
    throw err
  }
  try {
    return decodeDataPoints(raw)
  } catch (err) {
    console.error(
      `Error: Failed to parse data points at ${CSV_PATH}: ${(err as Error).message}`
    )
    process.exit(1)
  }
}

async function _writeCsv(points: DataPoint[]): Promise<void> {
  await mkdir(dirname(CSV_PATH), { recursive: true })
  await _snapshotPriorState(CSV_PATH)
  await writeFileAtomic(CSV_PATH, encodeDataPoints(points))
}

// ── Public API ──────────────────────────────────────────────────────────────────

// Read YAML config under the mutex.
// If the file cannot be parsed (corrupt YAML), crash with a clear error (Decision D-01).
export async function readDb(): Promise<Database> {
  return dbMutex.runExclusive(_readYaml)
}

// Read both YAML config and CSV data points under a single mutex acquisition.
// Callers that need a consistent snapshot of both (summary, projections) should use this.
export async function readDbAndDataPoints(): Promise<{ db: Database; dataPoints: DataPoint[] }> {
  return dbMutex.runExclusive(async () => {
    const db = await _readYaml()
    const dataPoints = await _readCsv()
    return { db, dataPoints }
  })
}

// Apply a pure mutation to the YAML config under the mutex.
// fn receives the current Database, returns the updated Database.
// writeFileAtomic writes to a temp file then renames atomically (POSIX rename(2)) — STOR-03.
// runExclusive serialises all concurrent callers so reads never race with writes — STOR-02.
export async function mutateDb(
  fn: (db: Database) => Database,
  audit?: { action: string; meta?: Record<string, unknown> },
): Promise<void> {
  await dbMutex.runExclusive(async () => {
    const db = await _readYaml()
    const updated = fn(db)
    await _writeYaml(updated)
    if (audit) await auditLog(audit.action, audit.meta)
  })
}

// Read data points from CSV under the mutex.
export async function readDataPoints(): Promise<DataPoint[]> {
  return dbMutex.runExclusive(_readCsv)
}

// Apply a pure mutation to the CSV data points under the mutex.
export async function mutateDataPoints(
  fn: (points: DataPoint[]) => DataPoint[],
  audit?: { action: string; meta?: Record<string, unknown> },
): Promise<void> {
  await dbMutex.runExclusive(async () => {
    const points = await _readCsv()
    const updated = fn(points)
    await _writeCsv(updated)
    if (audit) await auditLog(audit.action, audit.meta)
  })
}

// Atomically update both YAML config and CSV data points under a single lock.
// Required for operations that change both files (e.g. asset cascade delete).
export async function mutateDbAndDataPoints(
  fn: (db: Database, points: DataPoint[]) => { db: Database; points: DataPoint[] },
  audit?: { action: string; meta?: Record<string, unknown> },
): Promise<void> {
  await dbMutex.runExclusive(async () => {
    const db = await _readYaml()
    const points = await _readCsv()
    const result = fn(db, points)
    await _writeYaml(result.db)
    await _writeCsv(result.points)
    if (audit) await auditLog(audit.action, audit.meta)
  })
}

