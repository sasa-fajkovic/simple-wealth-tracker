---
phase: 01-data-foundation
plan: 04
type: execute
wave: 4
depends_on:
  - 01-1-PLAN.md
  - 01-2-PLAN.md
  - 01-3-PLAN.md
files_modified:
  - server/src/bootstrap.ts
  - server/src/index.ts
autonomous: true
requirements:
  - STOR-01
must_haves:
  truths:
    - "Server starts without error when DATA_FILE path does not exist — auto-creates it"
    - "After first boot, database.yaml contains exactly 4 categories and empty assets/dataPoints arrays"
    - "Seeded category IDs are exactly: stocks, real-estate, crypto, cash"
    - "Second boot with existing valid file does not modify or overwrite it"
    - "Boot with corrupt database.yaml (invalid YAML) crashes with non-zero exit and human-readable error message containing the file path"
    - "Bootstrap uses writeFileAtomic — no direct fs.writeFile to DB_PATH"
    - "bootstrapDatabase() is awaited in index.ts before serve() is called"
  artifacts:
    - path: "server/src/bootstrap.ts"
      provides: "bootstrapDatabase() — check ENOENT + seed write + corrupt YAML crash"
      exports: ["bootstrapDatabase"]
  key_links:
    - from: "server/src/index.ts"
      to: "server/src/bootstrap.ts"
      via: "await bootstrapDatabase() before serve()"
      pattern: "await bootstrapDatabase\\(\\)"
    - from: "server/src/bootstrap.ts"
      to: "server/src/storage/index.ts"
      via: "import { DB_PATH } from './storage/index.js'"
      pattern: "DB_PATH"
    - from: "server/src/bootstrap.ts"
      to: "server/src/models/seed.ts"
      via: "import { SEED_CATEGORIES } from './models/seed.js'"
      pattern: "SEED_CATEGORIES"
---

<objective>
Implement first-run bootstrap: detect a missing database.yaml and create it with seed categories; crash with a clear error message if the file exists but is corrupt.

Purpose: STOR-01 requires the server to self-initialise on first boot so users can docker-compose up and immediately use the app. The corrupt-YAML crash (Decision D-01) prevents silent data loss where a bad file would be overwritten with an empty database.
Output: server/src/bootstrap.ts with bootstrapDatabase() function; server/src/index.ts updated to await it before serve().
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
<!-- Contracts from prior plans that bootstrap.ts consumes -->

From server/src/storage/index.ts (Plan 01-3):
```typescript
export const DB_PATH: string  // process.env.DATA_FILE ?? '/data/database.yaml'
// Note: import DB_PATH to avoid re-reading the env var in bootstrap.ts
```

From server/src/models/seed.ts (Plan 01-2):
```typescript
import type { Category } from './index.js'
export const SEED_CATEGORIES: Category[]
// Contains exactly 4 categories: stocks (0.08), real-estate (0.05), crypto (0.15), cash (0.02)
```

From server/src/models/index.ts (Plan 01-2):
```typescript
export interface Database {
  categories: Category[]
  assets: Asset[]
  dataPoints: DataPoint[]
}
```

<!-- Current state of server/src/index.ts (Plan 01-1) — will be modified in Task 2 -->
From server/src/index.ts:
```typescript
import { Hono } from 'hono'
import { serve } from '@hono/node-server'

const app = new Hono()
app.get('/api/v1/health', (c) => c.json({ status: 'ok' }))

const PORT = Number(process.env.PORT ?? 8080)
serve({ fetch: app.fetch, port: PORT }, () => {
  console.log(`WealthTrack listening on port ${PORT}`)
})
```
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create bootstrapDatabase() function</name>
  <files>server/src/bootstrap.ts</files>

  <read_first>
    - server/src/storage/index.ts — DB_PATH constant to import (do not re-read env var here)
    - server/src/models/seed.ts — SEED_CATEGORIES to import for the initial database
    - server/src/models/index.ts — Database interface for the seed object shape
    - .planning/phases/01-data-foundation/01-CONTEXT.md — Decision D-01 (corrupt YAML must crash), specifics section (human-readable error format)
  </read_first>

  <action>
Create `server/src/bootstrap.ts` with EXACT content:

