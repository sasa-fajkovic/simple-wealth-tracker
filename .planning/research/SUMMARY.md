# Project Research Summary

**Project:** WealthTrack — Self-hosted single-household net worth tracker
**Domain:** Personal finance / wealth tracking (self-hosted, manual snapshot model)
**Researched:** 2025-07-10
**Confidence:** HIGH

## Executive Summary

WealthTrack is a self-hosted, single-household net worth tracker built around a monthly manual-snapshot model — users periodically record the value of each asset (stocks, real estate, crypto, cash), and the app aggregates, charts, and projects that history over time. Benchmarking against the closest open-source analogues (clearfolio, Ghostfolio, Maybe Finance, YAFFA, Firefly III) confirms this is a well-understood product category with a clear feature floor: total net worth summary card, historical area/line chart, asset categorisation, CRUD admin, time range selector, gap-filling (LOCF), and compound-growth projections. The differentiating angle for WealthTrack is the combined historical + projected chart with per-asset growth rate overrides — this is rare in open-source trackers and is the primary FIRE-community value prop.

The recommended implementation is a Hono v4 backend on Node.js 22 LTS, serving a pre-built React/Vite SPA from a single Docker container, with all data persisted to a YAML flat-file (`database.yaml`) on a named Docker volume. The YAML storage layer must be wrapped with `async-mutex` (in-process serialisation) and `write-file-atomic` (crash-safe rename) — without both, the first power-cycle or simultaneous form submission can silently corrupt or lose all user data. Financial amounts must be stored as integer euro-cents to avoid floating-point drift.

The two biggest risk areas are (1) data integrity around the YAML storage layer (atomic writes, concurrent request serialisation, first-run bootstrap, referential integrity on delete) and (2) correctness of the time-series calculations (LOCF boundary handling, month key timezone traps, compound rate formula). Both are fully mitigated by well-known patterns documented in the research. Scope is intentionally narrow: EUR-only, no auth, no bank integrations, no transaction tracking — each exclusion is validated against comparable apps and correct for this use case.

---

## Key Findings

### Recommended Stack

The backend is Hono `^4.12.14` + `@hono/node-server ^2.0.0` on Node.js 22 LTS (Alpine). Hono is TypeScript-first, Web-Standards-based, and requires ~60% less setup than Fastify for a 5-route API — the right fit for this scope. Input validation uses Zod `^3.24.4` with `@hono/zod-validator ^0.7.0`. The storage layer uses `yaml ^2.8.3` (comment-preserving, YAML 1.2, better than `js-yaml`), `async-mutex ^0.5.0` (in-process write serialisation), and `write-file-atomic ^7.0.1` (crash-safe temp+rename pattern). UUID generation uses Node's built-in `crypto.randomUUID()` — no npm package needed. The frontend stack (React 18 + TypeScript + Vite + Tailwind + Recharts v3.8) is already in place and requires no changes. Docker uses a 3-stage multi-stage build (`node:22-alpine` throughout) producing a ~180 MB image.

**Core technologies:**
- **Hono `^4.12.14`**: HTTP framework — TypeScript-first, zero-dep core, simpler than Fastify for ≤10 routes
- **`@hono/node-server ^2.0.0`**: Node.js adapter + `serveStatic` for the Vite build
- **`yaml ^2.8.3`**: YAML parser/serialiser — comment-preserving, better round-trip than `js-yaml`
- **`async-mutex ^0.5.0`**: In-process mutex serialising all read-modify-write cycles
- **`write-file-atomic ^7.0.1`**: Atomic temp+rename writes preventing file corruption on crash
- **`zod ^3.24.4`**: Request validation and TypeScript type inference (single source of truth for schemas)
- **`tsx ^4.21.0`**: Dev-time TypeScript runner (esbuild-powered; do NOT use `ts-node`)
- **Integer euro-cents**: All monetary values stored as integers — no `decimal.js` needed for summation
- **`node:crypto` built-in**: `randomUUID()` — no `uuid` package needed
- **`node:22-alpine`**: Docker base image — ~180 MB vs ~900 MB for `node:22`

