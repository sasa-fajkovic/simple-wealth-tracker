// server/src/calc/summary.ts
import type { DataPoint, Asset, Category } from '../models/index.js'

/**
 * Last Observation Carried Forward (LOCF) gap-fill.
 *
 * Returns Map<asset_id, Map<year_month, value>> where every month in `months`
 * has a value for every asset:
 *   - 0 if the asset has no data points at all
 *   - 0 for months before the asset's first known data point
 *   - the asset's last known value carried forward for months at/after first entry
 *
 * Correctly handles ranges that start AFTER earlier data points by initialising
 * the carry to the latest data-point value at-or-before months[0].
 *
 * Upsert: when multiple data points share the same asset_id + year_month,
 * the one with the lexicographically largest updated_at wins (ISO 8601 strings
 * compare correctly without parsing).
 *
 * SUM-02: upsert semantics (latest updated_at wins)
 * SUM-03: LOCF forward from first entry; 0 before first entry
 */
export function locfFill(
  months: string[],
  dataPoints: DataPoint[],
  assets: Asset[]
): Map<string, Map<string, number>> {
  const result = new Map<string, Map<string, number>>()

  for (const asset of assets) {
    const assetDPs = dataPoints.filter(dp => dp.asset_id === asset.id)
    const assetMap = new Map<string, number>()

    if (assetDPs.length === 0) {
      for (const month of months) assetMap.set(month, 0)
      result.set(asset.id, assetMap)
      continue
    }

    // Build canonical value per month (upsert: latest updated_at wins)
    const monthValue = new Map<string, number>()
    const grouped = new Map<string, DataPoint[]>()
    for (const dp of assetDPs) {
      if (!grouped.has(dp.year_month)) grouped.set(dp.year_month, [])
      grouped.get(dp.year_month)!.push(dp)
    }
    for (const [month, dps] of grouped) {
      const best = dps.reduce((a, b) => (a.updated_at > b.updated_at ? a : b))
      monthValue.set(month, best.value)
    }

    // First known data month — months before this are shown as 0
    const firstDataMonth = [...monthValue.keys()].sort()[0]

    // Initialise carry to the latest data-point at-or-before the range start,
    // so ranges beginning after historical entries still LOCF correctly.
    const sortedDataMonths = [...monthValue.keys()].sort()
    const latestBeforeStart = sortedDataMonths.filter(m => m <= months[0]).pop()
    let carry = latestBeforeStart !== undefined ? monthValue.get(latestBeforeStart)! : 0

    for (const month of months) {
      if (month < firstDataMonth) {
        assetMap.set(month, 0)              // no data yet
      } else {
        if (monthValue.has(month)) carry = monthValue.get(month)!
        assetMap.set(month, carry)          // LOCF forward
      }
    }

    result.set(asset.id, assetMap)
  }

  return result
}

// ── SummaryResponse ───────────────────────────────────────────────────────────

export interface SummaryResponse {
  months: string[]
  series: { category_id: string; category_name: string; color: string; values: number[] }[]
  totals: number[]
  current_total: number
  period_delta_abs: number
  period_delta_pct: number
  category_breakdown: { category_id: string; category_name: string; color: string; value: number; pct_of_total: number }[]
}

/**
 * Aggregates LOCF-filled asset data into a SummaryResponse.
 *
 * SUM-04: per-category series (all categories included, even if no assets)
 * SUM-05: per-month totals (sum across all categories)
 * SUM-06: current_total = last element of totals[]
 * SUM-07: period_delta_abs = currentTotal - firstTotal; period_delta_pct = 0 when firstTotal === 0
 * SUM-08: category_breakdown with pct_of_total = 0 when currentTotal === 0
 */
export function aggregateSummary(
  assets: Asset[],
  categories: Category[],
  locfData: Map<string, Map<string, number>>,
  months: string[]
): SummaryResponse {
  // Build series: one entry per category, values[] = per-month sum of assets in that category
  const series = categories.map(cat => {
    const catAssets = assets.filter(a => a.category_id === cat.id)
    const values = months.map(month => {
      return catAssets.reduce((sum, asset) => {
        const assetMap = locfData.get(asset.id)
        return sum + (assetMap?.get(month) ?? 0)
      }, 0)
    })
    return { category_id: cat.id, category_name: cat.name, color: cat.color, values }
  })

  // totals[i] = sum across all category series for month i
  const totals = months.map((_, i) =>
    series.reduce((sum, s) => sum + s.values[i], 0)
  )

  const currentTotal = totals.length > 0 ? totals[totals.length - 1] : 0
  const firstTotal   = totals.length > 0 ? totals[0] : 0

  const period_delta_abs = currentTotal - firstTotal
  const period_delta_pct = firstTotal === 0 ? 0 : (period_delta_abs / firstTotal) * 100

  const category_breakdown = categories.map(cat => {
    const s = series.find(x => x.category_id === cat.id)!
    const value = s.values.length > 0 ? s.values[s.values.length - 1] : 0
    const pct_of_total = currentTotal === 0 ? 0 : (value / currentTotal) * 100
    return { category_id: cat.id, category_name: cat.name, color: cat.color, value, pct_of_total }
  })

  return {
    months,
    series,
    totals,
    current_total: currentTotal,
    period_delta_abs,
    period_delta_pct,
    category_breakdown,
  }
}
