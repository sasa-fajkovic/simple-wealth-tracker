# Domain Pitfalls

**Domain:** Self-hosted personal finance / wealth tracker (Node.js + YAML + React + Recharts)
**Researched:** 2025-01-22
**Stack:** Node.js backend · YAML flat-file storage · React + TypeScript · Recharts · Vite · Docker multi-stage

---

## Critical Pitfalls

Mistakes that cause data loss, silent incorrect results, or unrunnable containers.

---

### Pitfall 1: Non-Atomic YAML Writes → File Corruption on Crash

**What goes wrong:**
`fs.writeFileSync(path, yaml.dump(data))` **truncates the file first**, then writes. If the Node.js process is killed (OOM, SIGKILL, power loss, Docker stop) between truncation and completion, the file is left empty or partially written. All user data is gone.

**Why it happens:**
`writeFileSync` is atomic at the JavaScript level (synchronous call) but not at the OS level. The OS write syscall involves a truncate + sequential page writes — a crash window exists.

**Consequences:**
- `database.yaml` becomes a 0-byte or invalid YAML file
- Server fails to start on next boot; all wealth history lost
- No error visible until reboot — the write appeared to succeed

**Prevention:**
Use the write-to-temp + `fs.renameSync` pattern. `rename(2)` is guaranteed atomic on POSIX (single filesystem):

```typescript
import { writeFileSync, renameSync } from 'fs';
import { randomUUID } from 'crypto';
import { dump } from 'js-yaml';
import path from 'path';

function atomicWrite(filePath: string, data: unknown): void {
  const tmp = filePath + '.tmp.' + randomUUID();
  writeFileSync(tmp, dump(data), 'utf8');
  renameSync(tmp, filePath);           // atomic on POSIX; safe on same filesystem
}
```

Alternatively, use the `write-file-atomic` npm package (`npm install write-file-atomic`) which implements this pattern and also handles `fsync` for durability.

**Warning signs:**
- Tests that kill the process mid-write and check file integrity
- Any `writeFileSync` directly to the final path in storage layer code

**Phase:** Data models + YAML storage layer (task 2)

---

### Pitfall 2: Concurrent Request Race Condition on YAML File

**What goes wrong:**
Two simultaneous requests both `readFileSync` → deserialize → modify in memory → `writeFileSync`. The second write clobbers the first. In a single-user self-hosted app this is rare but possible during fast form submissions or retry logic.

**Why it happens:**
Node.js is single-threaded for JavaScript but async I/O means two in-flight HTTP handlers can interleave their file read/write operations if any `await` occurs between read and write.

**Consequences:**
- A data point update silently disappears
- Category added by one request is lost when another request writes its stale snapshot
- No error thrown; data loss is invisible

**Prevention:**
Wrap all read-modify-write operations in a single async mutex. Use `async-mutex` (`npm install async-mutex`):

```typescript
import { Mutex } from 'async-mutex';

const fileMutex = new Mutex();

async function updateDatabase(mutate: (db: Database) => void): Promise<void> {
  await fileMutex.runExclusive(async () => {
    const db = readDatabase();   // read inside the lock
    mutate(db);
    atomicWrite(DB_PATH, db);    // write inside the lock
  });
}
```

Never read outside the mutex and pass data in.

**Warning signs:**
- Any `readFileSync`/`writeFileSync` pair without a surrounding mutex
- Storage functions that are not wrapped in a single lock scope

**Phase:** Data models + YAML storage layer (task 2)

---

### Pitfall 3: `new Date().toISOString()` for Month Keys → Timezone Off-by-One

**What goes wrong:**
Constructing month keys (e.g. `"2024-01"`) using `new Date(year, month, day).toISOString().slice(0, 7)` returns the **UTC** date, which shifts to the previous month for any server/user in UTC+1 or higher timezone. Verified empirically: `new Date(2024, 0, 1).toISOString()` → `"2023-12"` in UTC+1.

**Why it happens:**
`new Date(year, month, day)` constructs a local-time Date. `.toISOString()` converts to UTC before formatting. Midnight local = prior evening UTC in positive-offset timezones.

**Consequences:**
- Data point stored under `"2023-12"` instead of `"2024-01"`
- Chart shows data one month off; LOCF gap-fill produces wrong totals
- Bug is timezone-dependent: works on UTC servers, fails for all others

**Prevention:**
Always construct month keys from integer parts directly:

