---
phase: 01-data-foundation
plan: 02
type: execute
wave: 2
depends_on:
  - 01-1-PLAN.md
files_modified:
  - server/src/models/index.ts
  - server/src/models/seed.ts
autonomous: true
requirements:
  - MODEL-01
  - MODEL-02
  - MODEL-03
must_haves:
  truths:
    - "server/src/models/index.ts exports Category, Asset, DataPoint, Database"
    - "Asset.projected_yearly_growth is typed as 'number | null' (not '?:' optional)"
    - "DataPoint.year_month is typed as string with inline comment that it is always client-provided"
    - "server/src/models/seed.ts exports SEED_CATEGORIES as Category[] with exactly 4 entries"
    - "SEED_CATEGORIES IDs are: stocks, real-estate, crypto, cash (exact slugs)"
    - "cd server && npx tsc --noEmit exits 0 after adding both model files"
  artifacts:
    - path: "server/src/models/index.ts"
      provides: "TypeScript interfaces: Category, Asset, DataPoint, Database"
      exports: ["Category", "Asset", "DataPoint", "Database"]
    - path: "server/src/models/seed.ts"
      provides: "Typed seed data used by bootstrapDatabase()"
      exports: ["SEED_CATEGORIES"]
  key_links:
    - from: "server/src/models/seed.ts"
      to: "server/src/models/index.ts"
      via: "import type { Category } from './index.js'"
      pattern: "import type \\{ Category \\}"
---

<objective>
Define the four TypeScript interfaces that form the data model of the entire application, plus a typed constant for the bootstrap seed data.

Purpose: Every subsequent phase — storage, CRUD routes, aggregation, projections, frontend types — depends on these interfaces as the single source of truth for data shapes. Defining them now, separately from storage logic, avoids circular dependencies and gives downstream agents a stable contract.
Output: server/src/models/index.ts (4 pure interfaces) and server/src/models/seed.ts (typed SEED_CATEGORIES constant).
</objective>

<execution_context>
@.github/get-shit-done/workflows/execute-plan.md
@.github/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/REQUIREMENTS.md
@.planning/phases/01-data-foundation/01-CONTEXT.md
@.planning/phases/01-data-foundation/01-PATTERNS.md

<interfaces>
<!-- Requirement spec for each interface — extracted from REQUIREMENTS.md -->

MODEL-01 — Category:
  id: string          — slug, immutable after create
  name: string
  projected_yearly_growth: number   — float, e.g. 0.08 for 8%
  color: string       — hex color, e.g. '#6366f1'

MODEL-02 — Asset:
  id: string                            — slug, immutable after create
  name: string
  category_id: string
  projected_yearly_growth: number | null  — null means inherit from Category (NOT optional/?)
  location?: string                     — optional
  notes?: string                        — optional
  created_at: string                    — ISO timestamp, immutable after create

MODEL-03 — DataPoint:
  id: string          — UUID v4 via crypto.randomUUID()
  asset_id: string
  year_month: string  — YYYY-MM, ALWAYS provided by client (D-02, D-03): never compute server-side
  value: number       — float64, EUR
  notes?: string      — optional
  created_at: string
  updated_at: string

Database (container):
  categories: Category[]
  assets: Asset[]
  dataPoints: DataPoint[]

Bootstrap seed (exact values — non-negotiable):
  { id: 'stocks',       name: 'Stocks',       projected_yearly_growth: 0.08, color: '#6366f1' }
  { id: 'real-estate',  name: 'Real Estate',  projected_yearly_growth: 0.05, color: '#10b981' }
  { id: 'crypto',       name: 'Crypto',       projected_yearly_growth: 0.15, color: '#f59e0b' }
  { id: 'cash',         name: 'Cash',         projected_yearly_growth: 0.02, color: '#64748b' }
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create TypeScript data model interfaces</name>
  <files>server/src/models/index.ts</files>

  <read_first>
    - .planning/REQUIREMENTS.md — lines for MODEL-01, MODEL-02, MODEL-03 (exact field names and types)
    - .planning/phases/01-data-foundation/01-CONTEXT.md — decisions D-02 and D-03 (year_month source)
    - server/tsconfig.json — confirm "module": "NodeNext" (affects import extension rules in later files)
  </read_first>

  <action>
Create `server/src/models/index.ts` with EXACT content:

```typescript
// Pure type definitions — no imports, no runtime code.
// These interfaces are the single source of truth for all data shapes.

export interface Category {
  id: string                       // URL-safe slug, immutable after create (MODEL-01)
  name: string
  projected_yearly_growth: number  // decimal, e.g. 0.08 = 8% annual growth
  color: string                    // hex color, e.g. '#6366f1'
}

export interface Asset {
  id: string                               // URL-safe slug, immutable after create (MODEL-02)
  name: string
  category_id: string
  projected_yearly_growth: number | null   // null = inherit from parent Category; NOT optional (?)
  location?: string
  notes?: string
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
  dataPoints: DataPoint[]
}
```

