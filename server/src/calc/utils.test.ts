import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { toMonthKey, monthRange } from './utils.js'

describe('toMonthKey', () => {
  test('pads single-digit month', () => {
    assert.equal(toMonthKey(2024, 1), '2024-01')
  })
  test('does not truncate 2-digit month', () => {
    assert.equal(toMonthKey(2024, 12), '2024-12')
  })
  test('pads mid-year month', () => {
    assert.equal(toMonthKey(2024, 6), '2024-06')
  })
})

describe('monthRange', () => {
  test('generates range spanning year boundary', () => {
    assert.deepEqual(
      monthRange('2024-11', '2025-02'),
      ['2024-11', '2024-12', '2025-01', '2025-02']
    )
  })
  test('single month when start equals end', () => {
    assert.deepEqual(monthRange('2024-06', '2024-06'), ['2024-06'])
  })
  test('empty when start is after end', () => {
    assert.deepEqual(monthRange('2024-06', '2024-05'), [])
  })
  test('6 consecutive months within same year', () => {
    const result = monthRange('2024-07', '2024-12')
    assert.equal(result.length, 6)
    assert.equal(result[0], '2024-07')
    assert.equal(result[5], '2024-12')
  })
})
