---
phase: 01-data-foundation
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - cmd/server/main.go
  - go.mod
  - server/package.json
  - server/tsconfig.json
  - server/src/index.ts
autonomous: true
requirements:
  - STOR-04
must_haves:
  truths:
    - "cmd/ directory does not exist in repo root"
    - "go.mod does not exist in repo root"
    - "server/package.json has \"type\": \"module\""
    - "server/tsconfig.json has \"module\": \"NodeNext\" and \"strict\": true"
    - "GET /api/v1/health returns {\"status\":\"ok\"} with 200"
    - "cd server && npx tsc --noEmit exits 0"
  artifacts:
    - path: "server/package.json"
      provides: "Node.js project config with ESM, all runtime deps at pinned versions"
    - path: "server/tsconfig.json"
      provides: "TypeScript config: NodeNext module, strict, ES2022 target"
    - path: "server/src/index.ts"
      provides: "Hono app entry point with /api/v1/health endpoint, PORT env var"
  key_links:
    - from: "server/src/index.ts"
      to: "@hono/node-server"
      via: "serve({ fetch: app.fetch, port: PORT })"
      pattern: "serve\\(\\{ fetch: app\\.fetch"
---

<objective>
Remove the Go scaffold and initialize the Node.js/Hono backend project that replaces it.

Purpose: Every subsequent plan (models, storage, bootstrap, API routes) depends on this project scaffold existing. Without it there is no TypeScript project to add files to.
Output: server/ directory with package.json, tsconfig.json, installed node_modules, and a minimal Hono entry point serving GET /api/v1/health.
</objective>

<execution_context>
@.github/get-shit-done/workflows/execute-plan.md
@.github/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@.planning/phases/01-data-foundation/01-CONTEXT.md
@.planning/phases/01-data-foundation/01-PATTERNS.md

<interfaces>
<!-- Patterns to mirror — extracted from codebase -->

From web/package.json (mirror "type": "module" and private/version conventions):
```json
{
  "name": "wealthtrack-web",
  "private": true,
  "version": "0.1.0",
  "type": "module"
}
```

From web/tsconfig.json (copy strict options verbatim):
```json
"strict": true,
"noUnusedLocals": true,
"noUnusedParameters": true,
"noFallthroughCasesInSwitch": true
```

From cmd/server/main.go (structural analog — PORT env + health endpoint):
```go
port := os.Getenv("PORT")
if port == "" { port = "8080" }
mux.HandleFunc("/api/v1/health", func(w http.ResponseWriter, r *http.Request) {
    w.Header().Set("Content-Type", "application/json")
    _, _ = w.Write([]byte(`{"status":"ok"}`))
})
```
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Delete Go scaffold and create server/ project</name>
  <files>cmd/server/main.go, go.mod, server/package.json, server/tsconfig.json</files>

  <read_first>
    - web/package.json — mirror "type": "module", "private": true, "version": "0.1.0" conventions
    - web/tsconfig.json — copy strict/noUnusedLocals/noUnusedParameters/noFallthroughCasesInSwitch verbatim
    - cmd/server/main.go — understand what is being replaced (then delete it)
    - go.mod — confirm it's the Go module file before deleting
  </read_first>

  <action>
1. Delete the Go scaffold:
   - `rm -rf cmd/` (removes cmd/server/main.go and the cmd/server/ directory)
   - `rm go.mod`
   - Do NOT touch Dockerfile — Phase 8 scope.

2. Create `server/` directory and `server/src/` subdirectory.

3. Create `server/package.json` with EXACT content:
```json
{
  "name": "wealthtrack-server",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js"
  },
  "dependencies": {
    "@hono/node-server": "^2.0.0",
    "@hono/zod-validator": "^0.7.0",
    "async-mutex": "^0.5.0",
    "hono": "^4.12.14",
    "write-file-atomic": "^7.0.1",
    "yaml": "^2.8.3",
    "zod": "^3.24.4"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "@types/write-file-atomic": "^4.0.3",
    "tsx": "^4.21.0",
    "typescript": "^5.8.3"
  }
}
```