```typescript
function toMonthKey(year: number, month: number): string {
  // month is 1-indexed (1 = January)
  return `${year}-${String(month).padStart(2, '0')}`;
}

// From a Date object (safe):
function dateToMonthKey(d: Date): string {
  return toMonthKey(d.getFullYear(), d.getMonth() + 1);
}

// NEVER: new Date(y, m, 1).toISOString().slice(0, 7)  ← timezone trap
```

**Warning signs:**
- Any `.toISOString()` call used to generate storage keys
- Tests that only run in UTC (CI timezone) but miss local timezone offset bugs

**Phase:** Data models + YAML storage layer (task 2), Summary aggregation endpoint (task 3)

---

### Pitfall 4: LOCF Off-by-One — Wrong First Month and Boundary Handling

**What goes wrong:**
Three distinct errors cluster in LOCF implementations:

1. **Before-first-data carry**: Months before an asset's first ever data point should be `0`, not the first known value. Carrying forward "nothing" is not the same as carrying the first value backward.
2. **Range start exclusive**: When building month range `[rangeStart, today]`, including or excluding the current partial month can make the last bar in the chart visually wrong.
3. **Month iteration overflow**: Iterating months with `new Date(year, month + n, 1)` where `month + n > 11` silently rolls into the next year (JS months 0-indexed, 0-11). `new Date(2024, 12, 1)` is January 2025.

**Concrete example of error 1:**
```
Asset created in March. Range is Jan–Jun.
Wrong LOCF: Jan=1000, Feb=1000, Mar=1000 (carries March value backward)
Correct:    Jan=0,    Feb=0,    Mar=1000, Apr=1000, May=1000, Jun=1000
```

**Prevention:**

```typescript
function buildMonthRange(startKey: string, endKey: string): string[] {
  const months: string[] = [];
  let [y, m] = startKey.split('-').map(Number);
  const [ey, em] = endKey.split('-').map(Number);
  while (y < ey || (y === ey && m <= em)) {
    months.push(toMonthKey(y, m));
    m++;
    if (m > 12) { m = 1; y++; }   // explicit overflow, not new Date()
  }
  return months;
}

function locf(months: string[], dataPoints: Record<string, number>): Record<string, number> {
  let lastKnown: number | null = null;   // null = no prior value yet
  const result: Record<string, number> = {};
  for (const month of months) {
    if (month in dataPoints) lastKnown = dataPoints[month];
    result[month] = lastKnown ?? 0;      // 0 before first data point
  }
  return result;
}
```

**Warning signs:**
- LOCF producing non-zero values in months before an asset's `created_at`
- Chart range that includes months well before any data showing non-zero values
- Month iteration using `new Date(y, m + i, 1)` in a loop

**Phase:** Summary aggregation endpoint (task 3)

---

### Pitfall 5: Wrong Monthly Compound Rate Formula

**What goes wrong:**
Using `monthlyRate = annualRate / 12` (simple division) instead of the correct compound conversion. This silently produces wrong projections that diverge from the true compounded result, especially for rates above 5% and horizons beyond 5 years.

**Verified numeric impact:**
```
Annual rate: 7%
Wrong monthly rate:   0.5833%  → after 12 months = 1.0723 (+7.23%, not 7%)
Correct monthly rate: 0.5654%  → after 12 months = 1.0700 (+7.00%, exact)
```
Over 10 years, simple division overestimates by ~2% of final value — misleading for planning.

**Why it happens:**
Simple division is the intuitive approximation. The correct formula is `(1 + annualRate)^(1/12) - 1`, which is less obvious.

**Prevention:**
```typescript
/** Convert an annual growth rate to its equivalent monthly compound rate.
 *  annualRate: decimal (e.g. 0.07 for 7%)
 *  Returns: monthly decimal rate
 */
function annualToMonthlyRate(annualRate: number): number {
  return Math.pow(1 + annualRate, 1 / 12) - 1;
}

/** Project value N months forward using compound growth. */
function projectValue(currentValue: number, annualRate: number, months: number): number {
  const r = annualToMonthlyRate(annualRate);
  return currentValue * Math.pow(1 + r, months);
}
```

**Warning signs:**
- Any `rate / 12` expression in projection code
- Projection tests that only check 1-month ahead (where the error is negligible)
- Tests that use 0% and 100% rates (where division error is obvious) but not 7% for 10 years

**Phase:** Projections calculation endpoint (task 4)

---

