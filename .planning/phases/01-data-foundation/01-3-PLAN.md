---
phase: 01-data-foundation
plan: 03
type: execute
wave: 3
depends_on:
  - 01-1-PLAN.md
  - 01-2-PLAN.md
files_modified:
  - server/src/storage/mutex.ts
  - server/src/storage/index.ts
autonomous: true
requirements:
  - STOR-02
  - STOR-03
  - STOR-04
must_haves:
  truths:
    - "Exactly one 'new Mutex()' call in entire server/ codebase — only in storage/mutex.ts"
    - "readDb uses dbMutex.runExclusive for the full read operation"
    - "mutateDb uses dbMutex.runExclusive for the full read-modify-write cycle"
    - "mutateDb calls writeFileAtomic — no direct fs.writeFile(DB_PATH, ...) anywhere in storage/index.ts"
    - "DB_PATH reads from process.env.DATA_FILE with default '/data/database.yaml'"
    - "cd server && npx tsc --noEmit exits 0"
  artifacts:
    - path: "server/src/storage/mutex.ts"
      provides: "Singleton dbMutex export — the ONLY Mutex instance in the codebase"
      exports: ["dbMutex"]
    - path: "server/src/storage/index.ts"
      provides: "readDb, mutateDb functions and exported DB_PATH constant"
      exports: ["readDb", "mutateDb", "DB_PATH"]
  key_links:
    - from: "server/src/storage/index.ts"
      to: "server/src/storage/mutex.ts"
      via: "import { dbMutex } from './mutex.js'"
      pattern: "dbMutex\\.runExclusive"
    - from: "server/src/storage/index.ts"
      to: "write-file-atomic"
      via: "writeFileAtomic(DB_PATH, stringify(updated, ...))"
      pattern: "writeFileAtomic\\(DB_PATH"
    - from: "server/src/storage/index.ts"
      to: "server/src/models/index.ts"
      via: "import type { Database } from '../models/index.js'"
---

<objective>
Implement the crash-safe, concurrency-safe YAML storage layer: a singleton mutex and two functions (readDb, mutateDb) that guard all file I/O.

Purpose: Every CRUD route in Phase 2 calls readDb() or mutateDb(). Getting the mutex pattern and atomic write pattern correct here means every consumer inherits safety automatically — there is no way to accidentally bypass the lock or write a torn file.
Output: server/src/storage/mutex.ts (singleton) and server/src/storage/index.ts (readDb + mutateDb with writeFileAtomic and DATA_FILE env var).
</objective>

<execution_context>
@.github/get-shit-done/workflows/execute-plan.md
@.github/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/REQUIREMENTS.md
@.planning/research/STACK.md
@.planning/research/ARCHITECTURE.md
@.planning/research/PITFALLS.md
@.planning/phases/01-data-foundation/01-CONTEXT.md
@.planning/phases/01-data-foundation/01-PATTERNS.md

<interfaces>
<!-- Contracts created in Plan 01-2 that this plan consumes -->

From server/src/models/index.ts:
```typescript
export interface Database {
  categories: Category[]
  assets: Asset[]
  dataPoints: DataPoint[]
}
```

<!-- API this plan creates for Plan 01-4 (bootstrap) to consume -->

This plan exports:
```typescript
export const DB_PATH: string                                         // process.env.DATA_FILE ?? '/data/database.yaml'
export async function readDb(): Promise<Database>                    // mutex-guarded read
export async function mutateDb(fn: (db: Database) => Database): Promise<void>  // mutex-guarded atomic write
```

<!-- Singleton pattern — the ONLY correct mutex import pattern -->
From server/src/storage/mutex.ts (to be created):
```typescript
import { Mutex } from 'async-mutex'
// DO NOT instantiate Mutex anywhere else in the codebase
export const dbMutex = new Mutex()
```
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create singleton mutex module</name>
  <files>server/src/storage/mutex.ts</files>

  <read_first>
    - server/src/storage/ — confirm directory exists (create it if not: mkdir -p server/src/storage)
    - server/node_modules/async-mutex — confirm package is installed
    - .planning/research/ARCHITECTURE.md — Anti-Pattern 3 (Multiple Mutex Instances) to understand why singleton matters
  </read_first>

  <action>
First create the storage directory if it does not exist:
```bash
mkdir -p server/src/storage
```

Create `server/src/storage/mutex.ts` with EXACT content:

```typescript
import { Mutex } from 'async-mutex'

// Singleton mutex — the ONLY Mutex instance in the entire server.
// DO NOT instantiate new Mutex() anywhere else in the codebase.
// Each Mutex instance has its own independent queue; multiple instances provide zero mutual exclusion.
export const dbMutex = new Mutex()
```

This file is intentionally tiny. Its sole purpose is to own the one `new Mutex()` call so that every
consumer imports the same instance and they all share the same queue.

CRITICAL: Search the entire server/src/ directory after completion to confirm there is no other
`new Mutex()` call:
```bash
grep -r 'new Mutex()' server/src/
```
Expected output: exactly one match — the line in mutex.ts. If any other file shows up, remove it.
  </action>

  <verify>
    <automated>
      grep 'export const dbMutex = new Mutex()' server/src/storage/mutex.ts \
        && test "$(grep -rc 'new Mutex()' server/src/)" = "server/src/storage/mutex.ts:1" \
        && cd server && npx tsc --noEmit \
        && echo "PASS: singleton mutex correct, no duplicate instances"
    </automated>
  </verify>

  <acceptance_criteria>
    - `grep 'export const dbMutex = new Mutex()' server/src/storage/mutex.ts` exits 0
    - `grep -rc 'new Mutex()' server/src/` outputs exactly one match in mutex.ts — no other file has it
    - `cd server && npx tsc --noEmit` exits 0
  </acceptance_criteria>
</task>

<task type="auto">
  <name>Task 2: Implement readDb and mutateDb with atomic writes and DATA_FILE env</name>
  <files>server/src/storage/index.ts</files>

  <read_first>
    - server/src/storage/mutex.ts — just created; import dbMutex from here
    - server/src/models/index.ts — Database interface used as return type of readDb and argument to fn in mutateDb
    - .planning/phases/01-data-foundation/01-CONTEXT.md — Decision D-01 (crash on corrupt YAML)
    - .planning/research/PITFALLS.md — Pitfall 1 (non-atomic writes) and Pitfall 2 (concurrent race)
    - .planning/phases/01-data-foundation/01-PATTERNS.md — storage/index.ts pattern section (DATA_FILE vs DATA_DIR note)
  </read_first>

  <action>
Create `server/src/storage/index.ts` with EXACT content:

```typescript
import { readFile } from 'node:fs/promises'
import { parse, stringify } from 'yaml'
import writeFileAtomic from 'write-file-atomic'
import { dbMutex } from './mutex.js'
import type { Database } from '../models/index.js'

// STOR-04: configurable via DATA_FILE env var, default is /data/database.yaml
export const DB_PATH = process.env.DATA_FILE ?? '/data/database.yaml'

// Read the full database under the mutex.
// If the file cannot be parsed (corrupt YAML), crash with a clear error (Decision D-01).
export async function readDb(): Promise<Database> {
  return dbMutex.runExclusive(async () => {
    const raw = await readFile(DB_PATH, 'utf8')
    try {
      return parse(raw) as Database
    } catch (err) {
      console.error(
        `Error: Failed to parse database at ${DB_PATH}: ${(err as Error).message}`
      )
      process.exit(1)
    }
  })
}

// Apply a pure mutation function to the database under the mutex with an atomic write.
// fn receives the current Database, returns the updated Database.
// writeFileAtomic writes to a temp file then renames atomically (POSIX rename(2)) — STOR-03.
// runExclusive serialises all concurrent callers so reads never race with writes — STOR-02.
export async function mutateDb(fn: (db: Database) => Database): Promise<void> {
  await dbMutex.runExclusive(async () => {
    const raw = await readFile(DB_PATH, 'utf8')
    let db: Database
    try {
      db = parse(raw) as Database
    } catch (err) {
      console.error(
        `Error: Failed to parse database at ${DB_PATH}: ${(err as Error).message}`
      )
      process.exit(1)
    }
    const updated = fn(db)
    // writeFileAtomic writes to .tmp then renames — never writes directly to DB_PATH
    await writeFileAtomic(DB_PATH, stringify(updated, { lineWidth: 0 }))
  })
}
```

CRITICAL rules enforced by this implementation:
1. `process.env.DATA_FILE` — the env var name is DATA_FILE, NOT DATA_DIR (STOR-04 is authoritative)
2. `writeFileAtomic` — never `await writeFile(DB_PATH, ...)` directly (STOR-03)
3. All reads and writes go through `dbMutex.runExclusive` — never call readFile outside the lock (STOR-02)
4. Corrupt YAML → `process.exit(1)` with human-readable message — not silent empty state (D-01)
5. Import extensions use `.js` — NodeNext module resolution requirement

