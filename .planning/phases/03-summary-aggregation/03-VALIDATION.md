---
phase: 3
slug: summary-aggregation
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-23
---

# Phase 3 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Node.js built-in `node:test` + `tsx` (already installed) |
| **Config file** | None — no config file needed for `node:test` |
| **Quick run command** | `node --import tsx/esm --test server/src/calc/*.test.ts` |
| **Full suite command** | `node --import tsx/esm --test server/src/calc/*.test.ts server/src/routes/summary.test.ts` |
| **Estimated runtime** | ~2 seconds |

> No new `npm install` required. `node:test` is built-in to Node 22+. `tsx` is already in devDependencies.

---

## Sampling Rate

- **After every task commit:** Run `node --import tsx/esm --test server/src/calc/*.test.ts`
- **After every plan wave:** Run `node --import tsx/esm --test server/src/calc/*.test.ts`
- **Before verification:** Full suite must be green
- **Max feedback latency:** ~2 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 3-01-01 | 03-1 | 1 | utils | — | N/A | unit | `node --import tsx/esm --test server/src/calc/utils.test.ts` | ❌ W0 | ⬜ pending |
| 3-01-02 | 03-1 | 1 | SUM-03 | — | LOCF boundary: pre-first-dp = 0 | unit | `node --import tsx/esm --test server/src/calc/summary.test.ts` | ❌ W0 | ⬜ pending |
| 3-01-03 | 03-1 | 1 | SUM-02 | — | Upsert: latest updated_at wins | unit | `node --import tsx/esm --test server/src/calc/summary.test.ts` | ❌ W0 | ⬜ pending |
| 3-02-01 | 03-2 | 2 | SUM-01 | — | Unknown range returns 400 | unit | `node --import tsx/esm --test server/src/calc/ranges.test.ts` | ❌ W0 | ⬜ pending |
| 3-02-02 | 03-2 | 2 | SUM-01 | — | Default range 1y when omitted | unit | `node --import tsx/esm --test server/src/calc/ranges.test.ts` | ❌ W0 | ⬜ pending |
| 3-03-01 | 03-3 | 3 | SUM-04 | — | series[].values.length === months.length | unit | `node --import tsx/esm --test server/src/calc/summary.test.ts` | ❌ W0 | ⬜ pending |
| 3-03-02 | 03-3 | 3 | SUM-05 | — | period_delta_pct = 0 when first_total = 0 (no NaN/Infinity) | unit | `node --import tsx/esm --test server/src/calc/summary.test.ts` | ❌ W0 | ⬜ pending |
| 3-03-03 | 03-3 | 3 | SUM-05 | — | pct_of_total values sum to ~100% (float tolerance) | unit | `node --import tsx/esm --test server/src/calc/summary.test.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `server/src/calc/utils.test.ts` — stubs for `toMonthKey`, `monthRange`
- [ ] `server/src/calc/ranges.test.ts` — stubs for `getRangeBounds` (all 8 ranges)
- [ ] `server/src/calc/summary.test.ts` — stubs for `locfFill` (LOCF correctness + upsert) and `aggregateSummary` (divide-by-zero, sums, lengths)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Smoke test endpoint with real DB | SUM-01–05 | Requires running server | `DATA_FILE=/tmp/wt.yaml npm run dev` → seed data → `curl /api/v1/summary?range=1y` — verify JSON shape |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 5s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
