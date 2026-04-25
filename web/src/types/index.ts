// web/src/types/index.ts
// Pure type definitions — no imports, no runtime code.
// Mirrors server/src/models/index.ts and server/src/calc/summary.ts exactly.

// ── Domain Models ─────────────────────────────────────────────────────────────

export interface Category {
  id: string                       // URL-safe slug, immutable after create
  name: string
  projected_yearly_growth: number  // decimal, e.g. 0.08 = 8% annual
  color: string                    // hex, e.g. '#6366f1'
  type: 'asset' | 'cash-inflow' | 'liability'
  /** @deprecated Use `type`. Present on pre-v2 records only. */
  track_only?: boolean
}

export interface Asset {
  id: string                               // URL-safe slug, immutable after create
  name: string
  category_id: string
  projected_yearly_growth: number | null   // null = inherit from parent Category (NOT optional ?)
  location?: string
  notes?: string
  person_id: string                                // required; every asset must belong to a person
  created_at: string                       // ISO 8601 timestamp, immutable
}

export interface DataPoint {
  id: string        // UUID v4
  asset_id: string
  // YYYY-MM — built from getFullYear()/getMonth(), NEVER toISOString() (UTC shift bug)
  year_month: string
  value: number     // EUR float
  notes?: string
  created_at: string
  updated_at: string
}

export interface Person {
  id: string    // URL-safe slug, e.g. 'sasa', 'matea'
  name: string  // Display name, e.g. 'Sasa', 'Matea'
}

// ── API Request Payloads ───────────────────────────────────────────────────────
// Used by the API client create/update functions.

export interface CreateCategoryPayload {
  id: string
  name: string
  projected_yearly_growth: number
  color: string
  type: 'asset' | 'cash-inflow' | 'liability'
}

export interface UpdateCategoryPayload {
  name: string
  projected_yearly_growth: number
  color: string
  type: 'asset' | 'cash-inflow' | 'liability'
}

export interface CreateAssetPayload {
  id: string
  name: string
  category_id: string
  projected_yearly_growth: number | null
  location?: string
  notes?: string
  person_id: string   // required
}

export interface UpdateAssetPayload {
  name: string
  category_id: string
  projected_yearly_growth: number | null
  location?: string
  notes?: string
  person_id: string   // required
}

export interface CreateDataPointPayload {
  asset_id: string
  year_month: string  // YYYY-MM — provide as-is from <input type="month"> value
  value: number       // must be > 0
  notes?: string
}

export interface UpdateDataPointPayload {
  asset_id: string
  year_month: string
  value: number
  notes?: string
}

export interface CreatePersonPayload {
  name: string
}

export interface UpdatePersonPayload {
  name: string
}

// ── Summary API ────────────────────────────────────────────────────────────────
// Mirrors server/src/calc/summary.ts SummaryResponse exactly.

export type RangeKey = 'ytd' | '6m' | '1y' | '2y' | '3y' | '5y' | '10y' | 'max'

export interface SummaryResponse {
  months: string[]
  series: { category_id: string; category_name: string; color: string; values: number[] }[]
  totals: number[]
  current_total: number
  period_delta_abs: number
  period_delta_pct: number
  category_breakdown: {
    category_id: string
    category_name: string
    color: string
    value: number
    pct_of_total: number
  }[]
}

// ── Projections API ────────────────────────────────────────────────────────────

export interface ProjectionsResponse {
  historical: SummaryResponse
  projection: {
    months: string[]
    series: { category_id: string; category_name: string; color: string; values: number[] }[]
    totals: number[]
  }
}
