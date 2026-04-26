import { appendFile, mkdir, readdir, unlink } from 'node:fs/promises'
import { resolve } from 'node:path'

export const LOGS_DIR = process.env.LOGS_DIR ?? '/data/logs'

// Retain N most recent monthly log files. Older ones are pruned at boot
// to keep self-hosted installs from accumulating logs forever.
// Override with AUDIT_LOG_RETENTION_MONTHS=N or set to 0 to disable pruning.
const RETENTION_MONTHS = (() => {
  const raw = process.env.AUDIT_LOG_RETENTION_MONTHS
  if (raw === undefined || raw === '') return 24
  const n = Number.parseInt(raw, 10)
  return Number.isFinite(n) && n >= 0 ? n : 24
})()

function currentLogFile(): string {
  const now = new Date()
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  return resolve(LOGS_DIR, `${y}-${m}.log`)
}

// Appends a single JSON-line audit entry to the current month's log file.
// Errors are non-fatal — a failed log write must never crash the server or fail a request.
export async function auditLog(action: string, meta?: Record<string, unknown>): Promise<void> {
  const entry = JSON.stringify({ ts: new Date().toISOString(), action, ...meta }) + '\n'
  try {
    await mkdir(LOGS_DIR, { recursive: true })
    await appendFile(currentLogFile(), entry, 'utf8')
  } catch (err) {
    console.error(`[audit] Failed to write log entry: ${(err as Error).message}`)
  }
}

/**
 * Prune older monthly log files keeping the N most recent (by filename, which
 * is YYYY-MM.log so lexicographic = chronological). Best-effort: any error
 * is logged and swallowed. Call once at boot.
 */
export async function pruneAuditLogs(): Promise<void> {
  if (RETENTION_MONTHS === 0) return
  try {
    const entries = await readdir(LOGS_DIR)
    const monthly = entries
      .filter(name => /^\d{4}-\d{2}\.log$/.test(name))
      .sort() // lexicographic == chronological for YYYY-MM
    const stale = monthly.slice(0, Math.max(0, monthly.length - RETENTION_MONTHS))
    for (const name of stale) {
      await unlink(resolve(LOGS_DIR, name))
    }
    if (stale.length > 0) {
      console.log(`[audit] Pruned ${stale.length} log file(s) older than ${RETENTION_MONTHS} months`)
    }
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return // logs dir doesn't exist yet
    console.error(`[audit] Prune failed: ${(err as Error).message}`)
  }
}
