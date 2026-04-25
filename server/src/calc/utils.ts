// server/src/calc/utils.ts

/**
 * Build a YYYY-MM month key from integer parts.
 * NEVER use toISOString() — UTC shift corrupts month keys for UTC+ users at local midnight.
 */
export function toMonthKey(year: number, month: number): string {
  return String(year).padStart(4, '0') + '-' + String(month).padStart(2, '0')
}

/**
 * Generate an inclusive ordered array of YYYY-MM keys from startYM to endYM.
 * Uses integer arithmetic — no new Date() for iteration (DST-safe).
 */
export function monthRange(startYM: string, endYM: string): string[] {
  const months: string[] = []
  let [y, m] = startYM.split('-').map(Number)
  const [ey, em] = endYM.split('-').map(Number)
  while (y < ey || (y === ey && m <= em)) {
    months.push(toMonthKey(y, m))
    m++
    if (m > 12) { m = 1; y++ }
  }
  return months
}
