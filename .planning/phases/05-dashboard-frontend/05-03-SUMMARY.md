---
phase: "05"
plan: "03"
subsystem: dashboard-frontend
tags: [recharts, chart, localStorage, react, typescript]
dependency_graph:
  requires:
    - 05-01  # types/index.ts, api/client.ts
    - 05-02  # Nav component, routing
  provides:
    - ChartTypeSelector component with useChartType hook
    - WealthChart ComposedChart component
  affects:
    - 05-04  # DashboardPage will wire these components together
tech_stack:
  added: []
  patterns:
    - Recharts ComposedChart for multi-mode (Area/Line/Bar) chart
    - localStorage persistence with validation via storageKey prop
    - h-[420px] mandatory parent div for ResponsiveContainer height fix
    - dataKey=category_id (slug) to avoid Recharts nested path parsing on dots
    - stackId="wealth" on Area/Bar; no stackId on total Line overlay
key_files:
  created:
    - web/src/components/ChartTypeSelector.tsx
    - web/src/components/WealthChart.tsx
  modified: []
decisions:
  - "ChartTypeSelector accepts storageKey as prop (not hardcoded) so hook is reusable for ProjectionsPage"
  - "WealthChart uses ComposedChart (not AreaChart/LineChart/BarChart) to support all three modes plus total line overlay"
  - "Total Line has no stackId — it is an absolute value overlay painted on top after all per-category series"
  - "dataKey uses category_id (slug) not category_name — names with dots break Recharts nested path parser"
metrics:
  duration: "~5 minutes"
  completed: "2026-04-22"
  tasks_completed: 2
  tasks_total: 2
  files_created: 2
  files_modified: 0
---

# Phase 5 Plan 03: Chart Components Summary

**One-liner:** Recharts ComposedChart wrapper (Area/Line/Bar modes, total overlay, custom EUR tooltip) + icon-button chart type selector with localStorage hook.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Create ChartTypeSelector component | `6159c73` | `web/src/components/ChartTypeSelector.tsx` |
| 2 | Create WealthChart component | `7e62857` | `web/src/components/WealthChart.tsx` |

## What Was Built

### ChartTypeSelector (`web/src/components/ChartTypeSelector.tsx`)

- Exports `ChartType` type (`'area' | 'line' | 'bar'`)
- Exports `useChartType(storageKey)` hook — reads/writes to any localStorage key, validates stored value before use (no unsafe cast), defaults to `'area'`
- Default export `ChartTypeSelector` — three icon buttons using `AreaChart` / `LineChart` / `BarChart2` from lucide-react (size 16)
- Active button: `border-blue-600 bg-blue-600 text-white`; inactive: `border-gray-200 bg-white text-gray-500 hover:bg-gray-50`
- `storageKey` is a prop (not hardcoded) — DashboardPage passes `'dashboard-chart-type'`

### WealthChart (`web/src/components/WealthChart.tsx`)

- `buildChartData()` flattens `SummaryResponse` to recharts format: `{ month, total, [category_id]: value }`
- Wraps `ResponsiveContainer` in `<div className="h-[420px]">` — mandatory to prevent zero-height collapse
- Three chart modes via conditional rendering inside a single `ComposedChart`:
  - **Area** — `<Area stackId="wealth" dataKey={s.category_id} fillOpacity={0.6} />`
  - **Line** — `<Line dataKey={s.category_id} dot={false} strokeWidth={2} />`
  - **Bar** — `<Bar stackId="wealth" dataKey={s.category_id} />`
- Total wealth overlay: `<Line dataKey="total" stroke="#111827" strokeWidth={2} dot={false} />` — no stackId, renders after series
- `CustomTooltip` — `de-DE` EUR formatting; category rows `font-medium`; Total row `font-bold`
- `CartesianGrid`, `Legend`, `XAxis` (month slice), `YAxis` (compact formatter)

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None — both components are fully implemented with no placeholder data.

## Threat Flags

No new security surface introduced beyond what is in the plan's threat model.
- T-05-08 mitigated: `p.name` rendered as JSX text node (not `dangerouslySetInnerHTML`)
- T-05-10 mitigated: localStorage value validated with explicit equality checks before use

## Self-Check: PASSED

- `web/src/components/ChartTypeSelector.tsx` — FOUND ✓
- `web/src/components/WealthChart.tsx` — FOUND ✓
- Commit `6159c73` — FOUND ✓
- Commit `7e62857` — FOUND ✓
- `cd web && npx tsc --noEmit && npm run build` — exits 0 ✓
