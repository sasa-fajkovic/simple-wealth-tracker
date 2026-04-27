// server/src/routes/summary.ts
import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { readDbAndDataPoints } from '../storage/index.js'
import { monthRange } from '../calc/utils.js'
import { getRangeBounds } from '../calc/ranges.js'
import { locfFill, aggregateSummary } from '../calc/summary.js'
import { deriveMonthBounds } from '../util/monthBounds.js'
import { zodErrorHook as hook } from '../util/zodHook.js'

const router = new Hono()

// SUM-01: accepted range values — zod enum enforces the allowlist
const rangeValues = ['ytd', '6m', '1y', '2y', '3y', '5y', '10y', 'max'] as const
const querySchema = z.object({
  range: z.enum(rangeValues).default('1y'),
  person: z.string().optional(),
  tracking: z.string().optional(),  // 'true' = cash-inflow view (cash-inflow categories only)
})

router.get('/', zValidator('query', querySchema, hook), async (c) => {
  const { range, person, tracking } = c.req.valid('query')
  const trackingMode = tracking === 'true'
  const { db, dataPoints } = await readDbAndDataPoints()

  // Filter categories by tracking mode: wealth view shows asset+liability; cash-inflow view shows only cash-inflow
  const relevantCategories = db.categories.filter(cat =>
    trackingMode ? cat.type === 'cash-inflow' : cat.type !== 'cash-inflow',
  )
  const relevantCategoryIds = new Set(relevantCategories.map(cat => cat.id))

  // Filter assets by category, then optionally by person
  let filteredAssets = db.assets.filter(a => relevantCategoryIds.has(a.category_id))
  if (person) filteredAssets = filteredAssets.filter(a => a.person_id === person)

  // Compute date range from data points belonging to filtered assets only
  const filteredAssetIds = new Set(filteredAssets.map(a => a.id))
  const relevantDPs = dataPoints.filter(dp => filteredAssetIds.has(dp.asset_id))

  const { latestMonth, earliestMonth, currentMonth } = deriveMonthBounds(relevantDPs)

  const { startYM, endYM } = getRangeBounds(range, latestMonth, earliestMonth, currentMonth)
  const months = monthRange(startYM, endYM)
  const fillMode = trackingMode ? 'flow' : 'stock'
  const locfData = locfFill(months, dataPoints, filteredAssets, fillMode)

  return c.json(aggregateSummary(filteredAssets, relevantCategories, locfData, months, fillMode))
})

export default router