### Expected Features

See [FEATURES.md](./FEATURES.md) for full benchmarking detail.

**Must have (table stakes):**
- **Total net worth summary card** — the primary reason users open the app
- **Month-over-month delta** (€ and %) on summary cards — ⚠️ **not explicit in current spec, must be added**
- **Historical net worth chart** (area/line) with time range selector (YTD/6M/1Y/2Y/3Y/5Y/10Y/Max)
- **Asset categorisation** (stocks, cash, real estate, crypto) with CRUD
- **Manual data entry per asset per period** (snapshot model)
- **LOCF gap-filling** — without it, chart drops to zero for any skipped month (immediately feels broken)
- **Asset composition breakdown** — implicit in stacked area chart; users ask "how is my wealth split?"
- **Responsive design** — used on tablet for data entry

**Should have (differentiators):**
- **Compound growth projections** with per-asset rate overrides and category defaults
- **Multiple projection horizons** (5Y/10Y/20Y/30Y) — 30Y is the FIRE retirement planning horizon
- **Combined historical + projected chart** — rare in OSS trackers; uniquely motivating
- **Chart type switching** (area/line/bar) persisted per slot
- **LOCF as UX feature** (not just implementation detail) — removes "missing month" friction
- **YAML flat-file storage** — human-readable backup via `cp`, zero migration headaches
- **Zero-friction Docker deployment** — single container, single volume mount

**Defer (v2+):**
- Liabilities entity (v1 workaround: users enter negative values under a "Liabilities" category — document this)
- Data export endpoint (consider a simple JSON dump for safety)
- Automatic bank/broker import (AI CSV/PDF import is better UX than connector APIs)
- Multi-currency (adds ~30% scope; EUR-only is correct for v1)
- Dark mode
- Notifications/alerts
- Authentication (trust-the-network is correct for single-household self-hosted)

### Architecture Approach

The architecture is a single Docker container running one Node.js process that serves both the REST API (`/api/v1/*`) and the pre-compiled React SPA (static files + SPA catch-all). Middleware registration order is critical: API routes must be registered before `express.static()`, which must come before the SPA catch-all — reversing this silently breaks asset loading. All data lives in a single `database.yaml` on a named Docker volume. Business logic is split across pure functions in `calc/` (LOCF, aggregation, projections — no I/O, easily testable) and thin route handlers that validate input, call storage/calc, and serialise responses. **Never store computed data (summaries, projections) back in YAML** — always recompute from raw data points on request; the dataset is small enough that this is imperceptible.

**Major components:**
1. **`models/`** — TypeScript interface definitions (Category, Asset, DataPoint, Database) — no deps; defined first
2. **`storage/`** — `readDb()` / `mutateDb()` under singleton mutex + atomic rename — wraps all file I/O
3. **`calc/summary`** — LOCF gap-fill, per-category/total aggregation, range filter — pure functions, no I/O
4. **`calc/projections`** — Compound monthly growth math `(1+r)^(1/12)-1` per asset — pure functions
5. **`routes/`** — Thin Hono route handlers: validate (Zod) → call storage/calc → respond
6. **`index.ts`** — App assembly: routes → static files → SPA catch-all, `serve()` on port 3000
7. **React `api/`** — Typed `fetch` wrappers per resource (categories, assets, dataPoints, summary, projections)
8. **React `pages/`** — Dashboard, Projections, Admin — consume `api/`, render with Recharts

### Critical Pitfalls

See [PITFALLS.md](./PITFALLS.md) for full detail, code samples, and per-phase attribution.

