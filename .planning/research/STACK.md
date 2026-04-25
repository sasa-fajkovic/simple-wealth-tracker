# Technology Stack

**Project:** WealthTrack — self-hosted personal net-worth tracker
**Researched:** 2025-07-10
**Confidence:** HIGH (all versions verified via npm registry + Context7 + nodejs.org)

---

## Recommended Stack

### Runtime

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Node.js | 22 LTS ("Jod") | Server runtime | Active LTS since Oct 2024, stable, alpine Docker image available. Node 24 just became LTS but Node 22 has more proven production stability. |

### Backend Framework

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| **Hono** | `^4.12.14` | HTTP framework + REST API | TypeScript-first, zero-dependency core, Web Standards `fetch` API, built-in routing. The `@hono/node-server` adapter runs it on Node.js. Simpler than Fastify for a 5-route API; no plugin registration ceremony. |
| `@hono/node-server` | `^2.0.0` | Hono → Node.js http bridge | Official Node.js adapter; also provides `serveStatic` for serving the Vite build. |

**Why not Express?** Express v5 just shipped but its middleware model is callback-heavy. No TypeScript types in core. Heavier for a 5-route app.

**Why not Fastify?** Fastify v5 is excellent but its plugin/decorator pattern adds boilerplate for a tiny API. Hono achieves the same result with 60% less setup code.

### YAML Storage Layer

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| `yaml` | `^2.8.3` | Parse/stringify `database.yaml` | The definitive YAML 1.2 library for Node.js. Preserves comments and blank lines (useful for hand-editing). Significantly better round-trip fidelity than `js-yaml`. |
| `async-mutex` | `^0.5.0` | Serialise concurrent async writes | Single-process in-process mutex. Prevents read-modify-write races if two HTTP requests arrive simultaneously. Zero external deps. |
| `write-file-atomic` | `^7.0.1` | Atomic YAML file writes | Writes to a temp file then `rename(2)` — the OS-level atomic op. Prevents a crash mid-write from corrupting `database.yaml`. The rename is atomic on Linux/macOS. |

**Combined write pattern (the safe approach for single-file storage):**

```typescript
import { Mutex } from 'async-mutex'
import writeFileAtomic from 'write-file-atomic'
import { parse, stringify } from 'yaml'
import { readFile } from 'node:fs/promises'

const DB_PATH = '/data/database.yaml'
const mutex = new Mutex()

export async function readDb(): Promise<Database> {
  const raw = await readFile(DB_PATH, 'utf8')
  return parse(raw) as Database
}

export async function writeDb(data: Database): Promise<void> {
  // mutex serialises writes within this process
  await mutex.runExclusive(async () => {
    // write-file-atomic ensures no partial write on crash
    await writeFileAtomic(DB_PATH, stringify(data, { lineWidth: 0 }))
  })
}
```

**Why not `proper-lockfile`?** That's for cross-process / cross-machine locking (e.g., two separate Node processes sharing a file). This app is a single process in a single container — `async-mutex` is sufficient and far simpler.

**Why not direct `fs.writeFile`?** A crash between opening and flushing leaves a zero-byte or partial file. `write-file-atomic` eliminates this failure mode entirely.

### Identity

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| `node:crypto` (built-in) | Node.js 22 | UUID v4 generation | `crypto.randomUUID()` is built into Node.js 14.17+. No npm package needed — `import { randomUUID } from 'node:crypto'`. |

**Why not the `uuid` npm package?** It's redundant. The native implementation is cryptographically secure and RFC-4122 compliant.

### Input Validation

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| `zod` | `^3.24.4` | Request body schema validation | TypeScript-first, runtime validation with inferred types. Hono has first-class Zod integration via `@hono/zod-validator`. Single source of truth for API schemas and TypeScript types. |
| `@hono/zod-validator` | `^0.7.0` | Hono middleware binding for Zod | Validates request body/params in route definitions, returns typed `c.req.valid()`. |

### Financial Arithmetic

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| **No library** (store as integers) | — | EUR amounts | **Store all monetary values as integer euro-cents in YAML.** Divide by 100 only at display/serialization time. This avoids floating-point drift entirely without a dependency. Example: `€1,234.56` → `123456`. For a tracker that only sums values, this is sufficient and zero-risk. |

**Why not `decimal.js`?** Overkill for addition and subtraction of whole euro amounts. `decimal.js` is warranted when doing compound interest, FX rate multiplication, or division — none of which this tracker needs.

**Why not `dinero.js`?** v2 introduced a functional-style API that's verbose for simple use. The integer approach is simpler and has zero deps.

### TypeScript Toolchain (Backend)

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| `typescript` | `^5.8.3` | Type checking | Latest stable, required for Zod v3 and Hono types. |
| `tsx` | `^4.21.0` | Dev server (watch mode) | esbuild-powered TypeScript runner. `tsx watch src/index.ts` — no compile step in development. **Do not use `ts-node`** — it's slower, doesn't support ESM well without extra config, and is effectively deprecated. |
| `@types/node` | `^22.0.0` | Node.js type definitions | Matched to Node 22 runtime. |

### Frontend (Existing — No Changes)

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| React | `^18.3.1` | UI framework | Already in place. |
| TypeScript | `^5.5.4` | Type safety | Already in place. |
| Vite | `^5.4.2` | Build tool + dev server | Already in place. |
| Tailwind CSS | `^3.4.10` | Styling | Already in place. |
| react-router-dom | `^6.26.0` | Client routing | Already in place. |
| **Recharts** | `^3.8.1` | Charts (Area, Line, Bar) | Already in place. Recharts v3 supports `AreaChart`, `LineChart`, `BarChart`, all wrapped with `ResponsiveContainer`. Covers 100% of the charts needed for a net-worth tracker. |

