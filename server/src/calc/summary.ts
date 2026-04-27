// server/src/calc/summary.ts
import type { DataPoint, Asset, Category } from '../models/index.js'

export type FillMode = 'stock' | 'flow'

/**
 * Fills monthly values for each asset.
 *
 * - `stock` (default): Last Observation Carried Forward. Used for wealth
 *   (assets/liabilities) where a balance persists until updated.
 * - `flow`: zero-fill. Each month equals the data point for that month
 *   (or 0 if missing). Used for income/cash-inflow where a missing
 *   month means "no income that month", not "same as last month".
 *
 * Returns Map<asset_id, Map<year_month, value>> where every month in `months`
 * has a value for every asset.
 *
 * Upsert: when multiple data points share the same asset_id + year_month,
 * the one with the lexicographically largest updated_at wins.
 *
 * SUM-02: upsert semantics (latest updated_at wins)
 * SUM-03: stock mode — LOCF forward from first entry; 0 before first entry
 */
export function locfFill(
  months: string[],
  dataPoints: DataPoint[],
  assets: Asset[],
  mode: FillMode = 'stock'
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

    if (mode === 'flow') {
      for (const month of months) {
        assetMap.set(month, monthValue.get(month) ?? 0)
      }
      result.set(asset.id, assetMap)
      continue
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
  series: {
    category_id: string
    category_name: string
    color: string
    category_type: 'asset' | 'cash-inflow' | 'liability'
    values: number[]
  }[]
  totals: number[]
  current_total: number
  gross_assets: number
  total_liabilities: number
  monthly_delta_abs: number
  period_delta_abs: number
  period_delta_pct: number
  category_breakdown: {
    category_id: string
    category_name: string
    color: string
    category_type: 'asset' | 'cash-inflow' | 'liability'
    value: number
    pct_of_total: number
  }[]
  asset_series: {
    asset_id: string
    asset_name: string
    category_id: string
    category_name: string
    color: string
    category_type: 'asset' | 'cash-inflow' | 'liability'
    person_id: string
    values: number[]
  }[]
  asset_breakdown: {
    asset_id: string
    asset_name: string
    category_id: string
    category_name: string
    color: string
    category_type: 'asset' | 'cash-inflow' | 'liability'
    person_id: string
    value: number
    pct_of_total: number
    monthly_delta_abs: number
    period_delta_abs: number
  }[]
}

/**
 * Aggregates filled monthly data into a SummaryResponse.
 *
 * Modes:
 *  - `stock` (default): wealth view. `current_total`, `gross_assets`,
 *    `total_liabilities`, and `category_breakdown.value` reflect the
 *    *latest* month — a stock balance.
 *  - `flow`: income view. The same fields reflect the *sum across the
 *    entire range* — the cumulative inflow over the period. `monthly_delta_abs`
 *    and period-delta percentages are not meaningful for flows and are zeroed.
 *
 * SUM-04: per-category series (all categories included, even if no assets)
 * SUM-05: per-month totals (sum across all categories)
 * SUM-06: stock — current_total = last element of totals[]; flow — current_total = sum of totals[]
 * SUM-07: period_delta_abs = currentTotal - firstTotal; period_delta_pct = 0 when firstTotal === 0
 * SUM-08: category_breakdown with pct_of_total = 0 when currentTotal === 0
 */
export function aggregateSummary(
  assets: Asset[],
  categories: Category[],
  locfData: Map<string, Map<string, number>>,
  months: string[],
  mode: FillMode = 'stock'
): SummaryResponse {
  const isFlow = mode === 'flow'
  const sumValues = (vals: number[]) => vals.reduce((s, v) => s + v, 0)
  const lastValue = (vals: number[]) => (vals.length > 0 ? vals[vals.length - 1] : 0)
  const aggregateValues = (vals: number[]) => (isFlow ? sumValues(vals) : lastValue(vals))

  const categoryById = new Map(categories.map(cat => [cat.id, cat]))

  // Build series: one entry per category, values[] = per-month sum of assets in that category
  const series = categories.map(cat => {
    const catAssets = assets.filter(a => a.category_id === cat.id)
    const values = months.map(month => {
      return catAssets.reduce((sum, asset) => {
        const assetMap = locfData.get(asset.id)
        return sum + (assetMap?.get(month) ?? 0)
      }, 0)
    })
    return { category_id: cat.id, category_name: cat.name, color: cat.color, category_type: cat.type, values }
  })

  const asset_series = assets.map(asset => {
    const cat = categoryById.get(asset.category_id)
    const values = months.map(month => locfData.get(asset.id)?.get(month) ?? 0)
    return {
      asset_id: asset.id,
      asset_name: asset.name,
      category_id: asset.category_id,
      category_name: cat?.name ?? asset.category_id,
      color: cat?.color ?? '#64748b',
      category_type: cat?.type ?? 'asset',
      person_id: asset.person_id,
      values,
    }
  })

  // totals[i] = sum across all category series for month i
  const totals = months.map((_, i) =>
    series.reduce((sum, s) => sum + s.values[i], 0)
  )

  const currentTotal = isFlow ? sumValues(totals) : lastValue(totals)
  const firstTotal = totals.length > 0 ? totals[0] : 0

  // Period deltas are stock-mode concepts; for flows we report 0.
  const period_delta_abs = isFlow ? 0 : currentTotal - firstTotal
  const period_delta_pct = isFlow || firstTotal === 0
    ? 0
    : (period_delta_abs / firstTotal) * 100

  // monthly_delta_abs: change from second-to-last month to last month (stock only)
  const monthly_delta_abs = isFlow
    ? 0
    : (totals.length >= 2 ? totals[totals.length - 1] - totals[totals.length - 2] : 0)

  // gross_assets: sum of asset-type category current values
  const gross_assets = series
    .filter(s => s.category_type === 'asset')
    .reduce((sum, s) => sum + aggregateValues(s.values), 0)

  // total_liabilities: sum of liability-type category current values (negative)
  const total_liabilities = series
    .filter(s => s.category_type === 'liability')
    .reduce((sum, s) => sum + aggregateValues(s.values), 0)

  const category_breakdown = categories.map(cat => {
    const s = series.find(x => x.category_id === cat.id)!
    const value = aggregateValues(s.values)
    const pct_of_total = currentTotal === 0 ? 0 : (value / currentTotal) * 100
    return { category_id: cat.id, category_name: cat.name, color: cat.color, category_type: cat.type, value, pct_of_total }
  })

  const asset_breakdown = asset_series.map(s => {
    const value = aggregateValues(s.values)
    const prev = s.values.length >= 2 ? s.values[s.values.length - 2] : lastValue(s.values)
    const first = s.values.length > 0 ? s.values[0] : 0
    const pct_of_total = currentTotal === 0 ? 0 : (value / currentTotal) * 100
    return {
      asset_id: s.asset_id,
      asset_name: s.asset_name,
      category_id: s.category_id,
      category_name: s.category_name,
      color: s.color,
      category_type: s.category_type,
      person_id: s.person_id,
      value,
      pct_of_total,
      monthly_delta_abs: isFlow ? 0 : lastValue(s.values) - prev,
      period_delta_abs: isFlow ? 0 : lastValue(s.values) - first,
    }
  })

  return {
    months,
    series,
    totals,
    current_total: currentTotal,
    gross_assets,
    total_liabilities,
    monthly_delta_abs,
    period_delta_abs,
    period_delta_pct,
    category_breakdown,
    asset_series,
    asset_breakdown,
  }
}
