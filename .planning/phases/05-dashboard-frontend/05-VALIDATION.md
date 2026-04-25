---
phase: 5
slug: dashboard-frontend
status: approved
nyquist_compliant: true
wave_0_complete: true
created: 2026-04-22
---

# Phase 5 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | No frontend test framework — TypeScript compile-check + Vite build only |
| **Config file** | `web/tsconfig.json` |
| **Quick run command** | `cd web && npx tsc --noEmit` |
| **Full suite command** | `cd web && npx tsc --noEmit && npm run build` |
| **Estimated runtime** | ~10 seconds (tsc) / ~20 seconds (full build) |

> No React component testing framework exists in this project. Phase 5 validation relies on TypeScript compile correctness and manual browser smoke checks. A frontend test framework (Vitest + testing-library) is out of scope for Phase 5.

---

## Sampling Rate

- **After every task commit:** Run `cd web && npx tsc --noEmit`
- **After every plan wave:** Run `cd web && npx tsc --noEmit && npm run build`
- **Before `/gsd-verify-work`:** Full suite must be green + manual smoke check in browser
- **Max feedback latency:** ~20 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | Status |
|---------|------|------|-------------|-----------|-------------------|--------|
| 05-01-01 | 5.1 | 1 | FE-02 | compile-time | `cd web && npx tsc --noEmit` | ⬜ pending |
| 05-01-02 | 5.1 | 1 | FE-01 | compile-time + manual | `cd web && npx tsc --noEmit` | ⬜ pending |
| 05-02-01 | 5.2 | 2 | FE-03 | compile-time + manual | `cd web && npx tsc --noEmit && npm run build` | ⬜ pending |
| 05-03-01 | 5.3 | 3 | FE-04, DASH-02, DASH-03, DASH-04 | compile-time + manual | `cd web && npx tsc --noEmit && npm run build` | ⬜ pending |
| 05-04-01 | 5.4 | 4 | DASH-01, DASH-05 | compile-time + manual | `cd web && npx tsc --noEmit && npm run build` | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `cd web && npm install` — install all declared dependencies (node_modules is empty)
- [ ] `cd web && npm install lucide-react` — add missing dependency to package.json
- [ ] Verify: `cd web && npx tsc --noEmit` exits 0 on the scaffold (baseline green before any Phase 5 code is written)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Nav hamburger toggles on mobile | FE-03 | DOM interaction + responsive CSS | Open `http://localhost:5173`, resize window to < 640px, click hamburger icon — menu opens/closes |
| Active nav link highlights correctly | FE-03 | React Router `NavLink` isActive | Navigate to each route — active link shows `text-blue-600` |
| Range pill re-fetches and chart updates | DASH-01 | Network request + re-render | Click each pill — chart data changes; active pill shows `bg-blue-600 text-white` |
| Chart renders per-category series + total line | DASH-02 | Visual — Recharts SVG | Chart displays coloured area/line/bar per category; black total line on top |
| Tooltip shows per-category + total values | DASH-03 | Browser hover event | Hover chart — tooltip shows each category name+value + Total |
| Chart type selector switches modes | DASH-04 | Visual + localStorage | Click Area/Line/Bar icon buttons — chart mode changes; reload page — selection persists |
| Summary cards show correct values | DASH-05 | Compare to API JSON | Cards match `current_total`, `period_delta_abs`, `period_delta_pct`, `category_breakdown[]` from `/api/v1/summary?range=1y` |
| Empty state renders when no data | DASH-01–05 | Conditional UI path | Clear database, reload — chart shows empty-state message, cards show zero/dash values |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-04-22
