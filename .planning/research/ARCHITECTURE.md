# Architecture Patterns

**Domain:** Self-hosted Node.js + React wealth tracker
**Researched:** 2025-01-26
**Confidence:** HIGH (all patterns verified against official docs + tested in Node.js runtime)

---

## Recommended Architecture

```
┌─────────────────────────────────────────────────────────┐
│                   Docker Container                       │
│                                                         │
│  ┌───────────────────────────────────────────────────┐  │
│  │              Express Server (server/)             │  │
│  │                                                   │  │
│  │  ┌──────────┐   ┌──────────┐   ┌──────────────┐  │  │
│  │  │  Routes  │──▶│ Handlers │──▶│   Storage    │  │  │
│  │  │ /api/v1/ │   │ (thin)   │   │ (YAML+Mutex) │  │  │
│  │  └──────────┘   └────┬─────┘   └──────┬───────┘  │  │
│  │                      │                │           │  │
│  │                      ▼                ▼           │  │
│  │                 ┌─────────┐    ┌────────────┐     │  │
│  │                 │  Calc   │    │  database  │     │  │
│  │                 │(summary │    │  .yaml     │     │  │
│  │                 │  proj.) │    │ (on /data) │     │  │
│  │                 └─────────┘    └────────────┘     │  │
│  │                                                   │  │
│  │  ┌─────────────────────────────────────────────┐  │  │
│  │  │  express.static(dist/)  ← compiled React    │  │  │
│  │  │  catch-all: GET *  →  index.html            │  │  │
│  │  └─────────────────────────────────────────────┘  │  │
│  └───────────────────────────────────────────────────┘  │
│                                                         │
│  /data/ volume ─── database.yaml                        │
└─────────────────────────────────────────────────────────┘
```

---

## Directory Layout

```
/
├── server/                   # Node.js backend (replaces cmd/server/)
│   ├── package.json          # "type": "module", ts-node/tsx for dev
│   ├── tsconfig.json         # ESM, strict, NodeNext resolution
│   └── src/
│       ├── index.ts          # Express wiring, start server
│       ├── models/
│       │   └── index.ts      # TypeScript interfaces (shared source of truth)
│       ├── storage/
│       │   ├── mutex.ts      # Singleton Mutex instance (async-mutex)
│       │   └── index.ts      # readDb(), writeDb() — YAML I/O under mutex
│       ├── calc/
│       │   ├── summary.ts    # LOCF gap-fill + aggregation logic
│       │   └── projections.ts# Compound monthly growth math
│       ├── routes/
│       │   ├── categories.ts # express.Router() for /api/v1/categories
│       │   ├── assets.ts     # express.Router() for /api/v1/assets
│       │   ├── dataPoints.ts # express.Router() for /api/v1/data-points
│       │   └── summary.ts    # express.Router() for /api/v1/summary + projections
│       └── handlers/         # Optional: extracted handler fns for testability
│
├── web/                      # React frontend (existing Vite scaffold)
│   ├── package.json
│   └── src/
│       ├── types/            # Mirror server models as shared TS interfaces
│       ├── api/              # Typed fetch wrappers per resource
│       ├── pages/            # Dashboard, Projections, Admin
│       └── components/       # Charts, cards, forms
│
├── Dockerfile                # Multi-stage: web → server → slim runtime
├── docker-compose.yml
└── data/                     # Dev-only: gitignored local database.yaml
```

---

## Component Boundaries