### Pitfall 6: Recharts Dynamic `dataKey` with User-Defined Category Names

**What goes wrong:**
Two failure modes when category names are used directly as Recharts `dataKey` props:

1. **Dot notation path parsing**: Recharts interprets `dataKey` values containing `.` as nested object paths. A category named `"Real Estate"` is fine, but `"U.S. Stocks"` will try to access `data["U"]["S"]["Stocks"]` → `undefined` → series renders as zero/empty silently.
2. **Key instability on re-render**: If `dataKey` changes identity (e.g., built from `category.name` which changed) between renders, Recharts unmounts and remounts the series, resetting animations and occasionally producing ghost lines.

**Why it happens:**
Recharts uses `dataKey` both as the object property accessor and as the React `key` for series reconciliation. User-defined strings are unpredictable.

**Prevention:**
Use stable category IDs (UUIDs or slugs) as `dataKey`. Map display names only in the `Legend` `formatter` and `Tooltip` `formatter`:

```tsx
const categoryMap = new Map(categories.map(c => [c.id, c.name]));

// Data shape: { month: '2024-01', 'cat-uuid-1': 1000, 'cat-uuid-2': 2000 }
{categories.map(cat => (
  <Area
    key={cat.id}
    dataKey={cat.id}                        // stable UUID, no dots
    name={cat.name}                         // used by default Tooltip
    stackId="wealth"
  />
))}

<Legend
  formatter={(value) => categoryMap.get(value) ?? value}
/>
```

**Warning signs:**
- `dataKey={category.name}` anywhere in chart components
- Category names containing `.` (common: `U.S.`, `N.A.`, acronyms)
- Series that render as flat zero despite having data

**Phase:** Frontend dashboard chart (task 7), Projections screen (task 8)

---

### Pitfall 7: Wrong Distroless Image — Node.js Runtime Missing in Container

**What goes wrong:**
The current Dockerfile scaffold uses `gcr.io/distroless/base-debian12` as the final runtime stage. This image contains **no Node.js binary**. The container builds successfully, copies the server bundle in, then fails immediately at startup with `exec format error` or `no such file or directory` for the `node` executable.

**Why it happens:**
`distroless/base` is a bare minimal Linux layer — appropriate for Go/Rust static binaries. Node.js requires a JavaScript runtime. The correct image is `gcr.io/distroless/nodejs20-debian12`.

**Verified:** Current `Dockerfile` line 12: `FROM gcr.io/distroless/base-debian12` — needs changing.

**Prevention:**
```dockerfile
# Stage 1: build frontend
FROM node:20-alpine AS web-build
WORKDIR /web
COPY web/package*.json ./
RUN npm ci
COPY web/ .
RUN npm run build

# Stage 2: build backend (if using Go; for Node.js backend, skip this)
# For Node.js backend - install production deps only
FROM node:20-alpine AS api-build
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY src/ ./src/

# Stage 3: runtime — MUST use nodejs distroless, NOT base
FROM gcr.io/distroless/nodejs20-debian12
WORKDIR /app
COPY --from=api-build /app/node_modules ./node_modules
COPY --from=api-build /app/src ./src
COPY --from=web-build /web/dist ./public
CMD ["/app/src/index.js"]
```

**Warning signs:**
- `FROM gcr.io/distroless/base-debian12` or `FROM gcr.io/distroless/static` in a Node.js service
- Container exits immediately with code 1 or 127 after `docker-compose up`

**Phase:** Docker multi-stage build (task 10)

---

## Moderate Pitfalls

---

### Pitfall 8: Docker Volume Permission Mismatch → EACCES on Data Directory

**What goes wrong:**
The Docker volume for `database.yaml` is mounted as root-owned (uid 0). The Node.js process running as a non-root user (recommended) cannot write to the data file. Server starts but all write operations fail with `EACCES: permission denied`.

**Prevention:**
Declare the data directory as a `VOLUME` in the Dockerfile and document `chown` in docker-compose:

```yaml
# docker-compose.yml
services:
  app:
    volumes:
      - ./data:/app/data
    user: "1000:1000"          # match the UID of the node user in the image

# In Dockerfile, create the directory and set ownership before switching user:
# RUN mkdir -p /app/data && chown -R node:node /app/data
# USER node
```

Alternatively, initialize the data directory in the container entrypoint with a startup check.

**Warning signs:**
- `EACCES` errors only appearing in Docker but not in local development
- `data/` directory permissions shown as `drwxr-xr-x root root` after `docker-compose up`