1. **Non-atomic YAML writes → file corruption on crash** — Use `write-file-atomic` (temp+rename). Never `fs.writeFile()` directly to `database.yaml`. *(Phase: Storage layer)*
2. **Concurrent request race on YAML file** — Wrap ALL read-modify-write cycles in a single `async-mutex` `runExclusive()`. One singleton mutex; never create per-request instances. *(Phase: Storage layer)*
3. **Month key timezone off-by-one** — Build month keys from integer parts: `toMonthKey(d.getFullYear(), d.getMonth()+1)`. Never use `.toISOString().slice(0,7)`. *(Phase: Storage + Summary calc)*
4. **LOCF off-by-one / backward carry** — Before an asset's first data point, value is `0`, not the first known value. Use `null`-seeded carry. Build month ranges with explicit integer overflow (`m > 12 → m=1, y++`), not `new Date()`. *(Phase: Summary calc)*
5. **Wrong monthly compound rate formula** — Use `(1 + annualRate)^(1/12) - 1`, not `annualRate / 12`. Simple division silently over-estimates by ~2% over 10 years at 7%. *(Phase: Projections calc)*
6. **Recharts `dataKey` with user-defined category names** — Use stable UUIDs as `dataKey`, not category names. Names containing `.` (e.g. `U.S. Stocks`) are interpreted as nested object paths → series renders as zero. *(Phase: Frontend charts)*

**Also watch for:**
- Distroless `base` image (no Node.js binary) → use `node:22-alpine` per STACK.md recommendation
- Docker volume permission mismatch (`EACCES`) → `RUN chown node:node /data && USER node` in Dockerfile
- Missing referential integrity on delete → 409 before deleting category/asset with children
- `database.yaml` missing on first run → bootstrap to `{ categories: [], assets: [], dataPoints: [] }` at startup
- Recharts `ResponsiveContainer` with zero-height parent → always set explicit pixel height or `h-[400px]` on parent
- Same `stackId` on all `<Area>` components — omitting causes overlap, not stacking

---

## Implications for Roadmap

The feature dependency chain is linear and dictates phase order:

```
Models → Storage → CRUD API → Summary calc → Dashboard → Projections → Docker
```

Nothing in the frontend can be built without the API; the API cannot be built without the storage layer; the storage layer requires the data model. Projections depend on summary aggregation being correct first. Docker is always last.

### Phase 1: Data Foundation — Models + Storage Layer
**Rationale:** Every other layer imports from `models/`. Storage is the only stateful layer — it must be solid before any feature work begins. Both critical pitfalls (atomic writes, mutex) live here.
**Delivers:** Type-safe `Database` interfaces, `readDb()` / `mutateDb()` with atomic writes and concurrent-request safety, first-run bootstrap
**Features:** Data persistence / backup (YAML volume mount)
**Avoids:** Pitfalls 1 (non-atomic writes), 2 (concurrent race), 10 (YAML timestamp coercion), 12 (missing file bootstrap)
**Research flag:** Standard patterns — no phase research needed

### Phase 2: CRUD API — Categories, Assets, Data Points
**Rationale:** The admin panel is the prerequisite for all data entry. Without it there is nothing to chart. Referential integrity must be built here, not retrofitted later.
**Delivers:** REST endpoints: `GET/POST/PUT/DELETE` for categories, assets, and data points; Zod validation; 409 on constraint violations
**Features:** CRUD admin panel, manual data entry per asset, upsert semantics (`updated_at` wins)
**Avoids:** Pitfall 9 (orphaned data on delete)
**Architecture:** `routes/` + `storage/` layers only — no calc yet
**Research flag:** Standard patterns — no phase research needed

### Phase 3: Summary Aggregation Endpoint
**Rationale:** Pure calculation layer with no I/O — easiest to unit test in isolation. Must be correct before the dashboard can display meaningful data.
**Delivers:** `GET /api/v1/summary?range=…` — LOCF gap-fill, per-category aggregation, total net worth, time range filtering, month-over-month and YTD deltas
**Features:** LOCF gap-filling, time range selector, **month-over-month delta** (⚠️ add explicitly to spec), YTD change
**Avoids:** Pitfalls 3 (timezone month keys), 4 (LOCF off-by-one / backward carry)
**Architecture:** `calc/summary.ts` pure functions — test without HTTP
**Research flag:** Standard patterns — no phase research needed

