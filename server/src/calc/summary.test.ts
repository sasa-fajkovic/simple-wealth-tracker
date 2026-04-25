import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { locfFill, aggregateSummary } from './summary.js'
import type { DataPoint, Asset, Category } from '../models/index.js'

// ── Fixture helpers ──────────────────────────────────────────────────────────

function makeAsset(id: string, categoryId = 'cat1'): Asset {
  return {
    id,
    name: id,
    category_id: categoryId,
    projected_yearly_growth: null,
    created_at: '2024-01-01T00:00:00.000Z',
  }
}

function makeDP(
  assetId: string,
  yearMonth: string,
  value: number,
  updatedAt: string
): DataPoint {
  return {
    id: `dp-${assetId}-${yearMonth}`,
    asset_id: assetId,
    year_month: yearMonth,
    value,
    created_at: '2024-01-01T00:00:00.000Z',
    updated_at: updatedAt,
  }
}

// ── locfFill ─────────────────────────────────────────────────────────────────

describe('locfFill', () => {
  test('months before first data point are 0 — no backward carry', () => {
    const asset = makeAsset('a1')
    const dp = makeDP('a1', '2024-03', 1000, '2024-03-01T00:00:00.000Z')
    const months = ['2024-01', '2024-02', '2024-03', '2024-04']
    const result = locfFill(months, [dp], [asset])
    const a1 = result.get('a1')!
    assert.equal(a1.get('2024-01'), 0, 'before first dp: must be 0')
    assert.equal(a1.get('2024-02'), 0, 'before first dp: must be 0')
    assert.equal(a1.get('2024-03'), 1000, 'dp month: exact value')
    assert.equal(a1.get('2024-04'), 1000, 'after dp: carry forward')
  })

  test('upsert: latest updated_at wins for same asset+month', () => {
    const asset = makeAsset('a1')
    const early = makeDP('a1', '2024-03', 500, '2024-03-01T00:00:00.000Z')
    const late = makeDP('a1', '2024-03', 9999, '2024-03-15T00:00:00.000Z')
    const result = locfFill(['2024-03'], [early, late], [asset])
    assert.equal(result.get('a1')!.get('2024-03'), 9999, 'later updated_at must win')
  })

  test('upsert: order in array does not matter — only updated_at', () => {
    const asset = makeAsset('a1')
    const late = makeDP('a1', '2024-03', 9999, '2024-03-15T00:00:00.000Z')
    const early = makeDP('a1', '2024-03', 500, '2024-03-01T00:00:00.000Z')
    // late comes first in array — still must win
    const result = locfFill(['2024-03'], [late, early], [asset])
    assert.equal(result.get('a1')!.get('2024-03'), 9999)
  })

  test('no data points returns all zeros', () => {
    const asset = makeAsset('a1')
    const months = ['2024-01', '2024-02', '2024-03']
    const result = locfFill(months, [], [asset])
    const a1 = result.get('a1')!
    assert.equal(a1.get('2024-01'), 0)
    assert.equal(a1.get('2024-02'), 0)
    assert.equal(a1.get('2024-03'), 0)
  })

  test('multiple assets tracked independently', () => {
    const a1 = makeAsset('a1')
    const a2 = makeAsset('a2')
    const dp1 = makeDP('a1', '2024-02', 1000, '2024-02-01T00:00:00.000Z')
    const dp2 = makeDP('a2', '2024-03', 2000, '2024-03-01T00:00:00.000Z')
    const months = ['2024-01', '2024-02', '2024-03']
    const result = locfFill(months, [dp1, dp2], [a1, a2])
    assert.equal(result.get('a1')!.get('2024-01'), 0)
    assert.equal(result.get('a1')!.get('2024-02'), 1000)
    assert.equal(result.get('a1')!.get('2024-03'), 1000)  // LOCF carry
    assert.equal(result.get('a2')!.get('2024-01'), 0)
    assert.equal(result.get('a2')!.get('2024-02'), 0)
    assert.equal(result.get('a2')!.get('2024-03'), 2000)
  })
})

// ── aggregateSummary ──────────────────────────────────────────────────────────

function makeCategory(id: string, name: string, color = '#000000'): Category {
  return { id, name, projected_yearly_growth: 0.07, color }
}

