import { readFile, mkdir } from 'node:fs/promises'
import { dirname } from 'node:path'
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

// ── Private helpers (always called inside dbMutex.runExclusive) ────────────────

async function _readYaml(): Promise<Database> {
  const raw = await readFile(DB_PATH, 'utf8')
  try {
    return parse(raw) as Database
  } catch (err) {
    console.error(
      `Error: Failed to parse database at ${DB_PATH}: ${(err as Error).message}`
    )
    process.exit(1)
  }
}

async function _writeYaml(db: Database): Promise<void> {
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

