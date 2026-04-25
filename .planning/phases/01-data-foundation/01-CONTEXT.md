# Phase 1: Data Foundation - Context

**Gathered:** 2026-04-22
**Status:** Ready for planning

<domain>
## Phase Boundary

Establish the typed data model, crash-safe YAML storage layer, and first-run bootstrap that every subsequent phase depends on. This phase is backend-only — no frontend changes, no API routes beyond the existing health endpoint.

**In scope:**
- Remove Go scaffold (`cmd/`, `go.mod`)
- Create `server/` directory with Node.js/Hono entry point
- TypeScript interfaces: Category, Asset, DataPoint, Database
- YAML storage layer with async-mutex and atomic rename writes
- First-run bootstrap: seed 4 categories if `database.yaml` doesn't exist

**Out of scope:**
- CRUD API routes (Phase 2)
- Zod input validation (Phase 2)
- Frontend changes (Phase 5+)
- Request logging middleware

</domain>

<decisions>
## Implementation Decisions

### Corrupt YAML Recovery
- **D-01:** If `database.yaml` exists but `yaml.parse()` throws (corrupt/invalid YAML), the server **must crash with a clear error message** and exit. Do not silently continue with empty state — the next write would overwrite real data with an empty database. Since this is a wealth tracker, data safety outweighs availability. Error message should include the file path and the parse error reason.

### year_month Field Source
- **D-02:** `year_month` is **always provided by the frontend client** (user picks a month in a date picker and sends "YYYY-MM"). The server validates the format only — it never computes the current month server-side. No `TZ` env var management needed in application code; deployers configure their host timezone independently.
- **D-03:** Do NOT use `new Date().toISOString().slice(0, 7)` anywhere — this is UTC-based and shifts months for users in UTC+ timezones at midnight. `year_month` values come from the client only.

### Agent's Discretion
- TypeScript project structure for `server/` (tsconfig options, directory layout) — agent decides, but must use ESM (`"type": "module"`), NodeNext resolution, strict mode
- Whether to keep shared types in `server/src/models/` (simplest for Phase 1) or create `shared/` — agent decides based on what's easiest to implement; can be refactored in Phase 5
- Dev workflow convention (`cd server/ && npm run dev` vs root-level orchestration) — agent decides

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project Context
- `.planning/PROJECT.md` — Tech stack decisions, Node.js over Go rationale, constraints
- `.planning/REQUIREMENTS.md` — Phase 1 requirements: STOR-01–04, MODEL-01–03

### Research Findings
- `.planning/research/STACK.md` — Hono v4, Node 22 LTS, library versions, async-mutex
- `.planning/research/ARCHITECTURE.md` — Component boundaries, mutex pattern, build order
- `.planning/research/PITFALLS.md` — Critical pitfalls: atomic writes (#1), singleton mutex (#6), Distroless (#5)

### Roadmap
- `.planning/ROADMAP.md` — Phase 1 plan details (Plans 1.1–1.4) with exact dependency versions and verification criteria

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `web/tsconfig.json` — Already uses strict mode, ESM, `"noUnusedLocals": true`, `"noUnusedParameters": true` — mirror these settings in `server/tsconfig.json` for consistency

### Established Patterns
- `web/package.json` — Uses `"type": "module"` and ESM imports — `server/package.json` must also use `"type": "module"`
- Frontend already has `web/src/types/` directory (empty) — backend models can be placed in `server/src/models/` for now; Phase 5 frontend will import or mirror them

### Integration Points
- `cmd/server/main.go` and `go.mod` — MUST be deleted in Plan 1.1; these are the only Go files
- `Dockerfile` — references the Go binary (`./server`); this will be fixed in Phase 8; do NOT update Dockerfile in Phase 1

</code_context>

<specifics>
## Specific Ideas

- User confirmed: single-household, self-hosted — no multi-user, no auth, no complex ops requirements
- User confirmed: whoever deploys sets their own host timezone — app does not manage TZ
- Error message on corrupt YAML should be human-readable (not just a stack trace) — e.g. "Error: Failed to parse database.yaml at /data/database.yaml: unexpected token..."

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 01-data-foundation*
*Context gathered: 2026-04-22*
