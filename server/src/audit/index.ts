import { appendFile, mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'

export const LOGS_DIR = process.env.LOGS_DIR ?? '/data/logs'

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
