import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { getRangeBounds } from './ranges.js'

// ── Fixed test anchor: 2024-12 as latestMonth ────────────────────────────────
// All time-based ranges (6m, 1y, ...) use latestMonth as anchor, not current date.
// earliestMonth is only used by 'max' range.

describe('getRangeBounds', () => {
  test('6m: 6 inclusive months ending at latestMonth', () => {
    const r = getRangeBounds('6m', '2024-12', '2020-01')
    assert.equal(r.startYM, '2024-07')
    assert.equal(r.endYM, '2024-12')
  })

  test('1y: 12 inclusive months', () => {
    const r = getRangeBounds('1y', '2024-12', '2020-01')
    assert.equal(r.startYM, '2024-01')
    assert.equal(r.endYM, '2024-12')
  })

  test('2y: 24 months spanning year boundary', () => {
    const r = getRangeBounds('2y', '2024-12', '2020-01')
    assert.equal(r.startYM, '2023-01')
    assert.equal(r.endYM, '2024-12')
  })

  test('3y: 36 months', () => {
    const r = getRangeBounds('3y', '2024-12', '2020-01')
    assert.equal(r.startYM, '2022-01')
    assert.equal(r.endYM, '2024-12')
  })

  test('5y: 60 months', () => {
    const r = getRangeBounds('5y', '2024-12', '2020-01')
    assert.equal(r.startYM, '2020-01')
    assert.equal(r.endYM, '2024-12')
  })

  test('10y: 120 months (cross-decade)', () => {
    const r = getRangeBounds('10y', '2024-12', '2010-01')
    assert.equal(r.startYM, '2015-01')
    assert.equal(r.endYM, '2024-12')
  })

  test('max: earliestMonth to latestMonth', () => {
    const r = getRangeBounds('max', '2024-12', '2021-03')
    assert.equal(r.startYM, '2021-03')
    assert.equal(r.endYM, '2024-12')
  })

  test('max: no data — single month (latestMonth === earliestMonth)', () => {
    const r = getRangeBounds('max', '2024-12', '2024-12')
    assert.equal(r.startYM, '2024-12')
    assert.equal(r.endYM, '2024-12')
  })

  test('ytd: starts Jan 1 of current year, ends at latestMonth', () => {
    const currentYear = new Date().getFullYear()
    const latestMonth = `${currentYear}-12`
    const earliestMonth = `${currentYear}-01`
    const r = getRangeBounds('ytd', latestMonth, earliestMonth)
    assert.equal(r.startYM, `${currentYear}-01`)
    assert.equal(r.endYM, latestMonth)
  })

  test('ytd: clamps startYM to endYM if current year Jan is in the future', () => {
    // Simulate latestMonth being in the prior year (e.g., data ends 2023-06)
    const r = getRangeBounds('ytd', '2023-06', '2023-01')
    assert.ok(r.startYM <= r.endYM, `startYM (${r.startYM}) must not exceed endYM (${r.endYM})`)
  })

  test('subtractMonths cross-year: 6m from 2024-03 gives 2023-10', () => {
    // subtractMonths('2024-03', 5): m=3-5=-2 → -2+12=10, y=2023 → '2023-10'
    const r = getRangeBounds('6m', '2024-03', '2020-01')
    assert.equal(r.startYM, '2023-10')
    assert.equal(r.endYM, '2024-03')
  })
})
