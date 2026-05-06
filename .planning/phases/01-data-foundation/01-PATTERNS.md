# Phase 1: Data Foundation — Pattern Map

**Mapped:** 2026-04-22
**Files analyzed:** 6 new files + 2 deletions
**Analogs found:** 2 / 6 (config files only — no existing Node.js/TypeScript server code exists)

> **Note:** This is a greenfield Node.js backend. The only existing TypeScript in the repo is the
> React frontend (`web/`). Config file patterns come from `web/`; all server implementation
> patterns come from `.planning/research/ARCHITECTURE.md` and `.planning/research/STACK.md`.
> The planner MUST use those research files for the implementation files (models, storage, index).

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `server/package.json` | config | — | `web/package.json` (lines 1-27) | role-match (ESM + TS devDep pattern) |
| `server/tsconfig.json` | config | — | `web/tsconfig.json` (lines 1-20) | role-match (strict TS options) |
| `server/src/index.ts` | entry-point | request-response | `cmd/server/main.go` (lines 1-27) | partial (PORT env + health pattern only; language differs) |
| `server/src/models/index.ts` | model | — | *(none)* | no analog |
| `server/src/storage/mutex.ts` | utility | — | *(none)* | no analog |
| `server/src/storage/index.ts` | service | file-I/O | *(none)* | no analog |

**Deletions (no pattern needed):**
| File | Action |
|---|---|
| `cmd/server/main.go` | Delete — Go scaffold replaced by `server/src/index.ts` |
| `go.mod` | Delete — Go module replaced by `server/package.json` |

---

## Pattern Assignments

### `server/package.json` (config)

**Analog:** `web/package.json` (lines 1-27)

**Mirror this pattern** (`web/package.json` lines 1-6):
```json
{
  "name": "wealthtrack-web",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
```

**What to keep identical:**
- `"private": true` — same
- `"type": "module"` — **mandatory**, must be present (mirrors `web/package.json` line 4)
- `"version": "0.1.0"` — same versioning convention

**What to change for server:**
- `"name"`: `"wealthtrack-server"` (not `"wealthtrack-web"`)
- `"scripts"`: replace Vite scripts with:
  ```json
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js"
  }
  ```
- `"dependencies"` (runtime, not devDeps): `hono ^4.12.14`, `@hono/node-server ^2.0.0`,
  `@hono/zod-validator ^0.7.0`, `zod ^3.24.4`, `yaml ^2.8.3`,
  `async-mutex ^0.5.0`, `write-file-atomic ^7.0.1`
- `"devDependencies"`: `typescript ^5.8.3`, `tsx ^4.21.0`, `@types/node ^22.0.0`,
  `@types/write-file-atomic` (latest)

**Do NOT use** (from `web/package.json`): `vite`, `@vitejs/plugin-react`, `tailwindcss`,
`postcss`, `autoprefixer`, `@types/react`, `recharts`.

---

### `server/tsconfig.json` (config)

**Analog:** `web/tsconfig.json` (lines 1-20)

**Full analog for reference** (`web/tsconfig.json` lines 1-20):
```json
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": false,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true
  },
  "include": ["src"]
}
```

**Copy these options verbatim** (lines 14-17 of `web/tsconfig.json`):
```json
"strict": true,
"noUnusedLocals": true,
"noUnusedParameters": true,
"noFallthroughCasesInSwitch": true
```

