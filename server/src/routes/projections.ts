// server/src/routes/projections.ts
import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { readDbAndDataPoints } from '../storage/index.js'
import { toMonthKey, monthRange } from '../calc/utils.js'
import { getRangeBounds } from '../calc/ranges.js'
import { locfFill, aggregateSummary } from '../calc/summary.js'
import { buildProjection } from '../calc/projections.js'

const router = new Hono()

// PROJ-01: years param — integer, default 10, min 1, max 30
// z.coerce.number() required: query params arrive as strings ("10" not 10)
const querySchema = z.object({
  years: z.coerce.number().int().min(1).max(30).default(10)
})

// Same hook pattern as all other routes — returns {"error":"..."} on validation failure (API-01)
const hook = (result: { success: boolean; error?: z.ZodError }, c: any) => {
  if (!result.success && result.error) {
    return c.json({ error: result.error.issues[0]?.message ?? 'Invalid years' }, 400 as const)
  }
}

router.get('/', zValidator('query', querySchema, hook), async (c) => {
  const { years } = c.req.valid('query')
  const { db, dataPoints } = await readDbAndDataPoints()

  // Exclude cash-inflow-only categories from projections (same as net-worth chart)
  const wealthCategories = db.categories.filter(c => !c.track_only)
  const wealthAssetIds = new Set(
    db.assets.filter(a => wealthCategories.some(c => c.id === a.category_id)).map(a => a.id)
  )
  const wealthAssets = db.assets.filter(a => wealthAssetIds.has(a.id))
  const wealthDataPoints = dataPoints.filter(dp => wealthAssetIds.has(dp.asset_id))

  // Derive latestMonth and earliestMonth from wealth-only data points
  // toMonthKey with integer parts: NEVER toISOString().slice(0,7) — UTC shift for UTC+ users
  const now = new Date()
  const currentMonth = toMonthKey(now.getFullYear(), now.getMonth() + 1)

  const latestMonth = wealthDataPoints.length === 0
    ? currentMonth
    : wealthDataPoints.reduce((best, dp) =>
        dp.year_month > best ? dp.year_month : best,
        wealthDataPoints[0].year_month
      )

  const earliestMonth = wealthDataPoints.length === 0
    ? currentMonth
    : wealthDataPoints.reduce((best, dp) =>
        dp.year_month < best ? dp.year_month : best,
        wealthDataPoints[0].year_month
      )

  // Historical portion: max range (all data) using aggregateSummary
  // DO NOT reimplement LOCF or aggregation — reuse the tested functions from summary.ts
  const { startYM, endYM } = getRangeBounds('max', latestMonth, earliestMonth)
  const histMonths = monthRange(startYM, endYM)
  const locfData = locfFill(histMonths, wealthDataPoints, wealthAssets)
  const historical = aggregateSummary(wealthAssets, wealthCategories, locfData, histMonths)

  // Projection portion: buildProjection derives its own latestMonth from dataPoints
  // — same dataPoints array → boundary is guaranteed consistent (no overlap)
  // No try/catch: errors propagate to app.onError in index.ts
  const projection = buildProjection(wealthAssets, wealthCategories, wealthDataPoints, years)

  // PROJ-05: combined response with both keys
  return c.json({ historical, projection })
})

export default router