```typescript
import { access, mkdir, readFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { parse, stringify } from 'yaml'
import writeFileAtomic from 'write-file-atomic'
import { DB_PATH } from './storage/index.js'
import { SEED_CATEGORIES } from './models/seed.js'
import type { Database } from './models/index.js'

export async function bootstrapDatabase(): Promise<void> {
  // Check if the database file already exists
  let fileExists = true
  try {
    await access(DB_PATH)
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err
    fileExists = false
  }

  if (!fileExists) {
    // First run — create the directory (e.g. /data might not exist in dev) and write seed data
    await mkdir(dirname(DB_PATH), { recursive: true })
    const initial: Database = {
      categories: SEED_CATEGORIES,
      assets: [],
      dataPoints: [],
    }
    // writeFileAtomic: temp-file + rename — never writes directly to DB_PATH (STOR-03)
    await writeFileAtomic(DB_PATH, stringify(initial, { lineWidth: 0 }))
    console.log(`Initialized database at ${DB_PATH} with ${SEED_CATEGORIES.length} seed categories`)
    return
  }

  // File exists — validate it can be parsed before the server accepts any requests.
  // Decision D-01: if YAML is corrupt, crash with a clear message rather than silently
  // continuing with empty state (which would overwrite real user data on the next write).
  const raw = await readFile(DB_PATH, 'utf8')
  try {
    parse(raw)
  } catch (err) {
    console.error(
      `Error: Failed to parse database at ${DB_PATH}: ${(err as Error).message}`
    )
    process.exit(1)
  }
}
```

Implementation notes:
- `access(DB_PATH)` resolves if file exists, throws ENOENT if not — catch only ENOENT; re-throw other errors (e.g. EACCES)
- `mkdir(dirname(DB_PATH), { recursive: true })` handles both "/data" not mounted and dev runs where database.yaml is in a local path
- `SEED_CATEGORIES` is imported from models/seed.ts — the source of truth for seed values
- `writeFileAtomic` is used for the seed write — consistent with mutateDb pattern
- The corrupt-YAML check only calls `parse(raw)` to validate — it does not return the result; actual database loading happens through readDb() in route handlers
- All imports use `.js` extension — NodeNext module resolution requirement
  </action>

  <verify>
    <automated>
      grep "export async function bootstrapDatabase" server/src/bootstrap.ts \
        && grep "ENOENT" server/src/bootstrap.ts \
        && grep "mkdir" server/src/bootstrap.ts \
        && grep "writeFileAtomic" server/src/bootstrap.ts \
        && grep "SEED_CATEGORIES" server/src/bootstrap.ts \
        && grep "process.exit(1)" server/src/bootstrap.ts \
        && grep "DB_PATH" server/src/bootstrap.ts \
        && grep "Failed to parse database at" server/src/bootstrap.ts \
        && ! grep -n "writeFile(DB_PATH" server/src/bootstrap.ts \
        && cd server && npx tsc --noEmit \
        && echo "PASS: bootstrap.ts valid"
    </automated>
  </verify>

  <acceptance_criteria>
    - `grep 'export async function bootstrapDatabase' server/src/bootstrap.ts` exits 0
    - `grep 'ENOENT' server/src/bootstrap.ts` exits 0 — ENOENT is explicitly checked
    - `grep 'mkdir' server/src/bootstrap.ts` exits 0 — parent directory is created recursively
    - `grep 'writeFileAtomic' server/src/bootstrap.ts` exits 0 — atomic write for seed data
    - `grep 'SEED_CATEGORIES' server/src/bootstrap.ts` exits 0 — imports typed seed data
    - `grep 'process.exit(1)' server/src/bootstrap.ts` exits 0 — corrupt YAML crashes server
    - `grep 'Failed to parse database at' server/src/bootstrap.ts` exits 0 — human-readable error (D-01)
    - `grep -n 'writeFile(DB_PATH' server/src/bootstrap.ts` exits non-zero — no direct writes to target
    - `cd server && npx tsc --noEmit` exits 0
  </acceptance_criteria>
</task>

<task type="auto">
  <name>Task 2: Wire bootstrapDatabase() into server entry point</name>
  <files>server/src/index.ts</files>

  <read_first>
    - server/src/index.ts — current state from Plan 01-1 (need to see exact content before editing)
    - server/src/bootstrap.ts — just created; confirm function name is bootstrapDatabase
  </read_first>

  <action>
Update `server/src/index.ts` to import bootstrapDatabase and await it before serve().

Replace the current content with:

```typescript
import { Hono } from 'hono'
import { serve } from '@hono/node-server'
import { bootstrapDatabase } from './bootstrap.js'

const app = new Hono()

app.get('/api/v1/health', (c) => c.json({ status: 'ok' }))

// Run bootstrap before accepting requests.
// - If DATA_FILE path does not exist: creates it with seed data (STOR-01)
// - If DATA_FILE exists but is corrupt: crashes with a clear error (D-01)
// - If DATA_FILE exists and is valid: continues normally
await bootstrapDatabase()

const PORT = Number(process.env.PORT ?? 8080)

serve({ fetch: app.fetch, port: PORT }, () => {
  console.log(`WealthTrack listening on port ${PORT}`)
})
```

Notes:
- `await bootstrapDatabase()` is a top-level await — valid because server/package.json has `"type": "module"` and tsconfig uses `"module": "NodeNext"`
- bootstrapDatabase() MUST be awaited BEFORE `serve()` — if the file is corrupt, the server must not start accepting requests
- Import uses `.js` extension per NodeNext resolution rules