describe('aggregateSummary', () => {
  const months3 = ['2024-01', '2024-02', '2024-03']

  test('divide-by-zero guard: firstTotal === 0 → period_delta_pct is 0 not NaN', () => {
    // All zero data → firstTotal === 0
    const cat = makeCategory('cat1', 'Stocks')
    const asset = makeAsset('a1', 'cat1')
    const locfData = locfFill(months3, [], [asset])
    const result = aggregateSummary([asset], [cat], locfData, months3)
    assert.equal(result.period_delta_pct, 0, 'period_delta_pct must be 0 when firstTotal === 0')
    assert.ok(!isNaN(result.period_delta_pct), 'period_delta_pct must not be NaN')
    assert.ok(isFinite(result.period_delta_pct), 'period_delta_pct must be finite')
  })

  test('divide-by-zero guard: currentTotal === 0 → all pct_of_total are 0', () => {
    const cat1 = makeCategory('cat1', 'Stocks')
    const cat2 = makeCategory('cat2', 'Bonds')
    const locfData = new Map<string, Map<string, number>>()
    const result = aggregateSummary([], [cat1, cat2], locfData, months3)
    assert.equal(result.current_total, 0)
    for (const b of result.category_breakdown) {
      assert.equal(b.pct_of_total, 0, `pct_of_total must be 0 for ${b.category_id} when currentTotal === 0`)
      assert.ok(!isNaN(b.pct_of_total), 'pct_of_total must not be NaN')
    }
  })

  test('series[] length equals categories count — all categories included even with no assets', () => {
    const cat1 = makeCategory('cat1', 'Stocks')
    const cat2 = makeCategory('cat2', 'Bonds')
    const cat3 = makeCategory('cat3', 'Real Estate')
    // Only cat1 has an asset
    const asset = makeAsset('a1', 'cat1')
    const dp = makeDP('a1', '2024-02', 5000, '2024-02-01T00:00:00.000Z')
    const locfData = locfFill(months3, [dp], [asset])
    const result = aggregateSummary([asset], [cat1, cat2, cat3], locfData, months3)
    assert.equal(result.series.length, 3, 'must have one series per category')
    const catIds = result.series.map(s => s.category_id)
    assert.ok(catIds.includes('cat1'))
    assert.ok(catIds.includes('cat2'))
    assert.ok(catIds.includes('cat3'))
  })

  test('values[] length in each series equals months[] length', () => {
    const months6 = ['2024-01', '2024-02', '2024-03', '2024-04', '2024-05', '2024-06']
    const cat = makeCategory('cat1', 'Stocks')
    const asset = makeAsset('a1', 'cat1')
    const locfData = locfFill(months6, [], [asset])
    const result = aggregateSummary([asset], [cat], locfData, months6)
    assert.equal(result.series[0].values.length, 6, 'values[] must have one entry per month')
    assert.equal(result.months.length, 6)
  })

  test('totals[] is per-month sum across all series', () => {
    const cat1 = makeCategory('cat1', 'Stocks')
    const cat2 = makeCategory('cat2', 'Bonds')
    const a1 = makeAsset('a1', 'cat1')
    const a2 = makeAsset('a2', 'cat2')
    // a1: 1000 from Jan, a2: 500 from Jan
    const dp1 = makeDP('a1', '2024-01', 1000, '2024-01-01T00:00:00.000Z')
    const dp2 = makeDP('a2', '2024-01', 500, '2024-01-01T00:00:00.000Z')
    const dp3 = makeDP('a1', '2024-02', 1200, '2024-02-01T00:00:00.000Z')
    const locfData = locfFill(months3, [dp1, dp2, dp3], [a1, a2])
    const result = aggregateSummary([a1, a2], [cat1, cat2], locfData, months3)
    // totals[0]: 1000 + 500 = 1500
    assert.equal(result.totals[0], 1500, 'Jan total must be 1500')
    // totals[1]: 1200 (a1 updated) + 500 (a2 carry) = 1700
    assert.equal(result.totals[1], 1700, 'Feb total must be 1700')
    // totals[2]: 1200 (carry) + 500 (carry) = 1700
    assert.equal(result.totals[2], 1700, 'Mar total must be 1700 (LOCF carry)')
    assert.equal(result.totals.length, 3)
  })

  test('current_total equals last element of totals[]', () => {
    const cat = makeCategory('cat1', 'Stocks')
    const asset = makeAsset('a1', 'cat1')
    const dp = makeDP('a1', '2024-03', 9999, '2024-03-01T00:00:00.000Z')
    const locfData = locfFill(months3, [dp], [asset])
    const result = aggregateSummary([asset], [cat], locfData, months3)
    assert.equal(result.current_total, result.totals[result.totals.length - 1])
    assert.equal(result.current_total, 9999)
  })

  test('period_delta_abs and period_delta_pct computed correctly', () => {
    const cat = makeCategory('cat1', 'Stocks')
    const asset = makeAsset('a1', 'cat1')
    // first month = 1000, last month = 1500
    const dp1 = makeDP('a1', '2024-01', 1000, '2024-01-01T00:00:00.000Z')
    const dp2 = makeDP('a1', '2024-03', 1500, '2024-03-01T00:00:00.000Z')
    const locfData = locfFill(months3, [dp1, dp2], [asset])
    const result = aggregateSummary([asset], [cat], locfData, months3)
    assert.equal(result.period_delta_abs, 500, 'delta_abs = 1500 - 1000')
    assert.equal(result.period_delta_pct, 50, 'delta_pct = 50% gain')
  })
})