### Phase 4: Projections Calculation Endpoint
**Rationale:** Depends on summary aggregation being correct (uses same LOCF output as the projection start point). Pure math layer — test independently before wiring to frontend.
**Delivers:** `GET /api/v1/projections?horizon=…` — compound monthly growth per asset, category default fallback, combined historical+projected data array
**Features:** Compound growth projections, per-asset rate overrides, category defaults, multiple horizons (5Y/10Y/20Y/30Y)
**Avoids:** Pitfall 5 (wrong compound rate formula — use `(1+r)^(1/12)-1`, not `r/12`)
**Architecture:** `calc/projections.ts` pure functions
**Research flag:** Standard patterns — no phase research needed

### Phase 5: Dashboard Frontend
**Rationale:** By this phase the full API surface is available. Frontend can be built against real data.
**Delivers:** Dashboard page — total net worth summary cards (with MoM delta), stacked area chart + line/bar toggle, time range selector, chart type persistence
**Features:** Net worth summary card, historical chart, time range selector, chart type switching, asset composition breakdown, responsive design
**Avoids:** Pitfalls 6 (Recharts UUID `dataKey`), 11 (zero-height `ResponsiveContainer`), 13 (missing `stackId`)
**Architecture:** React `api/` wrappers + `pages/Dashboard` + Recharts components
**Research flag:** Standard patterns — Recharts docs are well-documented; no phase research needed

### Phase 6: Admin Panel Frontend
**Rationale:** Completes the user-facing CRUD surface. Kept separate from dashboard — admin is lower-polish, can be minimal.
**Delivers:** Admin pages for managing categories (with growth rate defaults), assets (with per-asset growth rate), and data points (entry form with month picker)
**Features:** CRUD admin panel, category/asset management, data entry workflow
**Avoids:** Pitfalls 3 (month key input must use integer parts, not ISO conversion)
**Research flag:** Standard patterns — no phase research needed

### Phase 7: Projections Frontend
**Rationale:** Final feature — depends on all prior phases. Combined historical+projected chart requires Phase 3 (history) and Phase 4 (projections) data to be merged into one Recharts data array with consistent `month` key shape.
**Delivers:** Projections page — combined historical + projected area chart, horizon selector (5Y/10Y/20Y/30Y), dashed/styled projected segment
**Features:** Combined historical+projected chart, projection horizon selector
**Avoids:** Pitfall 14 (mismatched data shapes at historical/projected boundary — shared `ChartPoint` type)
**Research flag:** Standard patterns — no phase research needed

### Phase 8: Docker Packaging + Deployment
**Rationale:** Always last. Multi-stage build requires both `web/dist` and `api/dist` to exist. First integration test of the full container.
**Delivers:** Production-ready Docker image (`node:22-alpine`, 3-stage), `docker-compose.yml` with named volume, `USER node` with correct `/data` permissions
**Features:** Zero-friction Docker deployment, YAML flat-file persistence
**Avoids:** Pitfall 7 (wrong distroless base — use `node:22-alpine`, not `distroless/base`), Pitfall 8 (volume permission mismatch)
**Research flag:** Standard patterns — no phase research needed

### Phase Ordering Rationale

- **Bottom-up build order** mirrors the architectural dependency graph (`models → storage → calc → routes → frontend → docker`) — each layer can be tested before the next is built
- **Calc before frontend** — pure functions are the fastest to unit test; catching LOCF and projection bugs here is much cheaper than debugging chart rendering
- **Admin before dashboard** — dashboard needs real data; building the entry form first makes integration testing natural
- **Docker last** — building Docker before the app works locally wastes iteration cycles; the Dockerfile is a packaging step, not a development environment

### Research Flags

Phases with standard, well-documented patterns (no deeper research needed at planning time):
- **All phases** fall into established categories (REST CRUD, YAML I/O, React charts, Docker multi-stage). No exotic integrations. The pitfalls research already surfaced the non-obvious traps (atomic writes, LOCF correctness, compound rate formula, Recharts `dataKey`).

