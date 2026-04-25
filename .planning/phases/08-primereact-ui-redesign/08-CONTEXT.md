# Phase 8: PrimeReact UI Redesign — Context

**Phase:** 8
**Goal:** Install PrimeReact and redesign the full WealthTrack UI to be polished and professional.
**Depends on:** Phase 7 Wave 1 (backend ✅ complete)

---

## Why This Phase

The user requested a much prettier UI using PrimeReact (primereact.org — React equivalent of PrimeVue). This phase replaces all hand-crafted Tailwind components with PrimeReact's polished component library, and also delivers the Phase 7 frontend work (People tab, Dashboard person filter pills) that was deferred from Phase 7 Waves 2 & 3.

---

## Scope

### Install & Configure
- `primereact` + `primeicons` packages
- Theme: **Lara Light Blue** (`primereact/resources/themes/lara-light-blue/theme.css`)
- Wrap app in `<PrimeReactProvider>` in `main.tsx`
- Keep Tailwind for layout (flex/grid/spacing/max-w) — remove Tailwind from interactive elements

### Components to Migrate to PrimeReact

| Current | PrimeReact Replacement |
|---------|----------------------|
| Custom tab bar (AdminPage) | `TabView` + `TabPanel` |
| Custom modal overlay | `Dialog` |
| `<ConfirmDialog>` custom | `ConfirmDialog` (primereact/confirmdialog) |
| Custom table | `DataTable` + `Column` |
| Custom `<input>` | `InputText` |
| Custom `<select>` | `Dropdown` |
| Custom `<input type="color">` | `ColorPicker` |
| Custom `<input type="number">` | `InputNumber` |
| Custom `<button>` add/edit/delete | `Button` |
| Range pills (`<button>` row) | `SelectButton` |
| Chart type selector | `SelectButton` |
| Loading skeletons | `Skeleton` |
| Error banners | `Message` |
| Summary metric cards | `Card` |
| Nav bar | Keep custom (ReactRouter NavLink required) but style with PrimeReact classes |

### Phase 7 Frontend (deferred from 07-02 and 07-03)
These were planned but NOT executed. Build them directly in PrimeReact:

**Types & API (already in 07-02 plans — execute as Wave 1 of this phase):**
- `web/src/types/index.ts` — add `Person` interface, `person_id` to Asset, Person payloads
- `web/src/api/client.ts` — `getSummary(range, person?)`, `getPersons()`, `createPerson()`, `updatePerson()`, `deletePerson()`

**Admin People tab (04-02 plan → build with PrimeReact):**
- `web/src/components/admin/PeopleTab.tsx` — DataTable CRUD (new)
- `web/src/components/admin/PersonModal.tsx` — Dialog form (new)
- `web/src/pages/AdminPage.tsx` — add 4th People tab to TabView

**Asset person assignment (07-03 plan → build with PrimeReact):**
- `web/src/components/admin/AssetModal.tsx` — add person Dropdown (last field)
- `web/src/components/admin/AssetsTab.tsx` — add Person column to DataTable

**Dashboard person filter (07-03 plan → build with PrimeReact):**
- `web/src/pages/DashboardPage.tsx` — person SelectButton row, getPersons fetch, pass person to getSummary

---

## Technical Decisions

### PrimeReact Version
Use `primereact@^10` (latest stable).

### Theme
Lara Light Blue — professional, clean, blue primary. Import order in `main.tsx`:
```typescript
import 'primereact/resources/themes/lara-light-blue/theme.css'
import 'primereact/resources/primereact.css'
import 'primeicons/primeicons.css'
import './index.css'  // Tailwind — must come AFTER primereact CSS
```

### PrimeReactProvider
Wrap in `main.tsx`:
```tsx
import { PrimeReactProvider } from 'primereact/api'
// ...
<PrimeReactProvider>
  <BrowserRouter>
    <App />
  </BrowserRouter>
</PrimeReactProvider>
```

### Tailwind Coexistence
Keep Tailwind for layout utilities only. Use `important: true` in `tailwind.config.js` to prevent specificity conflicts with PrimeReact theme styles.

### DataTable Usage Pattern
```tsx
import { DataTable } from 'primereact/datatable'
import { Column } from 'primereact/column'

<DataTable value={rows} sortField={sort.col} sortOrder={sort.dir === 'asc' ? 1 : -1}
  onSort={e => setSort({ col: e.sortField, dir: e.sortOrder === 1 ? 'asc' : 'desc' })}
  emptyMessage="No items yet." stripedRows>
  <Column field="name" header="Name" sortable />
  <Column body={actionsTemplate} header="Actions" style={{ width: '8rem' }} />
</DataTable>
```

### Dialog Usage Pattern
```tsx
import { Dialog } from 'primereact/dialog'

<Dialog header="Add Asset" visible={modal !== null} onHide={handleCancel}
  style={{ width: '32rem' }} modal draggable={false}>
  {/* form content */}
</Dialog>
```

### SelectButton for Range + Person Filters
```tsx
import { SelectButton } from 'primereact/selectbutton'

const rangeOptions = RANGES.map(r => ({ label: r.label, value: r.value }))
<SelectButton value={range} onChange={e => setRange(e.value)} options={rangeOptions} />
```

### Inline Delete Error (409)
Keep the `deleteError: { id, message } | null` pattern but display using PrimeReact's `Message` inline.

