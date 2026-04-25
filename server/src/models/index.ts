// Pure type definitions — no imports, no runtime code.
// These interfaces are the single source of truth for all data shapes.

export interface Category {
  id: string                       // URL-safe slug, immutable after create (MODEL-01)
  name: string
  projected_yearly_growth: number  // decimal, e.g. 0.08 = 8% annual growth
  color: string                    // hex color, e.g. '#6366f1'
  track_only?: boolean             // if true, excluded from net-worth chart; shown in Cash Inflow page
}

export interface Person {
  id: string    // URL-safe slug, immutable after create
  name: string
}

export interface Asset {
  id: string                               // URL-safe slug, immutable after create (MODEL-02)
  name: string
  category_id: string
  projected_yearly_growth: number | null   // null = inherit from parent Category; NOT optional (?)
  location?: string
  notes?: string
  person_id?: string | null               // optional; null/undefined = household-level asset
  created_at: string                       // ISO 8601 timestamp, immutable after create
}

export interface DataPoint {
  id: string        // UUID v4 via crypto.randomUUID() (MODEL-03)
  asset_id: string
  // YYYY-MM — ALWAYS provided by the frontend client (decisions D-02, D-03).
  // NEVER compute this server-side with toISOString() — UTC shift corrupts month keys for UTC+ users.
  year_month: string
  value: number     // EUR amount as float64
  notes?: string
  created_at: string
  updated_at: string
}

export interface Database {
  categories: Category[]
  assets: Asset[]
  persons: Person[]
  // deprecated: populated only in pre-migration databases.
  // On first boot, bootstrap migrates these to datapoints.csv and strips this field.
  dataPoints?: DataPoint[]
}
