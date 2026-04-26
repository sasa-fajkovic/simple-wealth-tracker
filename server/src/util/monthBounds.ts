import type { DataPoint } from '../models/index.js'
import { toMonthKey } from '../calc/utils.js'

/**
 * Derive the latest and earliest year_month values across a set of data points.
 * Falls back to the current calendar month (built from integer parts — never
 * toISOString().slice(0,7), which UTC-shifts at local midnight) when the input
 * is empty.
 */
export function deriveMonthBounds(dataPoints: DataPoint[]): {
  latestMonth: string
  earliestMonth: string
  currentMonth: string
} {
  const now = new Date()
  const currentMonth = toMonthKey(now.getFullYear(), now.getMonth() + 1)

  if (dataPoints.length === 0) {
    return { latestMonth: currentMonth, earliestMonth: currentMonth, currentMonth }
  }

  let latestMonth = dataPoints[0].year_month
  let earliestMonth = dataPoints[0].year_month
  for (const dp of dataPoints) {
    if (dp.year_month > latestMonth) latestMonth = dp.year_month
    if (dp.year_month < earliestMonth) earliestMonth = dp.year_month
  }
  return { latestMonth, earliestMonth, currentMonth }
}