### ConfirmDialog (PrimeReact built-in)
Replace the custom `ConfirmDialog.tsx` with PrimeReact's:
```tsx
import { ConfirmDialog, confirmDialog } from 'primereact/confirmdialog'
// In JSX: <ConfirmDialog />
// Trigger: confirmDialog({ message: '...', header: 'Confirm', icon: 'pi pi-exclamation-triangle', accept: () => handleDelete(id) })
```
DataPoints delete should use this pattern. Assets/Categories keep inline 409 error (no confirm needed).

### Toast Notifications
Add `<Toast ref={toast} />` to AdminPage for success feedback on create/update/delete.

### Typography Constraints (carry-forward from Phase 6)
- `font-semibold` and `font-normal` BANNED — use only `font-medium` and `font-bold`
- PrimeReact components handle their own internal typography; this rule applies to custom text elements only

---

## Wave Structure

### Wave 1 — Foundation (autonomous: true)
**Files:** `package.json`, `main.tsx`, `index.css`, `tailwind.config.js` (or `vite.config.ts`), `types/index.ts`, `api/client.ts`
- Install primereact + primeicons
- Configure PrimeReactProvider + theme imports
- Tailwind important flag
- Add Phase 7 types (Person, person_id on Asset, payloads)
- Add Phase 7 API functions (getPersons, CRUD, getSummary update)
- **Verify:** `cd web && npm install && npx tsc --noEmit && npm run build`

### Wave 2 — Layout + Dashboard (autonomous: true)
**Files:** `Nav.tsx`, `SummaryCards.tsx`, `ChartTypeSelector.tsx`, `DashboardPage.tsx`
- Nav: clean PrimeReact-styled nav (keep ReactRouter NavLink)
- SummaryCards: PrimeReact Card components
- ChartTypeSelector: SelectButton
- DashboardPage: SelectButton for ranges, SelectButton for person filter (Phase 7), Skeleton loading, Message error, person state + getPersons fetch
- **Verify:** `cd web && npx tsc --noEmit && npm run build`

### Wave 3 — Admin Tables (autonomous: true)
**Files:** `AdminPage.tsx`, `DataPointsTab.tsx`, `AssetsTab.tsx`, `CategoriesTab.tsx`, `PeopleTab.tsx` (new)
- AdminPage: TabView with 4 tabs (Data Points, Assets, Categories, People)
- All tabs: DataTable replacing hand-crafted tables, persons fetched in AssetsTab
- PeopleTab: New component (Phase 7) — DataTable CRUD
- **Verify:** `cd web && npx tsc --noEmit && npm run build`

### Wave 4 — Modals/Dialogs (autonomous: false — smoke check gate)
**Files:** `ConfirmDialog.tsx`, `DataPointModal.tsx`, `AssetModal.tsx` (+ person dropdown Phase 7), `CategoryModal.tsx`, `PersonModal.tsx` (new Phase 7)
- All modals → PrimeReact Dialog with InputText, Dropdown, InputNumber, ColorPicker
- ConfirmDialog.tsx: replaced with PrimeReact ConfirmDialog (keep file as re-export or delete and update imports)
- AssetModal: add person Dropdown (Phase 7)
- PersonModal: new Dialog (Phase 7)
- Add Toast to AdminPage
- **Verify:** `cd web && npx tsc --noEmit && npm run build`
- **Smoke check:** Manual verification gate (blocking checkpoint)

---

## Files Summary

| File | Action | Notes |
|------|--------|-------|
| `web/package.json` | MODIFY | Add primereact, primeicons |
| `web/src/main.tsx` | MODIFY | PrimeReactProvider + theme CSS imports |
| `web/src/index.css` | MODIFY | Remove conflicting base styles if needed |
| `web/tailwind.config.js` | MODIFY | Add `important: true` |
| `web/src/types/index.ts` | MODIFY | Phase 7: Person, person_id, payloads |
| `web/src/api/client.ts` | MODIFY | Phase 7: getSummary(person?), persons CRUD |
| `web/src/components/Nav.tsx` | MODIFY | PrimeReact styling |
| `web/src/components/SummaryCards.tsx` | MODIFY | PrimeReact Card |
| `web/src/components/ChartTypeSelector.tsx` | MODIFY | SelectButton |
| `web/src/pages/DashboardPage.tsx` | MODIFY | SelectButton ranges + person filter (Phase 7) |
| `web/src/pages/AdminPage.tsx` | MODIFY | TabView 4 tabs + Toast |
| `web/src/components/admin/DataPointsTab.tsx` | MODIFY | DataTable |
| `web/src/components/admin/AssetsTab.tsx` | MODIFY | DataTable + person column (Phase 7) |
| `web/src/components/admin/CategoriesTab.tsx` | MODIFY | DataTable |
| `web/src/components/admin/PeopleTab.tsx` | CREATE | DataTable CRUD (Phase 7) |
| `web/src/components/admin/ConfirmDialog.tsx` | MODIFY | Thin wrapper or re-export of PrimeReact ConfirmDialog |
| `web/src/components/admin/DataPointModal.tsx` | MODIFY | PrimeReact Dialog |
| `web/src/components/admin/AssetModal.tsx` | MODIFY | PrimeReact Dialog + person Dropdown (Phase 7) |
| `web/src/components/admin/CategoryModal.tsx` | MODIFY | PrimeReact Dialog |
| `web/src/components/admin/PersonModal.tsx` | CREATE | PrimeReact Dialog (Phase 7) |

---

## Deferred (Out of Scope for Phase 8)
- Dark mode
- Custom PrimeReact theme tokens
- Animation/transition customization
- PrimeReact DataTable pagination (all rows shown for household scale)