| Component | Responsibility | Reads From | Writes To |
|-----------|---------------|------------|-----------|
| `models/` | TypeScript interface definitions for Category, Asset, DataPoint, Database | — | — |
| `storage/` | YAML file read/write under in-process mutex; atomic rename pattern | `database.yaml` via `/data` volume | `database.yaml` (via temp+rename) |
| `calc/summary` | LOCF gap-filling, per-category/total aggregation, date range filtering | `models/` types (in-memory) | — (pure functions) |
| `calc/projections` | Compound monthly growth: `(1+r)^(1/12)-1` per asset; category default fallback | `models/` types (in-memory) | — (pure functions) |
| `routes/` | Express.Router modules; mount at `/api/v1/*`; validate input | `handlers/` or directly `storage/` + `calc/` | HTTP responses |
| `index.ts` | Express app assembly; middleware order; SPA catch-all | `routes/`, `dist/` | — |
| React `api/` | Typed `fetch` wrappers mirroring server routes | HTTP `/api/v1/*` | HTTP (POST/PUT/DELETE) |
| React `pages/` | Route components: Dashboard, Projections, Admin | `api/` | — |

---

## Data Flow

### Read Flow (GET /api/v1/summary?range=12m)
```
HTTP GET
  → Express routes/summary.ts
  → storage.readDb()          // acquires mutex, reads file, parses YAML, releases mutex
  → calc/summary.ts           // pure: LOCF fill → aggregate → filter by range
  → res.json(result)
```

### Write Flow (POST /api/v1/data-points)
```
HTTP POST (body: { asset_id, date, value })
  → Express routes/dataPoints.ts
  → Validate input
  → storage.writeDb(fn):
      mutex.runExclusive(async () => {
        const db = await readFile(DB_PATH)     // read current state
        const updated = applyMutation(db, fn)  // apply change in memory
        await writeFile(DB_TMP, stringify(updated))  // write to .tmp
        await rename(DB_TMP, DB_PATH)          // atomic swap (POSIX)
      })
  → res.json(created)
```

### SPA Routing Flow (GET /dashboard)
```
HTTP GET /dashboard
  → express.static(dist/) — no file matches → falls through
  → API routes — path doesn't start with /api → falls through
  → catch-all: res.sendFile('index.html', { root: dist/ })
  → React Router takes over client-side
```

---

## Pattern: In-Process Mutex for File I/O

**Context:** Node.js is single-threaded with an async event loop. Multiple concurrent requests can interleave async file reads and writes without a lock, producing torn writes or stale overwrites.

**Solution:** One singleton `Mutex` from `async-mutex` (v0.5.0) guards all storage operations.

```typescript
// server/src/storage/mutex.ts
import { Mutex } from 'async-mutex';
export const dbMutex = new Mutex();

// server/src/storage/index.ts
import { readFile, writeFile, rename } from 'node:fs/promises';
import { parse, stringify } from 'yaml';
import { dbMutex } from './mutex.js';
import type { Database } from '../models/index.js';

const DB_PATH = process.env.DATA_DIR
  ? `${process.env.DATA_DIR}/database.yaml`
  : './data/database.yaml';
const DB_TMP  = `${DB_PATH}.tmp`;

export async function readDb(): Promise<Database> {
  return dbMutex.runExclusive(async () => {
    const raw = await readFile(DB_PATH, 'utf8');
    return parse(raw) as Database;
  });
}

export async function mutateDb(fn: (db: Database) => Database): Promise<void> {
  return dbMutex.runExclusive(async () => {
    const raw = await readFile(DB_PATH, 'utf8');
    const db  = parse(raw) as Database;
    const updated = fn(db);
    await writeFile(DB_TMP, stringify(updated), 'utf8');
    await rename(DB_TMP, DB_PATH);  // atomic on POSIX (same filesystem guaranteed by Docker volume)
  });
}
```

**Why `runExclusive` not `acquire/release`:** It is exception-safe — the lock is always released even if the callback throws, preventing deadlocks.

**Why no inter-process locking (e.g. `proper-lockfile`):** Single Docker container = single Node.js process. The event loop guarantees that no two synchronous operations overlap; only concurrent async operations need serialization, which the in-process mutex handles perfectly.

---

## Pattern: Serving React SPA from Express

**Middleware registration order is critical.** Express matches middleware in declaration order.