**Keep Recharts.** No chart library switch needed. v3.8 is current (verified npm registry 2025-07-10). The `AreaChart` with gradient fills is the canonical net-worth-over-time visualization and Recharts handles it natively.

**Why not Chart.js / react-chartjs-2?** More setup, Canvas-based (less crisp on retina), and imperative config. Recharts' declarative React component model is a better fit.

**Why not Tremor?** v3 + v4 had major API churn. Tremor abstracts too much for custom chart styling.

---

## Infrastructure

### Docker Multi-Stage Build

```dockerfile
# ── Stage 1: Build Vite frontend ─────────────────────────────────────────────
FROM node:22-alpine AS web-builder
WORKDIR /web
COPY web/package*.json ./
RUN npm ci
COPY web/ .
RUN npm run build
# Output: /web/dist

# ── Stage 2: Install backend production dependencies ─────────────────────────
FROM node:22-alpine AS api-deps
WORKDIR /app
COPY api/package*.json ./
RUN npm ci --omit=dev

# ── Stage 3: Final image ──────────────────────────────────────────────────────
FROM node:22-alpine AS final
WORKDIR /app

# Copy compiled backend (tsc output)
COPY --from=api-deps /app/node_modules ./node_modules
COPY api/dist/ ./dist/

# Copy frontend build output into backend's static dir
COPY --from=web-builder /web/dist ./public/

# Persistent data volume mount point
VOLUME ["/data"]

EXPOSE 3000
USER node
CMD ["node", "dist/index.js"]
```

**Key decisions:**
- **`node:22-alpine`** for all stages — Alpine keeps the final image ~180 MB vs ~900 MB for `node:22`. Use the same base in all stages for layer cache reuse.
- **Avoid distroless for Node.js** — `gcr.io/distroless/nodejs22-debian12` has no shell (fine) but is Debian-based and larger than Alpine. Alpine + `USER node` achieves equivalent security.
- **`npm ci --omit=dev`** — installs exact lockfile versions, skips devDependencies. Never `npm install` in a Dockerfile.
- **`tsc` compile in CI/build, not in Docker** — pre-compile TypeScript to `api/dist/` before `docker build`, or add a build stage. Do not run `tsx` in production — it carries esbuild as a runtime dependency.
- **Static file serving** — Hono's `serveStatic` from `@hono/node-server/serve-static` serves the `/app/public/` directory. The backend is a single process serving both the API and the SPA.

### Backend Project Structure

```
api/
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts          # Hono app + serve()
│   ├── routes/
│   │   ├── entries.ts    # CRUD for net-worth entries
│   │   └── accounts.ts   # CRUD for accounts/assets
│   ├── db/
│   │   └── yaml.ts       # readDb / writeDb with mutex
│   └── schemas/
│       └── models.ts     # Zod schemas + inferred types
```

---

## Alternatives Considered

| Category | Recommended | Alternative | Why Not |
|----------|-------------|-------------|---------|
| HTTP framework | Hono 4 | Fastify 5 | Fastify plugin model is great but over-engineered for 5 routes |
| HTTP framework | Hono 4 | Express 5 | Callback-based, no native TypeScript types, older patterns |
| YAML library | `yaml` 2 | `js-yaml` 4 | `js-yaml` drops comments on round-trip; `yaml` v2 has better API |
| Write safety | `async-mutex` + `write-file-atomic` | `proper-lockfile` | `proper-lockfile` is for multi-process locking; overkill for single container |
| UUID | `node:crypto` built-in | `uuid` npm | Native is sufficient; no dep needed |
| Financial math | Integer cents (no lib) | `decimal.js` | App only sums values; decimal precision not needed |
| Chart library | Recharts (keep) | Chart.js | Recharts is already installed; Chart.js is Canvas-based |
| TS runner (dev) | `tsx` | `ts-node` | `ts-node` is slow, ESM support is painful |
| Docker base | `node:22-alpine` | distroless/nodejs | distroless is Debian-based (larger); alpine achieves same security |

---

## Installation

```bash
# Backend (new api/ directory)
npm init -y
npm install hono @hono/node-server @hono/zod-validator zod yaml async-mutex write-file-atomic
npm install -D typescript tsx @types/node

# Frontend (existing web/ — no changes needed)
# Recharts ^3.8.1 already in web/package.json
```

---

## Sources

- Hono Node.js adapter: https://hono.dev/docs/getting-started/nodejs (Context7: `/llmstxt/hono_dev_llms_txt`, HIGH confidence)
- Fastify static serving: https://github.com/fastify/fastify/blob/main/docs/Reference/Middleware.md (Context7: `/fastify/fastify`, HIGH confidence)
- `yaml` package: https://github.com/eemeli/yaml/blob/main/README.md (Context7: `/eemeli/yaml`, HIGH confidence)
- Recharts AreaChart/LineChart: Context7 `/recharts/recharts`, v3.8.1 confirmed HIGH confidence
- Node.js LTS schedule: https://nodejs.org/dist/index.json — Node 22.22.2 "Jod" (LTS), Node 24.15.0 "Krypton" (LTS), HIGH confidence
- `write-file-atomic` v7.0.1, `async-mutex` v0.5.0, `yaml` v2.8.3: npm registry, verified 2025-07-10
- `crypto.randomUUID()`: https://nodejs.org/api/crypto.html#cryptorandomuuidoptions — available since Node 14.17.0, HIGH confidence
- Hono v4.12.14, `@hono/node-server` v2.0.0: npm registry, verified 2025-07-10
- Fastify v5.8.5, Zod v3.24.4: npm registry, verified 2025-07-10
