// server/src/routes/projections.ts
import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { readDbAndDataPoints } from '../storage/index.js'
import { monthRange } from '../calc/utils.js'
import { getRangeBounds } from '../calc/ranges.js'
import { locfFill, aggregateSummary } from '../calc/summary.js'
import { buildProjection } from '../calc/projections.js'
import { deriveMonthBounds } from '../util/monthBounds.js'
import { zodErrorHook as hook } from '../util/zodHook.js'

const router = new Hono()

// PROJ-01: years param — integer, default 10, min 1, max 30
// z.coerce.number() required: query params arrive as strings ("10" not 10)
// scenario — conservative/base/aggressive adjusts growth rate multiplier (PROJ-SC)
const querySchema = z.object({
  years: z.coerce.number().int().min(1).max(30).default(10),
  // Scenario multipliers: conservative=0.5×, base=1.0× (default), aggressive=1.5×
  scenario: z.enum(['conservative', 'base', 'aggressive']).default('base'),
})

router.get('/', zValidator('query', querySchema, hook), async (c) => {
  const { years, scenario } = c.req.valid('query')
  // PROJ-SC: scenario → rate multiplier. base preserves existing behaviour exactly.
  const rateMultiplier = scenario === 'conservative' ? 0.5 : scenario === 'aggressive' ? 1.5 : 1.0
  const { db, dataPoints } = await readDbAndDataPoints()

  // Exclude cash-inflow-only categories from projections (same as net-worth chart)
  const wealthCategories = db.categories.filter(c => c.type !== 'cash-inflow')
  const wealthAssetIds = new Set(
    db.assets.filter(a => wealthCategories.some(c => c.id === a.category_id)).map(a => a.id),
  )
  const wealthAssets = db.assets.filter(a => wealthAssetIds.has(a.id))
  const wealthDataPoints = dataPoints.filter(dp => wealthAssetIds.has(dp.asset_id))

  const { latestMonth, earliestMonth } = deriveMonthBounds(wealthDataPoints)

  // Historical portion: max range (all data) using aggregateSummary
  // DO NOT reimplement LOCF or aggregation — reuse the tested functions from summary.ts
  const { startYM, endYM } = getRangeBounds('max', latestMonth, earliestMonth)
  const histMonths = monthRange(startYM, endYM)
  const locfData = locfFill(histMonths, wealthDataPoints, wealthAssets)
  const historical = aggregateSummary(wealthAssets, wealthCategories, locfData, histMonths)

  // Projection portion: buildProjection derives its own latestMonth from dataPoints
  // — same dataPoints array → boundary is guaranteed consistent (no overlap)
  // No try/catch: errors propagate to app.onError in index.ts
  const projection = buildProjection(wealthAssets, wealthCategories, wealthDataPoints, years, rateMultiplier)

  // PROJ-05: combined response with both keys
  return c.json({ historical, projection })
})

export default router