```typescript
// server/src/index.ts
import express from 'express';
import path from 'node:path';
import { categoriesRouter } from './routes/categories.js';
import { assetsRouter }     from './routes/assets.js';
import { dataPointsRouter } from './routes/dataPoints.js';
import { summaryRouter }    from './routes/summary.js';

const app = express();
const DIST = path.resolve(process.env.WEB_DIST ?? '../web/dist');

// 1. Body parsing middleware (before routes)
app.use(express.json());

// 2. API routes — registered BEFORE static middleware
//    so /api/v1/... never hits the file system
app.use('/api/v1/categories',  categoriesRouter);
app.use('/api/v1/assets',      assetsRouter);
app.use('/api/v1/data-points', dataPointsRouter);
app.use('/api/v1/summary',     summaryRouter);
app.use('/api/v1/projections', summaryRouter);  // same router, different query

// 3. Static files for the compiled React app
//    Serves JS/CSS/assets directly; falls through for unmatched paths
app.use(express.static(DIST));

// 4. SPA catch-all — MUST be last
//    Any non-API, non-asset request gets index.html
//    React Router handles client-side navigation from there
app.get('*', (_req, res) => {
  res.sendFile(path.join(DIST, 'index.html'));
});

const PORT = Number(process.env.PORT ?? 8080);
app.listen(PORT, () => console.log(`WealthTrack listening on :${PORT}`));
```

**Key rule:** `express.static()` → `catch-all GET *` order must never be reversed. If catch-all comes before static, every request serves `index.html` including JS/CSS bundles.

---

## YAML Library: `yaml` (eemeli/yaml) over `js-yaml`

**Recommendation:** Use `yaml` package (eemeli/yaml v2.8.3).

| Criterion | `yaml` (eemeli) | `js-yaml` (nodeca) |
|-----------|-----------------|-------------------|
| Latest version | 2.8.3 | 4.1.1 |
| YAML spec | 1.1 + 1.2 | 1.2 |
| ESM support | ✓ Native | ✓ (v4) |
| TypeScript types | ✓ Built-in | ✓ via @types |
| Preserves comments | ✓ Yes | ✗ No |
| Active maintenance | ✓ Regular | Slower |

Comments matter: `database.yaml` is human-editable. Using `yaml` means manual edits with comments survive a round-trip through the app.

```typescript
import { parse, stringify } from 'yaml';

const db = parse(rawYaml) as Database;        // YAML → object
const raw = stringify(db, { indent: 2 });     // object → YAML
```

---

## Atomic File Writes in Node.js

**Pattern:** Write-to-temp, then `rename()`. Verified working on Node.js.

```typescript
import { writeFile, rename } from 'node:fs/promises';

await writeFile(DB_TMP, content, 'utf8');  // write full content to .tmp
await rename(DB_TMP, DB_PATH);             // atomic swap — POSIX rename(2) syscall
```

**Why atomic:** `fs.promises.rename()` maps to the POSIX `rename(2)` syscall when both paths are on the same filesystem. Within Docker, `/data/database.yaml` and `/data/database.yaml.tmp` are always on the same mounted volume — guaranteed same filesystem. The syscall is atomic: readers either see the old or new file, never a partial write.

**Caveat:** On Windows or cross-filesystem moves, `rename()` is not atomic. Not a concern here — Docker Linux container.

---

## Suggested Build Order

Dependencies flow downward. Build bottom-up.

```
Layer 0: models/index.ts          ← no deps; define interfaces first
    │
Layer 1: storage/mutex.ts         ← deps: async-mutex only
         storage/index.ts         ← deps: models, yaml, node:fs/promises, mutex
    │
Layer 2: calc/summary.ts          ← deps: models (pure function, no I/O)
         calc/projections.ts      ← deps: models (pure function, no I/O)
    │
Layer 3: routes/categories.ts     ← deps: storage, models
         routes/assets.ts         ← deps: storage, models
         routes/dataPoints.ts     ← deps: storage, models
         routes/summary.ts        ← deps: storage, calc/summary, calc/projections
    │
Layer 4: index.ts                 ← deps: all routes, express, path
    │
Layer 5: Dockerfile               ← deps: everything; multi-stage final wiring
         docker-compose.yml
```