4. Create `server/tsconfig.json` with EXACT content (NodeNext for ESM, no DOM lib, outDir for production build):
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022"],
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "outDir": "dist",
    "rootDir": "src",
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "esModuleInterop": true,
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "forceConsistentCasingInFileNames": true
  },
  "include": ["src"],
  "exclude": ["node_modules", "dist"]
}
```

5. Run `cd server && npm install` to install all dependencies from package.json.

   CRITICAL — `"module": "NodeNext"` requires `.js` extension on ALL local imports at runtime:
   - ✅ `import { foo } from './bar.js'`
   - ❌ `import { foo } from './bar'`  ← fails at Node.js runtime
  </action>

  <verify>
    <automated>
      test ! -d cmd && test ! -f go.mod \
        && grep '"type": "module"' server/package.json \
        && grep '"hono": "\^4' server/package.json \
        && grep '"async-mutex"' server/package.json \
        && grep '"write-file-atomic"' server/package.json \
        && grep '"NodeNext"' server/tsconfig.json \
        && grep '"strict": true' server/tsconfig.json \
        && ls server/node_modules/hono \
        && ls server/node_modules/async-mutex \
        && ls server/node_modules/write-file-atomic \
        && echo "PASS: scaffold removed, server project initialized"
    </automated>
  </verify>

  <acceptance_criteria>
    - `cmd/` directory does not exist: `test ! -d cmd` exits 0
    - `go.mod` does not exist: `test ! -f go.mod` exits 0
    - `server/package.json` contains `"type": "module"`: `grep '"type": "module"' server/package.json` exits 0
    - `server/tsconfig.json` contains `"module": "NodeNext"`: `grep '"NodeNext"' server/tsconfig.json` exits 0
    - `server/tsconfig.json` contains `"strict": true`: `grep '"strict": true' server/tsconfig.json` exits 0
    - `server/node_modules/hono` directory exists
    - `server/node_modules/async-mutex` directory exists
    - `server/node_modules/write-file-atomic` directory exists
  </acceptance_criteria>
</task>

<task type="auto">
  <name>Task 2: Create Hono entry point with health endpoint</name>
  <files>server/src/index.ts</files>

  <read_first>
    - server/package.json — confirm "type": "module" is set and hono + @hono/node-server are listed
    - server/tsconfig.json — confirm "module": "NodeNext" for import resolution rules
  </read_first>

  <action>
Create `server/src/index.ts` with EXACT content:

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

Notes:
- Top-level await is NOT used yet — bootstrap (Plan 01-4) will add that.
- `serve()` is from `@hono/node-server` — not from `hono` core.
- PORT defaults to 8080 to match the Go scaffold (mirrors cmd/server/main.go).
- This file will be MODIFIED in Plan 01-4 to add `await bootstrapDatabase()` before `serve()`.

After creating the file, verify TypeScript compiles cleanly:
```
cd server && npx tsc --noEmit
```
Fix any TypeScript errors before marking task complete.
  </action>

  <verify>
    <automated>
      grep "import { Hono } from 'hono'" server/src/index.ts \
        && grep "import { serve } from '@hono/node-server'" server/src/index.ts \
        && grep "api/v1/health" server/src/index.ts \
        && grep "status: 'ok'" server/src/index.ts \
        && grep "process.env.PORT" server/src/index.ts \
        && cd server && npx tsc --noEmit \
        && echo "PASS: index.ts valid, tsc clean"
    </automated>
  </verify>

  <acceptance_criteria>
    - `server/src/index.ts` imports Hono from 'hono': `grep "from 'hono'" server/src/index.ts` exits 0
    - `server/src/index.ts` imports serve from '@hono/node-server': `grep "from '@hono/node-server'" server/src/index.ts` exits 0
    - `server/src/index.ts` has `/api/v1/health` route returning `{ status: 'ok' }`: both greps exit 0
    - `cd server && npx tsc --noEmit` exits 0 with no error output
  </acceptance_criteria>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| env → process | DATA_FILE, PORT env vars set by deployer |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-01-01 | Tampering | server/package.json | mitigate | Pin exact major versions with ^ to prevent surprise upgrades; lock via package-lock.json |
| T-01-02 | Information Disclosure | PORT env var | accept | No sensitive data; port is infrastructure config set by trusted deployer |
| T-01-03 | Denial of Service | /api/v1/health | accept | Phase 1 has no auth — single-household deployment trusted at network level |
</threat_model>

<verification>
All verifications are automated and runnable:
1. `test ! -d cmd && test ! -f go.mod` — Go scaffold is gone
2. `grep '"type": "module"' server/package.json` — ESM enabled
3. `grep '"NodeNext"' server/tsconfig.json` — correct module resolution
4. `cd server && npx tsc --noEmit` — TypeScript compiles cleanly
5. Manual smoke test: `cd server && npm run dev` → `curl http://localhost:8080/api/v1/health` returns `{"status":"ok"}`
</verification>

<success_criteria>
- Go scaffold (cmd/, go.mod) deleted from repository
- server/ project created with correct package.json (ESM, all 7 runtime deps at specified versions)
- server/tsconfig.json uses NodeNext module resolution, strict mode, ES2022 target
- server/src/index.ts is a working Hono app serving GET /api/v1/health → {"status":"ok"}
- `npx tsc --noEmit` passes with zero errors
</success_criteria>

<output>
After completion, create `.planning/phases/01-data-foundation/01-1-SUMMARY.md`
</output>