**Replace these options for a Node.js ESM backend:**
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022"],
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "outDir": "dist",
    "rootDir": "src",
    "noEmit": false,
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true
  },
  "include": ["src"]
}
```

**Key differences from `web/tsconfig.json`:**
- `"module": "NodeNext"` + `"moduleResolution": "NodeNext"` — required for ESM on Node.js (NOT `"bundler"` which is Vite-only)
- `"outDir": "dist"` + `"rootDir": "src"` — server DOES compile; `web/` uses `"noEmit": true` (Vite handles it)
- `"noEmit": false` — server needs `tsc` to produce JS in `dist/`
- Remove `"useDefineForClassFields"`, `"jsx"`, `"isolatedModules"`, `"allowImportingTsExtensions"` — React/Vite-specific, not needed here
- Remove `"DOM"`, `"DOM.Iterable"` from `"lib"` — backend has no DOM

**Critical:** With `"module": "NodeNext"`, all local imports **must** use `.js` extension
(TypeScript resolves `.ts` → `.js` at compile time):
```typescript
import { dbMutex } from './mutex.js';       // ✅ correct
import { dbMutex } from './mutex';           // ❌ will fail at runtime
```

---

### `server/src/index.ts` (entry-point, request-response)

**Analog:** `cmd/server/main.go` (lines 1-27) — partial match, different language but same structural role

**Go analog for reference** (`cmd/server/main.go` lines 7-27):
```go
func main() {
    port := os.Getenv("PORT")
    if port == "" {
        port = "8080"
    }

    mux := http.NewServeMux()
    mux.HandleFunc("/api/v1/health", func(w http.ResponseWriter, r *http.Request) {
        w.Header().Set("Content-Type", "application/json")
        _, _ = w.Write([]byte(`{"status":"ok"}`))
    })

    log.Printf("WealthTrack listening on :%s", port)
    if err := http.ListenAndServe(":"+port, mux); err != nil {
        log.Fatal(err)
    }
}
```

**Patterns to mirror from Go analog:**
1. `PORT` env var with `"8080"` default
2. `/api/v1/health` endpoint returning `{"status":"ok"}`
3. Single entry-point pattern (no separate routing file in Phase 1)

**Node.js/Hono translation** (from `ARCHITECTURE.md` lines 183-219):
```typescript
// server/src/index.ts
import { Hono } from 'hono'
import { serve } from '@hono/node-server'

const app = new Hono()

// Health endpoint — mirrors Go analog /api/v1/health handler
app.get('/api/v1/health', (c) => c.json({ status: 'ok' }))

const PORT = Number(process.env.PORT ?? 8080)
serve({ fetch: app.fetch, port: PORT }, () => {
  console.log(`WealthTrack listening on :${PORT}`)
})
```

**Phase 1 addition — bootstrapDatabase() before serve()** (from `PITFALLS.md` Pitfall 12 + ROADMAP Plan 1.4):
```typescript
// Call BEFORE serve() — crash on ENOENT is expected, crash on corrupt YAML is intentional (D-01)
await bootstrapDatabase()

serve({ fetch: app.fetch, port: PORT }, () => {
  console.log(`WealthTrack listening on :${PORT}`)
})
```

**Decision D-01 (from CONTEXT.md):** If `database.yaml` exists but `yaml.parse()` throws,
crash with a clear message — do NOT catch and continue with empty state:
```typescript
try {
  return parse(raw) as Database
} catch (err) {
  console.error(
    `Error: Failed to parse database at ${DB_PATH}: ${(err as Error).message}`
  )
  process.exit(1)
}
```

---

### `server/src/models/index.ts` (model)

**No codebase analog.** Pure TypeScript interface definitions — no runtime logic.

**Source:** `REQUIREMENTS.md` MODEL-01, MODEL-02, MODEL-03 + `ARCHITECTURE.md` lines 83-86

**Pattern to implement** (interface-only, no classes, no Zod here — Zod is Phase 2):
```typescript
// server/src/models/index.ts
// Pure type definitions — no imports, no runtime code

export interface Category {
  id: string                      // slug, immutable after create (MODEL-01)
  name: string
  projected_yearly_growth: number // float, e.g. 0.08 for 8%
  color: string                   // hex, e.g. '#6366f1'
}

export interface Asset {
  id: string                                  // slug, immutable (MODEL-02)
  name: string
  category_id: string
  projected_yearly_growth: number | null      // null = inherit from Category
  location?: string
  notes?: string
  created_at: string                          // ISO timestamp, immutable
}