**Build sequence rationale:**
1. **Models first** — every other layer imports interfaces. Defining them upfront prevents circular guessing.
2. **Storage second** — calc and routes both need it; storage has no dependency on business logic.
3. **Calc third** — pure functions, no I/O, easy to unit test in isolation before wiring to routes.
4. **Routes fourth** — thin: validate input, call storage/calc, serialize response. Testable with mock storage.
5. **App assembly last** — just Express wiring; all logic already tested in lower layers.
6. **Docker last** — only after server + web both work end-to-end locally.

---

## Anti-Patterns to Avoid

### Anti-Pattern 1: Unguarded Concurrent File Writes
**What:** Reading database, modifying in memory, writing back without a lock.
**Why bad:** Two concurrent POST requests both read the same state, each writes back their mutation — one overwrites the other (last-write-wins race condition).
**Instead:** All reads and writes go through `mutateDb()` which holds the mutex for the full read-modify-write cycle.

### Anti-Pattern 2: Catch-All Before Static Middleware
**What:** Registering `app.get('*', serveIndex)` before `express.static()`.
**Why bad:** Every request — including `main.js`, `style.css`, favicon — returns `index.html`. The app silently loads but all assets are broken.
**Instead:** `express.static()` always comes before the catch-all (see SPA pattern above).

### Anti-Pattern 3: Multiple Mutex Instances
**What:** Creating `new Mutex()` inside each route handler or per-request.
**Why bad:** Each instance has its own queue — multiple instances provide zero mutual exclusion.
**Instead:** Export one singleton `dbMutex` from `storage/mutex.ts`; import it everywhere storage is accessed.

### Anti-Pattern 4: Storing Computed Data in YAML
**What:** Caching summary totals or projections back into `database.yaml`.
**Why bad:** Derived data goes stale; introduces cache invalidation complexity; the file is the source of truth for raw data only.
**Instead:** Always compute summary/projections on request from raw data points. Dataset is small (single household, monthly points) — no caching needed.

### Anti-Pattern 5: Fat Route Handlers
**What:** Putting LOCF logic, aggregation, and projection math directly inside route handler functions.
**Why bad:** Untestable without HTTP, hard to reuse, violates single responsibility.
**Instead:** Route handlers stay thin (validate → call calc → respond). Business logic lives in `calc/`.

---

## Scalability Considerations

This app is explicitly single-household. No scalability beyond that is needed.

| Concern | Single household (actual scope) | If it ever grew |
|---------|--------------------------------|-----------------|
| File I/O | In-process mutex, full-file read on each request — perfectly adequate for <1000 data points | Switch to SQLite with better-sqlite3 |
| Concurrency | Single container, mutex prevents races — fine for 1-3 simultaneous users | Horizontal scaling would need external lock or DB |
| Memory | Full YAML parsed on each request — fine at <1MB file size | Stream or index if file grows |
| Computation | LOCF + aggregation is O(n) in data points — imperceptible at household scale | No change needed |

---

## Sources

- Express routing docs: Context7 `/expressjs/express` (HIGH confidence)
- `async-mutex` API: Context7 `/dirtyhairy/async-mutex` — `runExclusive` pattern verified (HIGH confidence)
- `yaml` package: Context7 `/eemeli/yaml` — `parse`/`stringify` API verified (HIGH confidence)
- `js-yaml` package: Context7 `/nodeca/js-yaml` — comparison baseline (HIGH confidence)
- Node.js `fs.promises.rename` atomicity: Verified in Node.js runtime, POSIX `rename(2)` docs (HIGH confidence)
- `express.static` + SPA catch-all order: Context7 `/expressjs/express` + verified pattern (HIGH confidence)
- Atomic write temp+rename: Runtime-tested in Node.js 20 (HIGH confidence)