If scope evolves to include:
- **AI-assisted CSV/PDF import (v2)** → needs LLM API research at that phase
- **Liabilities entity (v2)** → needs schema migration strategy research

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | **HIGH** | All versions verified against npm registry 2025-07-10; Hono, yaml, async-mutex, write-file-atomic all confirmed current. Node 22 LTS "Jod" is stable production choice. |
| Features | **HIGH** | Cross-referenced against 5 comparable OSS apps (clearfolio, Ghostfolio, Maybe Finance, YAFFA, Firefly III). Table stakes and differentiators are consistent across sources. |
| Architecture | **HIGH** | All patterns verified against official docs and runtime-tested. Mutex + atomic rename pattern is documented in both STACK.md and ARCHITECTURE.md independently (consistent). |
| Pitfalls | **HIGH** | LOCF and compound rate issues are empirically verified with numeric examples. Recharts dataKey issue is a known documented quirk. Timezone trap is reproducibly demonstrated. |

**Overall confidence: HIGH**

### Gaps to Address

1. **Summary card delta content** — The spec mentions "summary cards" but does not specify what deltas to display. Research confirms users expect: current total, MoM change (€ and %), YTD change. **Decision needed before requirements are locked:** confirm which deltas go on which cards.

2. **Liabilities in v1** — Net worth = assets − liabilities. Spec only mentions assets. **Decision needed:** adopt the "negative value convention" (users enter liabilities as negative numbers under a "Liabilities" category) and document it, or leave as a gap. Recommendation: document the convention; defer an explicit Liabilities entity to v2.

3. **Data directory path configuration** — `DATA_DIR` env var vs hardcoded `/data`. **Decision needed for docker-compose.yml:** confirm volume mount path matches `process.env.DATA_DIR` logic in storage layer.

4. **Port** — STACK.md uses `3000`, ARCHITECTURE.md uses `8080`. **Decision needed:** pick one and standardise across Dockerfile `EXPOSE`, `docker-compose.yml`, and `process.env.PORT` default.

---

## Sources

### Primary (HIGH confidence)
- `hono.dev/docs` (Context7 `/llmstxt/hono_dev_llms_txt`) — Hono routing, `@hono/node-server`, `serveStatic`
- npm registry (2025-07-10) — `hono ^4.12.14`, `@hono/node-server ^2.0.0`, `yaml ^2.8.3`, `async-mutex ^0.5.0`, `write-file-atomic ^7.0.1`, `zod ^3.24.4`, `tsx ^4.21.0`
- nodejs.org LTS schedule — Node 22.22.2 "Jod" (Active LTS), Node 24.15.0 "Krypton" (LTS)
- Context7 `/eemeli/yaml` — `parse`/`stringify` API, comment preservation behaviour
- Context7 `/dirtyhairy/async-mutex` — `runExclusive` pattern, singleton requirement
- Context7 `/recharts/recharts` v3.8.1 — `AreaChart`, `ResponsiveContainer`, `dataKey` path parsing behaviour
- Context7 `/expressjs/express` — `express.static` + SPA catch-all middleware order
- Node.js `fs.promises.rename` + POSIX `rename(2)` atomicity — runtime-verified on Node.js 20/22
- `nodejs.org/api/crypto.html` — `crypto.randomUUID()` available since Node 14.17.0

### Secondary (HIGH confidence — OSS app benchmarking)
- [clearfolio.net](https://github.com/gcaton/clearfolio.net) — near-identical use case; upsert semantics, LOCF, EUR-only validated
- [Ghostfolio](https://github.com/ghostfolio/ghostfolio) — most-starred self-hosted wealth manager; UX/feature baseline
- [Maybe Finance v0.6.0](https://github.com/maybe-finance/maybe/releases/tag/v0.6.0) — final shipped OSS personal finance feature set
- [YAFFA](https://github.com/kantorge/yaffa) — self-hosted long-term planning; manual entry as feature defence
- [Awesome-Selfhosted finance list](https://github.com/awesome-selfhosted/awesome-selfhosted) — comprehensive enumeration

---

*Research completed: 2025-07-10*
*Ready for roadmap: yes*