**Phase:** Docker multi-stage build (task 10)

---

### Pitfall 9: Missing Referential Integrity on Delete → Orphaned Data

**What goes wrong:**
Without a relational database enforcing foreign-key constraints, deleting a category silently leaves all its assets in the YAML file. Deleting an asset leaves its data points. These orphans consume storage and can cause `undefined` dereferences when aggregation code tries to find a category by ID.

**Prevention:**
Enforce referential integrity in the service layer, not just the API handler:

```typescript
function deleteCategory(id: string, db: Database): void {
  const hasAssets = db.assets.some(a => a.categoryId === id);
  if (hasAssets) {
    throw new Error(`CONSTRAINT_VIOLATION: category ${id} has assets`); // → HTTP 409
  }
  db.categories = db.categories.filter(c => c.id !== id);
}

function deleteAsset(id: string, db: Database): void {
  const hasPoints = db.dataPoints.some(dp => dp.assetId === id);
  if (hasPoints) {
    throw new Error(`CONSTRAINT_VIOLATION: asset ${id} has data points`); // → HTTP 409
  }
  db.assets = db.assets.filter(a => a.id !== id);
}
```

Return `409 Conflict` with a human-readable message to the frontend (not 500).

**Warning signs:**
- `DELETE /categories/:id` endpoint that doesn't query `assets` first
- Aggregation code throwing `Cannot read property 'name' of undefined` after a delete

**Phase:** CRUD API (task 3)

---

### Pitfall 10: YAML `dump()` Serializing JavaScript Dates as YAML Timestamps

**What goes wrong:**
`js-yaml`'s `dump()` function serializes JavaScript `Date` objects as YAML `!!timestamp` nodes (e.g. `2024-01-15T10:30:00.000Z`). When loaded back with `load()`, these become `Date` objects in memory — fine. But if you store `updated_at` as an ISO string and it gets accidentally converted to a `Date` somewhere in the pipeline, `dump()` will write it as a timestamp and `load()` will restore it as a `Date` object, breaking string comparisons (`"2024-01" !== Date`).

**Prevention:**
Store all date/time values as ISO strings explicitly. Use `schema: yaml.JSON_SCHEMA` option in `js-yaml` to disable implicit YAML typing, or use the `eemeli/yaml` library with `{ version: '1.1' }` options. Validate your schema types on load:

```typescript
import yaml from 'js-yaml';

const db = yaml.load(raw, { schema: yaml.JSON_SCHEMA }) as Database;
// JSON_SCHEMA prevents timestamp/null/bool coercion surprises
```

**Warning signs:**
- `typeof db.assets[0].updatedAt === 'object'` instead of `string`
- Sorting or string comparisons on date fields producing wrong order

**Phase:** Data models + YAML storage layer (task 2)

---

### Pitfall 11: Recharts `ResponsiveContainer` with Zero-Height Parent → Chart Invisible

**What goes wrong:**
`<ResponsiveContainer width="100%" height="100%">` requires the **parent element** to have an explicit height in CSS. If the parent's height is `auto` or `0` (common in flex layouts without `flex: 1`), the chart renders with 0px height — completely invisible. No error is thrown.

**Prevention:**
Always use a fixed pixel height or ensure the parent has a computed height:

```tsx
// Safe: explicit pixel height
<ResponsiveContainer width="100%" height={400}>

// Safe: parent has explicit height
<div style={{ height: '400px' }}>
  <ResponsiveContainer width="100%" height="100%">

// Dangerous: parent is flex item without height
<div className="flex flex-col">  {/* no h-[400px] */}
  <ResponsiveContainer width="100%" height="100%">  {/* renders at 0px */}
```

**Warning signs:**
- Chart area renders but no lines/bars visible, no console errors
- Chart visible in Storybook (fixed height) but invisible on the actual page

**Phase:** Frontend dashboard chart (task 7)

---

## Minor Pitfalls

---

### Pitfall 12: YAML File Bootstrap — Server Crashes if File Missing

**What goes wrong:**
If `database.yaml` doesn't exist yet (first run, fresh Docker volume), `fs.readFileSync` throws `ENOENT` and the server crashes before handling any request.

**Prevention:**
Always check for file existence on startup and create an empty-but-valid YAML file if missing:

```typescript
function ensureDatabaseExists(path: string): void {
  if (!existsSync(path)) {
    atomicWrite(path, { categories: [], assets: [], dataPoints: [] });
  }
}
// Call once at server startup, before setting up routes
ensureDatabaseExists(DB_PATH);
```