CRITICAL type constraint — `Asset.projected_yearly_growth` MUST be `number | null`, NOT `number?`:
- `number | null`  means the field is present and explicitly null when inheriting from category
- `number?` would mean the field is absent entirely — wrong semantics for YAML round-trips
  </action>

  <verify>
    <automated>
      grep 'export interface Category' server/src/models/index.ts \
        && grep 'export interface Asset' server/src/models/index.ts \
        && grep 'export interface DataPoint' server/src/models/index.ts \
        && grep 'export interface Database' server/src/models/index.ts \
        && grep 'projected_yearly_growth: number | null' server/src/models/index.ts \
        && grep 'year_month: string' server/src/models/index.ts \
        && grep 'categories: Category\[\]' server/src/models/index.ts \
        && cd server && npx tsc --noEmit \
        && echo "PASS: models compile cleanly"
    </automated>
  </verify>

  <acceptance_criteria>
    - `grep 'export interface Category' server/src/models/index.ts` exits 0
    - `grep 'export interface Asset' server/src/models/index.ts` exits 0
    - `grep 'export interface DataPoint' server/src/models/index.ts` exits 0
    - `grep 'export interface Database' server/src/models/index.ts` exits 0
    - `grep 'projected_yearly_growth: number | null' server/src/models/index.ts` exits 0 — NOT `number?`
    - `grep 'year_month: string' server/src/models/index.ts` exits 0
    - `grep 'categories: Category\[\]' server/src/models/index.ts` exits 0
    - `cd server && npx tsc --noEmit` exits 0
  </acceptance_criteria>
</task>

<task type="auto">
  <name>Task 2: Create typed SEED_CATEGORIES constant</name>
  <files>server/src/models/seed.ts</files>

  <read_first>
    - server/src/models/index.ts — Category interface (just created) to use as the type annotation
  </read_first>

  <action>
Create `server/src/models/seed.ts` with EXACT content (values are non-negotiable — exact IDs, growth rates, colors):

```typescript
import type { Category } from './index.js'

// Seed data written to database.yaml on first server boot when the file doesn't exist.
// Values are fixed by product design — do not change IDs, growth rates, or colors.
export const SEED_CATEGORIES: Category[] = [
  { id: 'stocks',      name: 'Stocks',       projected_yearly_growth: 0.08, color: '#6366f1' },
  { id: 'real-estate', name: 'Real Estate',  projected_yearly_growth: 0.05, color: '#10b981' },
  { id: 'crypto',      name: 'Crypto',       projected_yearly_growth: 0.15, color: '#f59e0b' },
  { id: 'cash',        name: 'Cash',         projected_yearly_growth: 0.02, color: '#64748b' },
]
```

Notes:
- Import uses `.js` extension — required for NodeNext module resolution.
- `import type` (not `import`) — no runtime value needed, only type checking.
- The `Category[]` type annotation ensures TypeScript validates every field against MODEL-01.
- Four exact entries with exact growth rates: 0.08, 0.05, 0.15, 0.02.
  </action>

  <verify>
    <automated>
      grep "import type { Category } from './index.js'" server/src/models/seed.ts \
        && grep 'SEED_CATEGORIES: Category\[\]' server/src/models/seed.ts \
        && grep "'stocks'" server/src/models/seed.ts \
        && grep "'real-estate'" server/src/models/seed.ts \
        && grep "'crypto'" server/src/models/seed.ts \
        && grep "'cash'" server/src/models/seed.ts \
        && grep "0\.08" server/src/models/seed.ts \
        && grep "0\.15" server/src/models/seed.ts \
        && grep "'#6366f1'" server/src/models/seed.ts \
        && grep "'#f59e0b'" server/src/models/seed.ts \
        && cd server && npx tsc --noEmit \
        && echo "PASS: seed.ts valid, models + seed compile cleanly"
    </automated>
  </verify>

  <acceptance_criteria>
    - `grep "import type { Category } from './index.js'" server/src/models/seed.ts` exits 0
    - `grep 'SEED_CATEGORIES: Category\[\]' server/src/models/seed.ts` exits 0
    - All 4 category IDs present: stocks, real-estate, crypto, cash (4 separate greps exit 0)
    - Growth rates 0.08, 0.05, 0.15, 0.02 all present in file
    - `cd server && npx tsc --noEmit` exits 0 with zero errors
  </acceptance_criteria>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| models → storage | Type contracts used at YAML parse boundary — parse(raw) cast must match interface |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-01-04 | Tampering | DataPoint.year_month | mitigate | Comment in interface documents client-only source (D-02/D-03); Zod validation in Phase 2 enforces YYYY-MM regex |
| T-01-05 | Tampering | Asset.projected_yearly_growth | mitigate | Typed as `number \| null` (not optional) ensures YAML round-trip preserves explicit null vs missing field |
| T-01-06 | Information Disclosure | SEED_CATEGORIES | accept | Seed data is non-sensitive configuration; no user data or secrets |
</threat_model>

<verification>
1. `grep 'export interface Category' server/src/models/index.ts` — MODEL-01 covered
2. `grep 'projected_yearly_growth: number | null' server/src/models/index.ts` — MODEL-02 null semantics correct
3. `grep 'dataPoints: DataPoint\[\]' server/src/models/index.ts` — MODEL-03 container correct
4. `grep "SEED_CATEGORIES: Category\[\]" server/src/models/seed.ts` — typed seed constant exists
5. `cd server && npx tsc --noEmit` — both files compile without errors
</verification>

<success_criteria>
- server/src/models/index.ts exports 4 interfaces: Category, Asset, DataPoint, Database
- Asset.projected_yearly_growth is `number | null` (not optional `?:`)
- DataPoint.year_month has comment documenting client-only source per D-02/D-03
- server/src/models/seed.ts exports SEED_CATEGORIES typed as Category[] with exact 4 entries
- `npx tsc --noEmit` exits 0 after both files created
</success_criteria>

<output>
After completion, create `.planning/phases/01-data-foundation/01-2-SUMMARY.md`
</output>
