import { access, mkdir, readFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { parse, stringify } from 'yaml'
import writeFileAtomic from 'write-file-atomic'
import { DB_PATH, CSV_PATH } from './storage/index.js'
import { encodeDataPoints } from './storage/csv.js'
import { SEED_CATEGORIES } from './models/seed.js'
import type { Database, Category, DataPoint } from './models/index.js'
import { auditLog } from './audit/index.js'

// Pre-v2 shape used during migration only. The runtime YAML may still contain
// `track_only` and an inline `dataPoints` array on installations older than v2;
// these are rewritten to the canonical Database shape on first boot.
type LegacyCategory = Category & { track_only?: boolean }
type LegacyDatabase = Omit<Database, 'categories'> & {
  categories: LegacyCategory[]
  dataPoints?: DataPoint[]
}

export async function bootstrapDatabase(): Promise<void> {
  // Check if the database file already exists
  let fileExists = true
  try {
    await access(DB_PATH)
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err
    fileExists = false
  }

  if (!fileExists) {
    // First run — create the directory (e.g. /data might not exist in dev) and write seed data
    await mkdir(dirname(DB_PATH), { recursive: true })
    const initial: Database = {
      categories: SEED_CATEGORIES,
      assets: [],
      persons: [],
    }
    // writeFileAtomic: temp-file + rename — never writes directly to DB_PATH (STOR-03)
    await writeFileAtomic(DB_PATH, stringify(initial, { lineWidth: 0 }))
    console.log(`Initialized database at ${DB_PATH} with ${SEED_CATEGORIES.length} seed categories`)
    await auditLog('database.init', { path: DB_PATH, seed_categories: SEED_CATEGORIES.length })
    return
  }

  // File exists — validate it can be parsed before the server accepts any requests.
  // Decision D-01: if YAML is corrupt, crash with a clear message rather than silently
  // continuing with empty state (which would overwrite real user data on the next write).
  const raw = await readFile(DB_PATH, 'utf8')
  try {
    parse(raw)
  } catch (err) {
    console.error(
      `Error: Failed to parse database at ${DB_PATH}: ${(err as Error).message}`,
    )
    process.exit(1)
  }

  // Data points migration: move dataPoints from YAML to datapoints.csv (one-time, idempotent).
  // If YAML still has dataPoints, YAML is authoritative — overwrite CSV from YAML, then strip.
  // Recovery: if a previous boot crashed between writing CSV and stripping YAML, YAML still has
  // dataPoints, so we overwrite CSV again (safe: YAML is always the authoritative source here).
  let current = parse(raw) as LegacyDatabase
  if (current.dataPoints !== undefined) {
    const { dataPoints, ...withoutDataPoints } = current
    if (dataPoints.length > 0) {
      await mkdir(dirname(CSV_PATH), { recursive: true })
      await writeFileAtomic(CSV_PATH, encodeDataPoints(dataPoints))
      console.log(`Migrated ${dataPoints.length} data points from YAML to CSV at ${CSV_PATH}`)
      await auditLog('database.migrate', {
        data_points_migrated: dataPoints.length,
        csv_path: CSV_PATH,
      })
    }
    // Strip dataPoints from YAML regardless (even if empty array) to finalize migration
    await writeFileAtomic(DB_PATH, stringify(withoutDataPoints, { lineWidth: 0 }))
    current = withoutDataPoints
  }

  // Category type migration (M-02): backfill `type` field for old records that only have
  // `track_only`. Idempotent — skipped when all categories already have `type`.
  const needsMigration = current.categories?.some(cat => cat.type === undefined) ?? false
  if (needsMigration) {
    const migrated: Category[] = current.categories.map(cat => {
      const { track_only, ...rest } = cat
      return {
        ...rest,
        type: cat.type ?? (track_only ? 'cash-inflow' : 'asset'),
      }
    })
    const updated: Database = { ...current, categories: migrated }
    delete (updated as { dataPoints?: unknown }).dataPoints
    await writeFileAtomic(DB_PATH, stringify(updated, { lineWidth: 0 }))
    const count = current.categories.filter(cat => cat.type === undefined).length
    console.log(`Backfilled category type on ${count} old record(s) in ${DB_PATH}`)
    await auditLog('database.migrate_category_type', { backfilled: count })
  }
}