**Phase:** Data models + YAML storage layer (task 2)

---

### Pitfall 13: Recharts Stacked Area — Missing `stackId` Makes Series Overlap Instead of Stack

**What goes wrong:**
Each `<Area>` component needs the **same** `stackId` string to stack. Omitting it or using different values causes series to overlap each other (drawn independently), which visually looks like a stacked chart on casual inspection but reports wrong totals in tooltips.

**Prevention:**
```tsx
const STACK_ID = 'wealth';
{categories.map(cat => (
  <Area key={cat.id} dataKey={cat.id} stackId={STACK_ID} ... />
))}
```

Test by checking that the tooltip's highest series value equals total net worth, not a single category value.

**Phase:** Frontend dashboard chart (task 7)

---

### Pitfall 14: Projection Chart — Historical and Projected Data Must Share the Same `month` Key Shape

**What goes wrong:**
Historical data uses `{ month: '2024-01', ...categoryValues }`. If projection data uses a different shape (`{ date: '2025-01', ... }` or ISO strings vs `YYYY-MM`), merging them into a single Recharts `data` array causes undefined values and broken chart lines at the historical/projected boundary.

**Prevention:**
Define a single shared data point type used for both historical and projection series. Add a `projected: boolean` field to distinguish segments for styling (dashed line, different opacity):

```typescript
interface ChartPoint {
  month: string;          // always 'YYYY-MM'
  [categoryId: string]: number | string | boolean;
  projected: boolean;
}
```

Use `strokeDasharray` on the `<Area>` based on the `projected` flag via `dot` or custom rendering.

**Phase:** Projections screen (task 8)

---

## Phase-Specific Warnings

| Phase | Topic | Likely Pitfall | Mitigation |
|-------|-------|----------------|------------|
| Task 2 | YAML storage layer | Non-atomic writes → data loss on crash | Use tmp+rename, implement mutex |
| Task 2 | YAML storage layer | `toISOString()` timezone trap for month keys | Use `getFullYear()`/`getMonth()+1` |
| Task 2 | YAML storage layer | `js-yaml` coercing date strings to Date objects | Load with `JSON_SCHEMA` option |
| Task 2 | YAML storage layer | ENOENT crash on first run | Bootstrap empty DB if file missing |
| Task 3 | CRUD API | DELETE without referential integrity check | Guard deletes in service layer |
| Task 3 | Aggregation | LOCF before-first-data carries wrong value (not 0) | Track null state explicitly |
| Task 3 | Aggregation | Month iteration overflow at month 12 | Manual increment with 1-12 range |
| Task 4 | Projections | `annualRate / 12` not `(1+r)^(1/12)-1` | Use `annualToMonthlyRate()` helper |
| Task 7 | Dashboard chart | Category name with `.` breaks Recharts dataKey | Use UUIDs as dataKey |
| Task 7 | Dashboard chart | `ResponsiveContainer` renders at 0px height | Explicit height on parent |
| Task 7 | Dashboard chart | Missing `stackId` → overlap not stack | Same `stackId` on all Area/Bar series |
| Task 8 | Projections chart | Historical/projected data shape mismatch | Single shared `ChartPoint` type |
| Task 10 | Docker | `distroless/base` has no Node.js runtime | Use `distroless/nodejs20-debian12` |
| Task 10 | Docker | Volume mounted as root → EACCES | `chown` data dir to app user |

---

## Sources

- `write-file-atomic` npm package docs (tmp+rename atomic pattern) — HIGH confidence
- `async-mutex` npm package — HIGH confidence
- Node.js `fs.writeFileSync` MDN/Node docs (truncate-then-write semantics) — HIGH confidence
- Verified empirically: `new Date(2024, 0, 1).toISOString()` → `"2023-12"` in UTC+1 — HIGH confidence (reproduced in Node.js)
- Verified empirically: `annualRate / 12` vs `(1+r)^(1/12)-1` divergence — HIGH confidence (reproduced numerically)
- `js-yaml` README: `load()` with `JSON_SCHEMA` option — HIGH confidence (Context7)
- Recharts docs: `dataKey` dot-path behavior — MEDIUM confidence (Context7 + known library behavior)
- `gcr.io/distroless/base-debian12` vs `nodejs20-debian12` — HIGH confidence (verified against current Dockerfile)