After creating the file, run TypeScript compile check:
```bash
cd server && npx tsc --noEmit
```
Fix any errors before marking complete.
  </action>

  <verify>
    <automated>
      grep "process.env.DATA_FILE" server/src/storage/index.ts \
        && grep "'/data/database.yaml'" server/src/storage/index.ts \
        && grep "dbMutex.runExclusive" server/src/storage/index.ts \
        && grep "writeFileAtomic" server/src/storage/index.ts \
        && grep "export async function readDb" server/src/storage/index.ts \
        && grep "export async function mutateDb" server/src/storage/index.ts \
        && grep "export const DB_PATH" server/src/storage/index.ts \
        && grep "process.exit(1)" server/src/storage/index.ts \
        && ! grep -n "writeFile(DB_PATH" server/src/storage/index.ts \
        && cd server && npx tsc --noEmit \
        && echo "PASS: storage layer correct"
    </automated>
  </verify>

  <acceptance_criteria>
    - `grep "process.env.DATA_FILE" server/src/storage/index.ts` exits 0 — uses DATA_FILE, not DATA_DIR
    - `grep "'/data/database.yaml'" server/src/storage/index.ts` exits 0 — correct default path
    - `grep "dbMutex.runExclusive" server/src/storage/index.ts` matches at least 2 lines (readDb AND mutateDb)
    - `grep "writeFileAtomic" server/src/storage/index.ts` exits 0 — atomic write in use
    - `grep -n "writeFile(DB_PATH" server/src/storage/index.ts` exits non-zero — NO direct write to target path
    - `grep "process.exit(1)" server/src/storage/index.ts` exits 0 — corrupt YAML causes crash
    - `grep "export const DB_PATH" server/src/storage/index.ts` exits 0 — path exported for bootstrap
    - `cd server && npx tsc --noEmit` exits 0
  </acceptance_criteria>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| filesystem → server | YAML file read from mounted volume; content not yet validated against schema |
| concurrent requests → storage | Multiple async HTTP handlers may call readDb/mutateDb simultaneously |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-01-07 | Tampering | database.yaml write path | mitigate | writeFileAtomic uses temp+rename pattern; a crash mid-write leaves .tmp file, never a partial DB_PATH |
| T-01-08 | Tampering | Concurrent read-modify-write | mitigate | dbMutex.runExclusive serialises all storage ops; impossible for two handlers to interleave writes |
| T-01-09 | Denial of Service | Corrupt YAML at startup | mitigate | readDb crashes with process.exit(1) + human-readable message (D-01); prevents silent data corruption |
| T-01-10 | Elevation of Privilege | DATA_FILE env var pointing outside /data | accept | Trusted deployer sets env vars; no user input reaches DATA_FILE at this phase |
| T-01-11 | Tampering | Multiple Mutex instances | mitigate | Singleton enforced in mutex.ts with comment; grep verification in CI catches accidental duplication |
</threat_model>

<verification>
1. `grep "process.env.DATA_FILE" server/src/storage/index.ts` — STOR-04 correct env var name
2. `grep "dbMutex.runExclusive" server/src/storage/index.ts | wc -l` — should be ≥ 2 (both functions)
3. `grep "writeFileAtomic" server/src/storage/index.ts` — STOR-03 atomic write in use
4. `grep -c "writeFile(DB_PATH" server/src/storage/index.ts` — should be 0 (no direct writes)
5. `grep -rc "new Mutex()" server/src/` — should match exactly mutex.ts:1 (singleton enforced)
6. `cd server && npx tsc --noEmit` — TypeScript clean
</verification>

<success_criteria>
- server/src/storage/mutex.ts exports dbMutex as the sole Mutex instance in server/src/
- server/src/storage/index.ts exports readDb(), mutateDb(), DB_PATH
- Both readDb and mutateDb wrap their operations in dbMutex.runExclusive (STOR-02)
- mutateDb uses writeFileAtomic — zero direct fs.writeFile(DB_PATH) calls (STOR-03)
- DB_PATH reads from process.env.DATA_FILE defaulting to '/data/database.yaml' (STOR-04)
- Corrupt YAML in either function triggers process.exit(1) with a human-readable error (D-01)
- `npx tsc --noEmit` exits 0
</success_criteria>

<output>
After completion, create `.planning/phases/01-data-foundation/01-3-SUMMARY.md`
</output>
