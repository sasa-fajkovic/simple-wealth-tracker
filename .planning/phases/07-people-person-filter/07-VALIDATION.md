# Phase 7 Validation

**Status:** Approved
**nyquist_compliant:** true
**Verification:** `npx tsc --noEmit` per task, `npx tsc --noEmit && npm run build` per wave

## UAT per Requirement

| ID | Requirement | Verification |
|----|-------------|--------------|
| PEOPLE-01 | GET /api/v1/persons returns Person[] | `curl http://localhost:3000/api/v1/persons` returns JSON array |
| PEOPLE-02 | POST creates person with toSlug(name) as id | `curl -X POST .../persons -d '{"name":"Test User"}'` returns `{"id":"test-user","name":"Test User"}` |
| PEOPLE-03 | DELETE 409 when person has assets | Assign person to asset; attempt DELETE → 409 with "Person is in use by N asset(s)" |
| PEOPLE-04 | Admin People tab renders with CRUD | Open /admin → People tab → add/edit/delete person |
| PEOPLE-05 | Asset can be assigned to a person | Edit asset in Admin → Person dropdown → select person → save → Person column shows name |
| PEOPLE-06 | Dashboard person filter pills render | Open / → person pills visible below range selector |
| PEOPLE-07 | Selecting a person pill filters the chart | Click person pill → chart updates to that person's assets only |
| PEOPLE-08 | Seed persons (Sasa/Matea/Elliot/Oskar) appear on fresh + existing DB | Fresh: server first boot creates DB with 4 persons. Existing: restart server → 4 persons seeded if absent |

## Critical Findings Checklist

| Finding | Guard | Location |
|---------|-------|----------|
| CF-1: `db.persons ?? []` | All persons route handlers use `(db.persons ?? [])` | `server/src/routes/persons.ts` |
| CF-2: `locfFill` gets `filteredAssets` | `locfFill(months, db.dataPoints, filteredAssets)` | `server/src/routes/summary.ts` |
| CF-3: Bootstrap additive migration | `if (!parsed.persons \|\| parsed.persons.length === 0)` | `server/src/bootstrap.ts` |
| CF-4: `colSpan` 6→7 in AssetsTab | `colSpan={7}` on empty-state row | `web/src/components/admin/AssetsTab.tsx` |
| CF-5: `person_id` Zod `.nullable().optional()` | `z.string().nullable().optional()` | `server/src/routes/assets.ts` |
| CF-6: No `font-semibold`/`font-normal` | Only `font-medium` and `font-bold` used | All new components |
| CF-7: `person` in DashboardPage dep array | `[range, person, retryCount]` | `web/src/pages/DashboardPage.tsx` |
