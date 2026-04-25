---
phase: 4
slug: projections-calculation
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-04-22
---

# Phase 4 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Node.js built-in `node:test` + `tsx` (TypeScript execution) |
| **Config file** | None — no config file needed for `node:test` |
| **Quick run command** | `cd server && node --import tsx/esm --test src/calc/projections.test.ts` |
| **Full suite command** | `cd server && node --import tsx/esm --test src/calc/utils.test.ts src/calc/summary.test.ts src/calc/ranges.test.ts src/calc/projections.test.ts` |
| **Estimated runtime** | ~3 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd server && node --import tsx/esm --test src/calc/projections.test.ts`
- **After every plan wave:** Run full suite command above
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 5 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 4-01-01 | 01 | 1 | PROJ-01 | — | N/A | unit (Wave 0) | `cd server && node --import tsx/esm --test src/calc/projections.test.ts` 2>&1 | ❌ W0 | ⬜ pending |
| 4-01-02 | 01 | 1 | PROJ-01 | T-04-01 | compoundMonthlyRate never returns r/12 | unit | `cd server && node --import tsx/esm --test src/calc/projections.test.ts` | ❌ W0 | ⬜ pending |
| 4-01-03 | 01 | 1 | PROJ-01 | T-04-02 | resolveGrowthRate: null check is !== null (0 is valid) | unit | `cd server && node --import tsx/esm --test src/calc/projections.test.ts` | ❌ W0 | ⬜ pending |
| 4-02-01 | 02 | 2 | PROJ-02 | T-04-03 | projection starts month after latest DP, not same month | unit | `cd server && node --import tsx/esm --test src/calc/projections.test.ts` | ❌ W0 | ⬜ pending |
| 4-02-02 | 02 | 2 | PROJ-03 | — | After 12 months at 8% → startValue * 1.08 (±0.01%) | unit | `cd server && node --import tsx/esm --test src/calc/projections.test.ts` | ❌ W0 | ⬜ pending |
| 4-03-01 | 03 | 3 | PROJ-04/05 | T-04-04 | years=31 → 400; years=0 → 400 | integration | smoke test (curl) | ✅ | ⬜ pending |
| 4-03-02 | 03 | 3 | PROJ-04 | — | projection.months[0] = addOneMonth(historical.months.last) | integration | smoke test (curl) | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `server/src/calc/projections.test.ts` — stubs for compoundMonthlyRate, resolveGrowthRate, buildProjection (RED until Tasks 2–4 create source)

*Existing infrastructure covers all other requirements — node:test, tsx, and node:assert/strict already installed and tested in Phase 3.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Live smoke: GET /api/v1/projections returns valid JSON | PROJ-04 | Route integration | Start server with DATA_FILE=/tmp/wt-test.yaml, curl GET /api/v1/projections, verify both `historical` and `projection` keys present |
| projection.months[0] is one month after historical last | PROJ-05 | Cross-field JSON check | Inspect response: historical.months[-1] and projection.months[0] must be consecutive months |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 5s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
