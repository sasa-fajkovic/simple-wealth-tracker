---
phase: 2
slug: crud-api
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-22
---

# Phase 2 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | curl + bash (no backend test runner yet) |
| **Config file** | none |
| **Quick run command** | `cd server && npx tsc --noEmit` |
| **Full suite command** | `cd server && npx tsc --noEmit && curl -sf http://localhost:8080/api/v1/health` |
| **Estimated runtime** | ~10 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd server && npx tsc --noEmit`
- **After every plan wave:** Run TypeScript + smoke curl against running server
- **Before `/gsd-verify-work`:** All curl acceptance checks from ROADMAP.md must pass
- **Max feedback latency:** ~15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Secure Behavior | Test Type | Automated Command | Status |
|---------|------|------|-------------|-----------------|-----------|-------------------|--------|
| 02-01-01 | 01 | 1 | CAT-01 | GET returns array | manual curl | `curl -sf http://localhost:8080/api/v1/categories` | ⬜ pending |
| 02-01-02 | 01 | 1 | CAT-02 | POST validates + creates | manual curl | `curl -s -X POST ... -d '{...}'` | ⬜ pending |
| 02-01-03 | 01 | 1 | CAT-03 | PUT rejects id change → 400 | manual curl | see RESEARCH.md CAT-03 command | ⬜ pending |
| 02-01-04 | 01 | 1 | CAT-04 | DELETE returns 409 if in use | manual curl | see RESEARCH.md CAT-04 commands | ⬜ pending |
| 02-01-05 | 01 | 1 | ASSET-01 | GET returns array | manual curl | `curl -sf http://localhost:8080/api/v1/assets` | ⬜ pending |
| 02-01-06 | 01 | 1 | ASSET-02 | POST validates category_id | manual curl | see RESEARCH.md | ⬜ pending |
| 02-01-07 | 01 | 1 | ASSET-03 | PUT rejects id change → 400 | manual curl | see RESEARCH.md | ⬜ pending |
| 02-01-08 | 01 | 1 | ASSET-04 | DELETE returns 409 if DP refs | manual curl | see RESEARCH.md | ⬜ pending |
| 02-02-01 | 02 | 1 | DP-01 | GET sorted desc by year_month | manual curl | `curl -sf http://localhost:8080/api/v1/data-points \| jq '.[].year_month'` | ⬜ pending |
| 02-02-02 | 02 | 1 | DP-02 | POST value=0 → 400; non-existent asset_id → 404 | manual curl | see RESEARCH.md DP-02 command | ⬜ pending |
| 02-02-03 | 02 | 1 | DP-03 | PUT updates updated_at | manual curl | see RESEARCH.md | ⬜ pending |
| 02-02-04 | 02 | 1 | DP-04 | DELETE no restrictions | manual curl | `curl -s -X DELETE http://localhost:8080/api/v1/data-points/{id}` | ⬜ pending |
| 02-03-01 | 03 | 2 | API-01 | All errors → {"error":"..."} shape | manual curl | zValidator hook, onError | ⬜ pending |
| 02-03-02 | 03 | 2 | API-02 | Non-API GET → index.html | manual curl | `curl -sf http://localhost:8080/dashboard` | ⬜ pending |
| 02-03-03 | 03 | 2 | API-03 | Health endpoint → {"status":"ok"} | manual curl | `curl -sf http://localhost:8080/api/v1/health` | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

None — TypeScript compiler (`npx tsc --noEmit`) already available from Phase 1. No new test framework to install. All verification is curl-based.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| SPA catch-all serves index.html | API-02 | No test runner; requires running server + built web/dist | `curl -sf http://localhost:8080/dashboard` — must return HTML |
| Static assets served | API-02 | Requires built frontend dist | `curl -sf http://localhost:8080/assets/main.js` — must return JS |
| Unhandled error → 500 | API-01 | Requires intentionally broken handler | Check onError handler exists + grep pattern |
| TypeScript clean | All | Build-time | `cd server && npx tsc --noEmit` |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or manual curl commands documented
- [ ] TypeScript clean after every wave
- [ ] Curl smoke tests against running server after Wave 1 + Wave 2
- [ ] No watch-mode flags in acceptance commands
- [ ] `nyquist_compliant: true` set in frontmatter after sign-off

**Approval:** pending
