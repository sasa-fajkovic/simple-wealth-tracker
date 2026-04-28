import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { getRangeBounds } from './ranges.js'

// ── Fixed test anchor: 2024-12 as latestMonth ────────────────────────────────
// Fixed ranges (6m, 1y, ...) anchor to max(latestMonth, currentMonth).
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

  test('currentMonth anchor: fixed range anchors to currentMonth when later than latestMonth', () => {
    // latestMonth = 2019-12, currentMonth = 2025-04 → 1y should end at 2025-04
    const r = getRangeBounds('1y', '2019-12', '2019-01', '2025-04')
    assert.equal(r.endYM, '2025-04')
    assert.equal(r.startYM, '2024-05')
  })

  test('currentMonth anchor: max range ends at currentMonth (extends stale data)', () => {
    const r = getRangeBounds('max', '2019-12', '2019-01', '2025-04')
    assert.equal(r.endYM, '2025-04')
    assert.equal(r.startYM, '2019-01')
  })

  test('currentMonth clamp: fixed range ignores future data points', () => {
    // latestMonth = 2028-05 (future), currentMonth = 2026-04 → 1y ends at 2026-04
    const r = getRangeBounds('1y', '2028-05', '2024-05', '2026-04')
    assert.equal(r.endYM, '2026-04')
    assert.equal(r.startYM, '2025-05')
  })

  test('currentMonth clamp: max range ignores future data points', () => {
    const r = getRangeBounds('max', '2028-05', '2024-05', '2026-04')
    assert.equal(r.endYM, '2026-04')
    assert.equal(r.startYM, '2024-05')
  })

  test('currentMonth clamp: max with all-future data collapses to single month', () => {
    const r = getRangeBounds('max', '2028-05', '2027-01', '2026-04')
    assert.equal(r.endYM, '2026-04')
    assert.equal(r.startYM, '2026-04')
  })
})
