---
phase: 6
slug: admin-panel-frontend
status: approved
nyquist_compliant: true
wave_0_complete: false
created: 2025-01-01
---

# Phase 6 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | None installed — no vitest/jest in web/package.json |
| **Config file** | None — Wave 0 installs vitest if unit tests added |
| **Quick run command** | `cd web && npx tsc --noEmit` |
| **Full suite command** | `cd web && npx tsc --noEmit && npm run build` |
| **Estimated runtime** | ~10 seconds |

> No automated test framework is installed. All CRUD interaction tests are manual smoke checks.
> TypeScript compilation + Vite build serve as the automated gate for all tasks.

---

## Sampling Rate

- **After every task commit:** Run `cd web && npx tsc --noEmit`
- **After every plan wave:** Run `cd web && npx tsc --noEmit && npm run build`
- **Before `/gsd-verify-work`:** Full suite must be green + manual smoke check complete
- **Max feedback latency:** ~10 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | Status |
|---------|------|------|-------------|-----------|-------------------|--------|
| 06-01-01 | 01 | 1 | ADMIN-01 | build | `cd web && npx tsc --noEmit` | ⬜ pending |
| 06-01-02 | 01 | 1 | ADMIN-02 | build | `cd web && npx tsc --noEmit` | ⬜ pending |
| 06-01-03 | 01 | 1 | ADMIN-02 | build | `cd web && npx tsc --noEmit && npm run build` | ⬜ pending |
| 06-02-01 | 02 | 2 | ADMIN-03 | build | `cd web && npx tsc --noEmit` | ⬜ pending |
| 06-02-02 | 02 | 2 | ADMIN-03 | build | `cd web && npx tsc --noEmit && npm run build` | ⬜ pending |
| 06-03-01 | 03 | 3 | ADMIN-04, ADMIN-05 | build | `cd web && npx tsc --noEmit` | ⬜ pending |
| 06-03-02 | 03 | 3 | ADMIN-04, ADMIN-05 | build | `cd web && npx tsc --noEmit && npm run build` | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements (TypeScript + Vite build already installed from Phase 5). No new tooling needed.

Optional unit testing (not required for this phase):
- [ ] `cd web && npm install -D vitest @testing-library/react jsdom` — if unit tests desired
- [ ] `web/src/utils/slug.test.ts` — covers `toSlug()` function
- [ ] `web/src/utils/growthRate.test.ts` — covers % → decimal conversion

*If none: existing infrastructure covers all automated checks.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Tab switching renders correct tab | ADMIN-01 | DOM interaction | Click each tab, verify content changes |
| DataPoint create → row appears | ADMIN-02 | CRUD + refetch | Click Add, fill form, save, verify row |
| DataPoint edit pre-populated | ADMIN-02 | Modal state | Click Edit, verify fields match row values |
| DataPoint delete confirm + remove | ADMIN-02 | ConfirmDialog + DELETE | Click Delete, confirm, verify row removed |
| Value ≤ 0 → inline validation error | ADMIN-02 | Form validation | Enter 0 or -1, attempt save, verify error |
| Asset slug auto-previews from name | ADMIN-03 | Input reactivity | Type name, verify slug field updates in real-time |
| Growth rate 8 → stored 0.08 | ADMIN-03 | Conversion | Enter 8, save, verify API receives 0.08 |
| Delete asset with data points → 409 | ADMIN-03 | Error display | Attempt delete of in-use asset, verify inline error |
| Category color picker → hex | ADMIN-04 | Color input | Pick color, save, verify color swatch updates |
| Delete category with assets → 409 | ADMIN-04 | Error display | Attempt delete of in-use category, verify inline error |
| Liabilities banner visible | ADMIN-05 | Visual check | Navigate to Categories tab, verify info banner |

---

## Validation Sign-Off

- [x] All tasks have `tsc --noEmit` as automated gate
- [x] Sampling continuity: every task has TypeScript check
- [x] Wave 0: no missing references (all CRUD APIs exist in client.ts from Phase 5)
- [x] No watch-mode flags
- [x] Feedback latency < 15s (tsc ~5s, build ~10s)
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2025-01-01