After editing, verify TypeScript compiles cleanly:
```bash
cd server && npx tsc --noEmit
```

Also run a full integration smoke test:
```bash
# Test 1: First run — no existing database.yaml
DATA_FILE=/tmp/test-wealth-$$.yaml node --loader tsx/esm server/src/index.ts &
SERVER_PID=$!
sleep 2
curl -sf http://localhost:8080/api/v1/health
kill $SERVER_PID
test -f /tmp/test-wealth-$$.yaml && grep 'stocks' /tmp/test-wealth-$$.yaml
rm -f /tmp/test-wealth-$$.yaml

# Or simpler: just confirm TypeScript compiles and grep verifications pass
```
The integration smoke test is optional if CI doesn't support it — the grep checks below are the binding acceptance criteria.
  </action>

  <verify>
    <automated>
      grep "import { bootstrapDatabase } from './bootstrap.js'" server/src/index.ts \
        && grep "await bootstrapDatabase()" server/src/index.ts \
        && grep "serve(" server/src/index.ts \
        && cd server && npx tsc --noEmit \
        && echo "PASS: bootstrap wired correctly, TypeScript clean"
    </automated>
  </verify>

  <acceptance_criteria>
    - `grep "import { bootstrapDatabase } from './bootstrap.js'" server/src/index.ts` exits 0
    - `grep "await bootstrapDatabase()" server/src/index.ts` exits 0
    - `grep "await bootstrapDatabase()" server/src/index.ts` line appears BEFORE the `serve(` line (check line numbers)
    - `cd server && npx tsc --noEmit` exits 0
    - Manual smoke test (run when possible): `DATA_FILE=/tmp/wt-test.yaml npm run dev` → server starts → `curl http://localhost:8080/api/v1/health` returns `{"status":"ok"}` → `/tmp/wt-test.yaml` contains 'stocks', 'real-estate', 'crypto', 'cash' → second start does not overwrite the file
  </acceptance_criteria>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| filesystem → bootstrap | YAML file read on startup before any request is processed |
| bootstrap → serve() | bootstrapDatabase() must fully resolve before server accepts traffic |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-01-12 | Tampering | Corrupt database.yaml recovery | mitigate | process.exit(1) with human-readable error prevents silent overwrite of real data with empty state (D-01) |
| T-01-13 | Tampering | Seed write path | mitigate | writeFileAtomic in bootstrapDatabase ensures seed write is atomic — no partial initial file |
| T-01-14 | Denial of Service | mkdir failure on /data volume | accept | If /data is not writable, server crashes with a clear OS error — deployer must fix volume mount; no mitigation needed at app level |
| T-01-15 | Spoofing | ENOENT vs EACCES confusion | mitigate | bootstrap re-throws all errors except ENOENT — permission errors surface immediately rather than silently creating an unintended path |
</threat_model>

<verification>
Phase-level verification (all plans complete):
1. `test ! -d cmd && test ! -f go.mod` — Go scaffold removed
2. `grep '"type": "module"' server/package.json` — ESM project
3. `grep 'export interface Database' server/src/models/index.ts` — MODEL-01/02/03 covered
4. `grep 'projected_yearly_growth: number | null' server/src/models/index.ts` — correct null semantics
5. `grep 'export const dbMutex = new Mutex()' server/src/storage/mutex.ts` — singleton enforced
6. `test "$(grep -rc 'new Mutex()' server/src/)" = "server/src/storage/mutex.ts:1"` — no duplicates
7. `grep 'writeFileAtomic' server/src/storage/index.ts` — STOR-03 atomic writes
8. `grep 'process.env.DATA_FILE' server/src/storage/index.ts` — STOR-04 env var
9. `grep 'await bootstrapDatabase()' server/src/index.ts` — STOR-01 bootstrap wired
10. `grep 'SEED_CATEGORIES' server/src/bootstrap.ts` — seed data sourced from typed constant
11. `cd server && npx tsc --noEmit` — entire server/ codebase compiles clean
</verification>

<success_criteria>
- server/src/bootstrap.ts: bootstrapDatabase() creates database.yaml with 4 seed categories on ENOENT, crashes on corrupt YAML with human-readable message, is a no-op for valid existing files
- server/src/index.ts: imports and awaits bootstrapDatabase() before serve()
- No direct fs.writeFile(DB_PATH, ...) calls in bootstrap.ts or storage/index.ts
- `npx tsc --noEmit` exits 0 for the complete server/src/ tree
- Phase 1 requirement coverage: STOR-01 ✓, STOR-02 ✓, STOR-03 ✓, STOR-04 ✓, MODEL-01 ✓, MODEL-02 ✓, MODEL-03 ✓
</success_criteria>

<output>
After completion, create `.planning/phases/01-data-foundation/01-4-SUMMARY.md`
</output>
