# Phase 7: People & Person Filter — Context

**Gathered:** 2026-04-22
**Status:** Ready for planning
**Source:** Direct user requirements

<domain>
## Phase Boundary

Phase 7 adds a lightweight "person" dimension to WealthTrack:
- A `Person` model (id/slug + name) stored in database.yaml
- Every `Asset` can optionally be assigned to a `Person`
- The Dashboard can be filtered by person (or "All" for the full household view)
- The Admin panel gets a new "People" tab for managing persons

Seed persons (named by the household): Sasa, Matea, Elliot, Oskar

This phase is intentionally minimal — Person is just an id + name. No income, no roles, no auth. Person assignment on assets is optional (unassigned = household-level asset).

**Out of scope for this phase:**
- Per-person projections filter (Projections page filter can come later)
- Income tracking per person
- Authentication tied to person identity

</domain>

<decisions>
## Implementation Decisions

### Person Model
- `Person` type: `{ id: string; name: string }` — id is URL-safe slug derived from name
- Stored in `database.yaml` under a `persons:` key (same flat-file, no new files)
- Bootstrap seeds 4 persons on first run: Sasa (id: sasa), Matea (id: matea), Elliot (id: elliot), Oskar (id: oskar)

### Asset Model Extension
- Add `person_id?: string` to the `Asset` interface — optional, nullable
- Existing assets (migrated) get `person_id: null` — backward compatible
- Server reads/writes `person_id` transparently; no migration script needed (YAML is flexible)

### Backend API
- `GET /api/v1/persons` → `Person[]` sorted by name
- `POST /api/v1/persons` → create person (name → toSlug for id); 409 if slug collision
- `PUT /api/v1/persons/:id` → update name (id/slug is immutable after create)
- `DELETE /api/v1/persons/:id` → delete; 409 if any asset has `person_id === id`

- `GET /api/v1/summary?range=X&person=slug` → filter assets by person_id before aggregation
- `GET /api/v1/summary?range=X` (no person param) → all assets (household total)
- Asset PUT/POST updated to accept `person_id?: string | null`

### Dashboard Person Filter
- Filter pills rendered below the range selector (or above the chart)
- Pills: "All" (default, selected) · "Sasa" · "Matea" · "Elliot" · "Oskar" (dynamic from API)
- Selecting a person pill appends `?person=slug` to the summary API call
- Active person stored in component state (not URL — keeps implementation simple)
- Default: "All" (no filter)

### Admin People Tab
- Fourth tab in AdminPage: "Data Points · Assets · Categories · People"
- PersonModal: name input + read-only slug preview (same toSlug pattern as other modals)
- PeopleTab table: Name, Slug, Actions (Edit/Delete)
- Delete 409: inline error "Person is in use by N asset(s)" — no ConfirmDialog (same pattern as Assets/Categories)
- Growth rate and color are NOT part of Person — it's just name + slug

### Asset Modal Extension
- Add optional "Person" dropdown to AssetModal (last field, below Notes)
- Options: blank/unassigned option + each person from the persons list
- Saving with blank person → `person_id: null` (or omit field)
- Assets table: add "Person" column showing person name (or "—" if unassigned)

### Typography & UI Rules (carried from prior phases)
- `font-semibold` and `font-normal` BANNED — only `font-medium` and `font-bold`
- Slug always readOnly in all modals
- EUR formatter at module scope
- Cancelled-fetch guard pattern everywhere

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Existing Models & Storage
- `server/src/models/index.ts` — Category, Asset, DataPoint interfaces + payload types
- `server/src/storage/index.ts` — DB_PATH, readDb(), writeDb(), Database type
- `server/src/bootstrap.ts` — seed logic pattern to mirror for persons seed

### Existing Routes (pattern to mirror)
- `server/src/routes/categories.ts` — CRUD route pattern (Zod schema, toSlug, 409 guard)
- `server/src/routes/assets.ts` — toSlug, PUT without slug change, delete 409

### Summary Aggregation (must understand before adding filter)
- `server/src/calc/summary.ts` — aggregateSummary function signature + asset filtering logic

### Frontend Patterns
- `web/src/api/client.ts` — ALL existing API functions (apiFetch, ApiError)
- `web/src/types/index.ts` — ALL existing TypeScript interfaces
- `web/src/pages/AdminPage.tsx` — four-tab shell (add People as 4th tab)
- `web/src/pages/DashboardPage.tsx` — range filter pattern to mirror for person filter pills
- `web/src/components/admin/AssetsTab.tsx` — inline 409 delete error pattern
- `web/src/components/admin/AssetModal.tsx` — toSlug pattern + optional field pattern

### Planning Context
- `.planning/phases/06-admin-panel-frontend/06-RESEARCH.md` — slug/409 patterns established
- `.planning/phases/06-admin-panel-frontend/06-01-SUMMARY.md` — modal overlay pattern
- `.planning/phases/06-admin-panel-frontend/06-02-SUMMARY.md` — inline 409 delete error pattern

</canonical_refs>

<specifics>
## Specific Requirements

### Seed Persons (exact values)
| id     | name   |
|--------|--------|
| sasa   | Sasa   |
| matea  | Matea  |
| elliot | Elliot |
| oskar  | Oskar  |

### API Contracts
- `GET /api/v1/persons` returns `Person[]` — same shape as `/categories` but without color/growth_rate
- `POST /api/v1/persons` body: `{ name: string }` → server derives id via toSlug
- `PUT /api/v1/persons/:id` body: `{ name: string }` — id immutable
- `DELETE /api/v1/persons/:id` → 409 if person has assets; 204 otherwise
- `GET /api/v1/summary?person=sasa` — passes person slug to filter; absent/empty = all assets

### Dashboard Filter Location
- Person filter pills appear BETWEEN the range selector and the chart
- Same pill style as range pills (outlined/filled toggle)
- "All" is always the first pill and is selected by default
- Person pills are fetched from `GET /api/v1/persons` (same call as needed for asset modal)

### 409 Delete Message
- Person delete: `"Person is in use by N asset(s)"`

</specifics>

<deferred>
## Deferred Ideas

- Per-person projections filter (Projections page — Phase 8 can add it)
- Person profile (avatar, role, birth year) — out of scope for v1
- Dashboard shows person's name as subtitle when filtered — nice to have
- Person color coding for chart series — out of scope

</deferred>

---

*Phase: 07-people-person-filter*
*Context gathered: 2026-04-22 via direct user requirements*
