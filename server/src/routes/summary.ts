// server/src/routes/summary.ts
import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { readDbAndDataPoints } from '../storage/index.js'
import { toMonthKey, monthRange } from '../calc/utils.js'
import { getRangeBounds } from '../calc/ranges.js'
import { locfFill, aggregateSummary } from '../calc/summary.js'

const router = new Hono()

// SUM-01: accepted range values — zod enum enforces the allowlist
const rangeValues = ['ytd', '6m', '1y', '2y', '3y', '5y', '10y', 'max'] as const
const querySchema = z.object({
  range: z.enum(rangeValues).default('1y'),
  person: z.string().optional(),
  tracking: z.string().optional(),  // 'true' = cash-inflow view (track_only categories only)
})

// Same hook pattern as dataPoints.ts — returns {"error":"..."} on validation failure (API-01)
const hook = (result: { success: boolean; error?: z.ZodError }, c: any) => {
  if (!result.success && result.error) {
    return c.json({ error: result.error.issues[0]?.message ?? 'Invalid range' }, 400 as const)
  }
}

router.get('/', zValidator('query', querySchema, hook), async (c) => {
  const { range, person, tracking } = c.req.valid('query')
  const trackingMode = tracking === 'true'
  const { db, dataPoints } = await readDbAndDataPoints()

  // Filter categories by tracking mode: wealth view excludes track_only; cash-inflow view includes only track_only
  const relevantCategories = db.categories.filter(cat => (cat.track_only === true) === trackingMode)
  const relevantCategoryIds = new Set(relevantCategories.map(cat => cat.id))

  // Filter assets by category, then optionally by person
  let filteredAssets = db.assets.filter(a => relevantCategoryIds.has(a.category_id))
  if (person) filteredAssets = filteredAssets.filter(a => a.person_id === person)

  // Compute date range from data points belonging to filtered assets only
  const filteredAssetIds = new Set(filteredAssets.map(a => a.id))
  const relevantDPs = dataPoints.filter(dp => filteredAssetIds.has(dp.asset_id))

  const now = new Date()
  const currentMonth = toMonthKey(now.getFullYear(), now.getMonth() + 1)

  const latestMonth = relevantDPs.length === 0
    ? currentMonth
    : relevantDPs.reduce((best, dp) =>
        dp.year_month > best ? dp.year_month : best,
        relevantDPs[0].year_month
      )

  const earliestMonth = relevantDPs.length === 0
    ? currentMonth
    : relevantDPs.reduce((best, dp) =>
        dp.year_month < best ? dp.year_month : best,
        relevantDPs[0].year_month
      )

  const { startYM, endYM } = getRangeBounds(range, latestMonth, earliestMonth)
  const months = monthRange(startYM, endYM)
  const locfData = locfFill(months, dataPoints, filteredAssets)

  return c.json(aggregateSummary(filteredAssets, relevantCategories, locfData, months))
})

export default router