export interface DataPoint {
  id: string               // UUID v4 via crypto.randomUUID() (MODEL-03)
  asset_id: string
  year_month: string       // YYYY-MM — always client-provided (D-02, D-03)
  value: number            // float64, EUR
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

**Critical constraint (D-03 from CONTEXT.md):** `year_month` is ALWAYS provided by the
frontend client. NEVER compute it server-side with `new Date().toISOString().slice(0, 7)`.
Add a comment in the interface to document this constraint.

---

### `server/src/storage/mutex.ts` (utility)

**No codebase analog.** Singleton module — zero logic, one export.

**Source:** `ARCHITECTURE.md` lines 139-142, `PITFALLS.md` Pitfall 2 (Concurrent Race Condition)

**Complete file pattern** (from `ARCHITECTURE.md` lines 139-142):
```typescript
// server/src/storage/mutex.ts
import { Mutex } from 'async-mutex'

export const dbMutex = new Mutex()
```

**Critical rule (ARCHITECTURE.md Anti-Pattern 3 + PITFALLS.md Pitfall 2):**
> One `new Mutex()` in this file. Any additional `new Mutex()` elsewhere provides zero
> mutual exclusion — each instance has its own independent queue.

The planner MUST add a `// DO NOT instantiate Mutex anywhere else` comment to enforce this.

**Import path note:** When `storage/index.ts` imports this, it must use `.js` extension:
```typescript
import { dbMutex } from './mutex.js'
```

---

### `server/src/storage/index.ts` (service, file-I/O)

**No codebase analog.** Core storage service — the most critical file in Phase 1.

**Source:** `ARCHITECTURE.md` lines 143-170 (complete pattern), `STACK.md` lines 38-58
(alternative pattern using `write-file-atomic`)

**Pattern from `ARCHITECTURE.md`** (lines 143-170):
```typescript
// server/src/storage/index.ts
import { readFile, writeFile, rename } from 'node:fs/promises'
import { parse, stringify } from 'yaml'
import { dbMutex } from './mutex.js'
import type { Database } from '../models/index.js'

const DB_PATH = process.env.DATA_FILE ?? '/data/database.yaml'
// Note: REQUIREMENTS.md STOR-04 specifies DATA_FILE (not DATA_DIR)
const DB_TMP  = `${DB_PATH}.tmp`

export async function readDb(): Promise<Database> {
  return dbMutex.runExclusive(async () => {
    const raw = await readFile(DB_PATH, 'utf8')
    return parse(raw) as Database
  })
}

export async function mutateDb(fn: (db: Database) => Database): Promise<void> {
  return dbMutex.runExclusive(async () => {
    const raw = await readFile(DB_PATH, 'utf8')
    const db  = parse(raw) as Database
    const updated = fn(db)
    await writeFile(DB_TMP, stringify(updated), 'utf8')
    await rename(DB_TMP, DB_PATH)  // atomic POSIX rename(2) — same volume guaranteed
  })
}
```

**Corrupt YAML handling addition** (Decision D-01 from CONTEXT.md):
```typescript
// In readDb() — replace bare `parse(raw)` with:
let db: Database
try {
  db = parse(raw) as Database
} catch (err) {
  console.error(
    `Error: Failed to parse database at ${DB_PATH}: ${(err as Error).message}`
  )
  process.exit(1)
}
return db
```

**Bootstrap helper for `index.ts`** (from ROADMAP Plan 1.4 + PITFALLS.md Pitfall 12):
```typescript
import { existsSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'

export async function bootstrapDatabase(): Promise<void> {
  if (existsSync(DB_PATH)) return

  // Create parent directory if needed (e.g. /data not mounted yet in dev)
  mkdirSync(dirname(DB_PATH), { recursive: true })

  // Seed four default categories per ROADMAP Plan 1.4
  const seed: Database = {
    categories: [
      { id: 'stocks',      name: 'Stocks',      projected_yearly_growth: 0.08, color: '#6366f1' },
      { id: 'real-estate', name: 'Real Estate', projected_yearly_growth: 0.05, color: '#10b981' },
      { id: 'crypto',      name: 'Crypto',       projected_yearly_growth: 0.15, color: '#f59e0b' },
      { id: 'cash',        name: 'Cash',          projected_yearly_growth: 0.02, color: '#64748b' },
    ],
    assets: [],
    dataPoints: [],
  }

  // Use atomic write — never fs.writeFile directly to DB_PATH
  await writeFile(DB_TMP, stringify(seed), 'utf8')
  await rename(DB_TMP, DB_PATH)
}
```

**STOR-04 env var name:** `DATA_FILE` (not `DATA_DIR` — see `REQUIREMENTS.md` STOR-04).
The ARCHITECTURE.md example uses `DATA_DIR` but REQUIREMENTS.md overrides this with `DATA_FILE`.
Use `DATA_FILE`.

---

## Shared Patterns

### ESM Import Extensions

**Source:** `web/tsconfig.json` (module system) + `ARCHITECTURE.md` NodeNext note
**Apply to:** All `server/src/**/*.ts` files

With `"module": "NodeNext"` in tsconfig, all local imports MUST include `.js` extension:

```typescript
// ✅ Correct — used throughout all server files
import { dbMutex } from './mutex.js'
import type { Database } from '../models/index.js'

// ❌ Wrong — fails at Node.js runtime with ERR_MODULE_NOT_FOUND
import { dbMutex } from './mutex'
```

Node.js built-in imports use `node:` prefix (project convention from `ARCHITECTURE.md`):
```typescript
import { readFile, writeFile, rename } from 'node:fs/promises'
import { existsSync, mkdirSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { dirname } from 'node:path'
```

---

### Mutex Singleton Enforcement

**Source:** `ARCHITECTURE.md` Anti-Pattern 3 + `PITFALLS.md` Pitfall 2
**Apply to:** `server/src/storage/mutex.ts` and all storage callers

One `new Mutex()` total. Every `readDb()` and `mutateDb()` call goes through `dbMutex.runExclusive()`. Never instantiate `Mutex` in route handlers or `index.ts`.

---

### Atomic Write Pattern

**Source:** `ARCHITECTURE.md` lines 249-262, `PITFALLS.md` Pitfall 1
**Apply to:** `server/src/storage/index.ts`, `bootstrapDatabase()` in `server/src/storage/index.ts`

Write to `.tmp` then `rename()` — never write directly to `database.yaml`:
```typescript
await writeFile(DB_TMP, stringify(data), 'utf8')
await rename(DB_TMP, DB_PATH)           // POSIX rename(2) — atomic on same filesystem
```

---

### Crash on Corrupt YAML

**Source:** Decision D-01 in `CONTEXT.md` + Decision-specific note in `SPECIFICS` section
**Apply to:** `readDb()` in `server/src/storage/index.ts`

If `yaml.parse()` throws, log a human-readable error and `process.exit(1)` — do NOT silently continue with empty state:
```typescript
// Human-readable message format (from CONTEXT.md specifics):
// "Error: Failed to parse database.yaml at /data/database.yaml: unexpected token..."
console.error(`Error: Failed to parse database at ${DB_PATH}: ${(err as Error).message}`)
process.exit(1)
```

---

### No Server-Side year_month Generation

**Source:** Decisions D-02 and D-03 in `CONTEXT.md`
**Apply to:** `server/src/models/index.ts` (comment), `server/src/storage/index.ts` (no defaulting logic)

Never compute `year_month` server-side:
```typescript
// ❌ FORBIDDEN — UTC-based, shifts months for UTC+ users at midnight
const yearMonth = new Date().toISOString().slice(0, 7)

// ✅ CORRECT — always comes from client in YYYY-MM format
// Validated in Phase 2 with Zod regex: /^\d{4}-\d{2}$/
```

---

## No Analog Found

Files with no close match in the codebase (planner must use research files):

| File | Role | Data Flow | Reason | Primary Source |
|---|---|---|---|---|
| `server/src/index.ts` | entry-point | request-response | Only analog is Go (`cmd/server/main.go`) — different language; Hono ≠ `net/http` | `ARCHITECTURE.md` lines 183-219 |
| `server/src/models/index.ts` | model | — | No TypeScript interfaces exist anywhere in the project (`web/src/types/` is empty) | `REQUIREMENTS.md` MODEL-01–03 |
| `server/src/storage/mutex.ts` | utility | — | No mutex or concurrency primitives anywhere | `ARCHITECTURE.md` lines 139-142 |
| `server/src/storage/index.ts` | service | file-I/O | No file I/O service exists | `ARCHITECTURE.md` lines 143-170 + `STACK.md` lines 38-58 |

---

## Metadata

**Analog search scope:** `/Users/sasa/Projects/family-wealth-tracker/web/`, `cmd/`
**Files scanned:** `web/package.json`, `web/tsconfig.json`, `web/src/App.tsx`, `web/src/main.tsx`, `cmd/server/main.go`, `go.mod`, `Dockerfile`
**Research files used:** `STACK.md`, `ARCHITECTURE.md`, `PITFALLS.md`, `ROADMAP.md`, `REQUIREMENTS.md`, `01-CONTEXT.md`
**Pattern extraction date:** 2026-04-22

---

## Critical Implementation Notes for Planner

1. **`.js` extensions required** on all local imports — `"module": "NodeNext"` enforces this
2. **One `new Mutex()`** — only in `storage/mutex.ts`; import `dbMutex` everywhere else
3. **`DATA_FILE` env var** (not `DATA_DIR`) — REQUIREMENTS.md STOR-04 is authoritative
4. **`bootstrapDatabase()`** belongs in `server/src/storage/index.ts` (or a dedicated `bootstrap.ts`) and is called from `index.ts` before `serve()`
5. **`year_month` never computed server-side** — document with inline comment in model
6. **Corrupt YAML → `process.exit(1)`** with human-readable message — not silent recovery
7. **`web/tsconfig.json` options to mirror exactly:** `strict`, `noUnusedLocals`, `noUnusedParameters`, `noFallthroughCasesInSwitch`
8. **Dockerfile** — do NOT update in Phase 1 (per CONTEXT.md `code_context`)
