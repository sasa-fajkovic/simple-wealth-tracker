// server/src/calc/ranges.ts
import { toMonthKey } from './utils.js'

/**
 * Subtract n months from a YYYY-MM string using integer arithmetic.
 * No new Date() — avoids DST and timezone edge cases.
 *
 * Examples:
 *   subtractMonths('2024-12', 5)  → '2024-07'  (6m range: 12-5=7)
 *   subtractMonths('2024-03', 5)  → '2023-10'  (cross-year: 3-5=-2 → +12, y--)
 *   subtractMonths('2024-12', 119) → '2015-01' (10y range: 120 inclusive months)
 */
function subtractMonths(ym: string, n: number): string {
  let [y, m] = ym.split('-').map(Number)
  m -= n
  while (m <= 0) { m += 12; y-- }
  return toMonthKey(y, m)
}

/**
 * Compute inclusive [startYM, endYM] bounds for a named time range.
 *
 * Range semantics (all INCLUSIVE — both endpoints count):
 *   6m  → 6 months total  = latestMonth - 5
 *   1y  → 12 months       = latestMonth - 11
 *   2y  → 24 months       = latestMonth - 23
 *   3y  → 36 months       = latestMonth - 35
 *   5y  → 60 months       = latestMonth - 59
 *   10y → 120 months      = latestMonth - 119
 *   ytd → Jan 1 of current calendar year → latestMonth
 *         (clamped: if currentYear-01 > latestMonth, startYM = latestMonth)
 *   max → earliestMonth → latestMonth
 *
 * SUM-01: supports all 8 range values
 */
export function getRangeBounds(
  range: string,
  latestMonth: string,
  earliestMonth: string
): { startYM: string; endYM: string } {
  const endYM = latestMonth

  switch (range) {
    case '6m':  return { startYM: subtractMonths(endYM, 5),   endYM }
    case '1y':  return { startYM: subtractMonths(endYM, 11),  endYM }
    case '2y':  return { startYM: subtractMonths(endYM, 23),  endYM }
    case '3y':  return { startYM: subtractMonths(endYM, 35),  endYM }
    case '5y':  return { startYM: subtractMonths(endYM, 59),  endYM }
    case '10y': return { startYM: subtractMonths(endYM, 119), endYM }
    case 'max': return { startYM: earliestMonth, endYM }
    case 'ytd': {
      const startYM = toMonthKey(new Date().getFullYear(), 1)
      // Clamp: if Jan of current year is beyond latestMonth, use latestMonth
      return { startYM: startYM > endYM ? endYM : startYM, endYM }
    }
    default:
      // Caller (zValidator) prevents unknown ranges — this is a safety fallback
      return { startYM: endYM, endYM }
  }
}
