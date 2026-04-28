<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import {
  getAssets, getCategories, getPersons, ApiError,
  getDataPointsForMonth, batchUpsertDataPoints,
} from '../api/client'
import type { BatchUpsertResult } from '../api/client'
import type { Asset, Category, Person, DataPoint } from '../types/index'
import Select from 'primevue/select'
import Button from 'primevue/button'
import Message from 'primevue/message'
import Skeleton from 'primevue/skeleton'
import Checkbox from 'primevue/checkbox'
import { useDataRefresh } from '../composables/useDataRefresh'

// ── Types ──────────────────────────────────────────────────────────────────────

interface MonthlyRow {
  assetId: string
  assetName: string
  categoryId: string
  categoryName: string
  categoryType: 'asset' | 'cash-inflow' | 'liability'
  personId: string
  personName: string
  prevValue: number | null
  existingDpId: string | null
  existingValue: number | null
  inputValue: number | null
  rowError: string | null
  showFrom: string | null
  showUntil: string | null
}

interface SaveSummary {
  created: number
  updated: number
  skipped: number
  failed: number
  errors: BatchUpsertResult['errors']
}

// ── Helpers ────────────────────────────────────────────────────────────────────

const eurFormatter = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' })
const assetNameSorter = new Intl.Collator(undefined, { sensitivity: 'base', numeric: true })
const MIN_JUMP_YEAR = 1900
const MAX_JUMP_YEAR = 2100
const MONTH_OPTIONS = Array.from({ length: 12 }, (_, index) => {
  const month = index + 1
  return {
    label: new Intl.DateTimeFormat(undefined, { month: 'long' }).format(new Date(2024, index, 1)),
    value: month,
  }
})

function formatValue(v: number | null): string {
  return eurFormatter.format(v ?? 0)
}

function currentMonthStr(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

function shiftMonth(ym: string, delta: -1 | 1): string {
  const [y, m] = ym.split('-').map(Number)
  const date = new Date(y, m - 1 + delta, 1)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

function monthParts(ym: string): { year: number; month: number } {
  const [year, month] = ym.split('-').map(Number)
  return { year, month }
}

function formatYearMonth(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}`
}

// ── State ──────────────────────────────────────────────────────────────────────

const selectedMonth = ref(currentMonthStr())
const selectedYearInput = ref(String(monthParts(selectedMonth.value).year))
const assets = ref<Asset[]>([])
const categories = ref<Category[]>([])
const persons = ref<Person[]>([])
const rows = ref<MonthlyRow[]>([])
const rowsMonth = ref(selectedMonth.value)

const filterPersonId = ref<string | null>(null)
const filterCategoryId = ref<string | null>(null)
const filterType = ref<'asset' | 'cash-inflow' | 'liability' | null>(null)
const filterMissingOnly = ref(false)

const initLoading = ref(true)
const loading = ref(false)
const error = ref<string | null>(null)
const saving = ref(false)
const saveError = ref<string | null>(null)
const saveSummary = ref<SaveSummary | null>(null)
const { referenceDataVersion, dataPointsVersion, notifyDataPointsChanged } = useDataRefresh()
const route = useRoute()
const router = useRouter()

function isValidYearMonth(value: string): boolean {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(value)) return false
  const { year } = monthParts(value)
  return year >= MIN_JUMP_YEAR && year <= MAX_JUMP_YEAR
}

function readQueryString(key: string): string | null {
  const raw = route.query[key]
  if (Array.isArray(raw)) return raw[0] ?? null
  return typeof raw === 'string' && raw.length > 0 ? raw : null
}

// ── Derived ────────────────────────────────────────────────────────────────────

const categoryMap = computed(() => Object.fromEntries(categories.value.map(c => [c.id, c])))
const personMap = computed(() => Object.fromEntries(persons.value.map(p => [p.id, p])))
const selectedMonthNumber = computed({
  get: () => monthParts(selectedMonth.value).month,
  set: (month: number | null) => {
    if (!month) return
    const { year } = monthParts(selectedMonth.value)
    selectedMonth.value = formatYearMonth(year, month)
  },
})

const filteredRows = computed(() => rows.value.filter(row => {
  if (filterPersonId.value && row.personId !== filterPersonId.value) return false
  if (filterCategoryId.value && row.categoryId !== filterCategoryId.value) return false
  if (filterType.value && row.categoryType !== filterType.value) return false
  if (filterMissingOnly.value && row.existingDpId !== null) return false
  if (row.showFrom && selectedMonth.value < row.showFrom) return false
  if (row.showUntil && selectedMonth.value > row.showUntil) return false
  return true
}))

const hasFilters = computed(() =>
  !!(filterPersonId.value || filterCategoryId.value || filterType.value || filterMissingOnly.value)
)

const hasCopyForwardCandidates = computed(() =>
  rows.value.some(r => r.inputValue === null && r.prevValue !== null)
)

const itemsToSaveCount = computed(() =>
  filteredRows.value.filter(r =>
    r.inputValue !== null && (r.inputValue !== r.existingValue || !r.existingDpId)
  ).length
)

const displayedMonth = computed(() => rowsMonth.value)
const displayedPrevMonth = computed(() => shiftMonth(displayedMonth.value, -1))
let monthLoadSeq = 0

// ── Data loading ───────────────────────────────────────────────────────────────

async function loadMonthData(): Promise<void> {
  const loadSeq = ++monthLoadSeq
  const month = selectedMonth.value
  const previousMonth = shiftMonth(month, -1)
  loading.value = true
  error.value = null
  try {
    const [currDps, prevDps] = await Promise.all([
      getDataPointsForMonth(month),
      getDataPointsForMonth(previousMonth),
    ])
    if (loadSeq !== monthLoadSeq || selectedMonth.value !== month) return
    buildRows(currDps, prevDps)
    rowsMonth.value = month
  } catch (e) {
    if (loadSeq !== monthLoadSeq) return
    error.value = e instanceof ApiError ? e.message : 'Unexpected error loading month data'
  } finally {
    if (loadSeq === monthLoadSeq) loading.value = false
  }
}

async function loadReferenceData(): Promise<void> {
  const [ast, cats, ppl] = await Promise.all([getAssets(), getCategories(), getPersons()])
  assets.value = ast
  categories.value = cats
  persons.value = ppl
}

function buildRows(currDps: DataPoint[], prevDps: DataPoint[]): void {
  const currIndex = new Map(currDps.map(dp => [dp.asset_id, dp]))
  const prevIndex = new Map(prevDps.map(dp => [dp.asset_id, dp]))

  rows.value = assets.value
    .map(asset => {
      const cat = categoryMap.value[asset.category_id] as Category | undefined
      const catType: 'asset' | 'cash-inflow' | 'liability' = cat?.type ?? 'asset'
      const person = personMap.value[asset.person_id] as Person | undefined
      const currDp = currIndex.get(asset.id)
      const prevDp = prevIndex.get(asset.id)

      return {
        assetId: asset.id,
        assetName: asset.name,
        categoryId: asset.category_id,
        categoryName: cat?.name ?? asset.category_id,
        categoryType: catType,
        personId: asset.person_id,
        personName: person?.name ?? asset.person_id,
        prevValue: prevDp?.value ?? null,
        existingDpId: currDp?.id ?? null,
        existingValue: currDp?.value ?? null,
        inputValue: currDp?.value ?? null,
        rowError: null,
        showFrom: asset.show_from ?? null,
        showUntil: asset.show_until ?? null,
      }
    })
    .sort((a, b) =>
      assetNameSorter.compare(a.assetName, b.assetName) ||
      assetNameSorter.compare(a.categoryName, b.categoryName) ||
      assetNameSorter.compare(a.personName, b.personName)
    )
}

onMounted(async () => {
  document.title = 'Monthly Update — WealthTrack'
  initLoading.value = true
  error.value = null
  try {
    const queryMonth = readQueryString('month')
    if (queryMonth && isValidYearMonth(queryMonth)) {
      selectedMonth.value = queryMonth
      selectedYearInput.value = String(monthParts(queryMonth).year)
    }
    await loadReferenceData()
    const queryPerson = readQueryString('person')
    if (queryPerson && persons.value.some(p => p.id === queryPerson)) {
      filterPersonId.value = queryPerson
    }
    const queryCategory = readQueryString('category')
    if (queryCategory && categories.value.some(c => c.id === queryCategory)) {
      filterCategoryId.value = queryCategory
    }
    if (queryMonth || queryPerson || queryCategory) {
      // Strip query so a refresh doesn't re-apply (and a manual filter change isn't fought)
      router.replace({ path: route.path, query: {} }).catch(() => {})
    }
    await loadMonthData()
  } catch (e) {
    error.value = e instanceof ApiError ? e.message : 'Unexpected error loading data'
  } finally {
    initLoading.value = false
  }
})

watch(selectedMonth, async () => {
  selectedYearInput.value = String(monthParts(selectedMonth.value).year)
  if (initLoading.value) return
  saveSummary.value = null
  await loadMonthData()
})

watch(referenceDataVersion, async () => {
  if (initLoading.value) return
  try {
    await loadReferenceData()
    await loadMonthData()
  } catch (e) {
    error.value = e instanceof ApiError ? e.message : 'Unexpected error loading data'
  }
})

watch(dataPointsVersion, async () => {
  if (initLoading.value || loading.value) return
  await loadMonthData()
})

// ── Actions ────────────────────────────────────────────────────────────────────

function navigate(delta: -1 | 1): void {
  selectedMonth.value = shiftMonth(selectedMonth.value, delta)
}

function navigateYear(delta: -1 | 1): void {
  const { year, month } = monthParts(selectedMonth.value)
  const nextYear = year + delta
  if (nextYear < MIN_JUMP_YEAR || nextYear > MAX_JUMP_YEAR) return
  selectedMonth.value = formatYearMonth(nextYear, month)
}

function jumpToYear(year: number): void {
  const { month } = monthParts(selectedMonth.value)
  selectedMonth.value = formatYearMonth(year, month)
}

function handleYearInput(e: Event): void {
  const value = (e.target as HTMLInputElement).value.trim()
  selectedYearInput.value = value
}

function applyYearInput(): void {
  const value = selectedYearInput.value.trim()
  const year = Number(value)
  if (/^\d{4}$/.test(value) && year >= MIN_JUMP_YEAR && year <= MAX_JUMP_YEAR) {
    jumpToYear(year)
  } else {
    resetYearInput()
  }
}

function resetYearInput(): void {
  selectedYearInput.value = String(monthParts(selectedMonth.value).year)
}

function selectYearInput(e: FocusEvent): void {
  const input = e.target as HTMLInputElement
  input.select()
}

function jumpToCurrentMonth(): void {
  selectedMonth.value = currentMonthStr()
}

function clearFilters(): void {
  filterPersonId.value = null
  filterCategoryId.value = null
  filterType.value = null
  filterMissingOnly.value = false
}

function copyForward(): void {
  for (const row of rows.value) {
    if (row.inputValue === null && row.prevValue !== null) {
      row.inputValue = row.prevValue
      row.rowError = null
    }
  }
}

function handleValueInput(row: MonthlyRow, e: Event): void {
  const v = (e.target as HTMLInputElement).valueAsNumber
  row.inputValue = isNaN(v) ? null : v
  row.rowError = null
  saveError.value = null
}

function hasBigChange(row: MonthlyRow): boolean {
  if (row.inputValue === null || row.prevValue === null) return false
  if (!Number.isFinite(row.inputValue) || !Number.isFinite(row.prevValue)) return false
  if (row.prevValue === 0) return false
  const ratio = Math.abs((row.inputValue - row.prevValue) / row.prevValue)
  return ratio > 0.10
}

const TYPE_FILTER_OPTIONS = [
  { label: 'Asset', value: 'asset' },
  { label: 'Income', value: 'cash-inflow' },
  { label: 'Liability', value: 'liability' },
]

function typeLabel(t: MonthlyRow['categoryType']): string {
  if (t === 'asset') return 'Asset'
  if (t === 'cash-inflow') return 'Income'
  return 'Liability'
}

function typeBadgeClass(t: MonthlyRow['categoryType']): string {
  if (t === 'asset') return 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300'
  if (t === 'cash-inflow') return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
  return 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400'
}

async function saveAll(): Promise<void> {
  saveError.value = null
  saveSummary.value = null
  for (const row of rows.value) row.rowError = null

  const batchItems: { asset_id: string; year_month: string; value: number; notes?: string }[] = []
  let skipped = 0
  let localFailed = 0

  for (const row of filteredRows.value) {
    if (row.inputValue === null) {
      skipped++
      continue
    }
    if (row.existingDpId && row.inputValue === row.existingValue) {
      skipped++
      continue
    }
    if (row.categoryType === 'liability' && row.inputValue > 0) {
      row.rowError = 'Liability — value must be zero or negative'
      localFailed++
      continue
    }
    batchItems.push({ asset_id: row.assetId, year_month: selectedMonth.value, value: row.inputValue })
  }

  if (batchItems.length === 0) {
    saveSummary.value = { created: 0, updated: 0, skipped, failed: localFailed, errors: [] }
    return
  }

  saving.value = true
  try {
    const result: BatchUpsertResult = await batchUpsertDataPoints({ items: batchItems })

    for (const err of result.errors) {
      const row = rows.value.find(r => r.assetId === err.asset_id && err.year_month === selectedMonth.value)
      if (row) row.rowError = err.error
    }

    saveSummary.value = {
      created: result.created,
      updated: result.updated,
      skipped,
      failed: result.failed + localFailed,
      errors: result.errors,
    }

    await loadMonthData()
    notifyDataPointsChanged()
  } catch (e) {
    saveError.value = e instanceof ApiError ? e.message : 'Unexpected error during save'
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="px-4 sm:px-6 py-6">
    <!-- ── Header ──────────────────────────────────────────────────────────── -->
    <div class="flex flex-wrap items-center gap-3 mb-6">
      <RouterLink
        to="/data-points"
        class="wt-soft-link"
      >
        History / Corrections
      </RouterLink>
      <div class="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:ml-auto sm:justify-end sm:gap-3">
        <div class="inline-flex items-center" aria-label="Month navigation">
          <Button
            icon="pi pi-chevron-left"
            text
            class="hidden sm:inline-flex min-h-11 !w-8 !px-0"
            aria-label="Previous month"
            @click="navigate(-1)"
          />
          <Select
            v-model="selectedMonthNumber"
            :options="MONTH_OPTIONS"
            option-label="label"
            option-value="value"
            aria-label="Select month"
            class="h-11 min-w-28 sm:min-w-40 wt-month-select"
          />
          <Button
            icon="pi pi-chevron-right"
            text
            class="hidden sm:inline-flex min-h-11 !w-8 !px-0"
            aria-label="Next month"
            @click="navigate(1)"
          />
        </div>
        <div class="inline-flex items-center" aria-label="Year navigation">
          <Button
            icon="pi pi-chevron-left"
            text
            class="hidden sm:inline-flex min-h-11 !w-8 !px-0"
            aria-label="Previous year"
            @click="navigateYear(-1)"
          />
          <label class="inline-flex h-11 items-center gap-2 rounded-2xl bg-gray-100/80 p-1 pl-3 shadow-sm ring-1 ring-black/0 sm:gap-3 sm:pl-4 dark:bg-zinc-800/80">
            <span class="hidden text-sm font-semibold text-gray-500 sm:inline dark:text-zinc-400">Year</span>
            <input
              :value="selectedYearInput"
              type="number"
              inputmode="numeric"
              :min="MIN_JUMP_YEAR"
              :max="MAX_JUMP_YEAR"
              aria-label="Jump to year"
              class="h-10 w-16 rounded-xl border border-gray-200 bg-white px-2 text-center text-lg font-bold tabular-nums text-gray-900 shadow-sm outline-none transition [appearance:textfield] focus:border-emerald-300 focus:ring-2 focus:ring-emerald-100 sm:w-24 sm:px-3 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:focus:border-emerald-500 dark:focus:ring-emerald-500/20 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
              @input="handleYearInput"
              @focus="selectYearInput"
              @blur="applyYearInput"
              @keydown.enter.prevent="applyYearInput"
            />
          </label>
          <Button
            icon="pi pi-chevron-right"
            text
            class="hidden sm:inline-flex min-h-11 !w-8 !px-0"
            aria-label="Next year"
            @click="navigateYear(1)"
          />
        </div>
        <Button
          label="This month"
          text
          severity="secondary"
          class="min-h-11"
          @click="jumpToCurrentMonth"
        />
      </div>
    </div>

    <!-- ── Filters + Actions ───────────────────────────────────────────────── -->
    <div class="flex flex-wrap items-center gap-3 mb-4">
      <Select
        v-model="filterPersonId"
        :options="persons"
        option-label="name"
        option-value="id"
        placeholder="All people"
        show-clear
        class="w-36"
      />
      <Select
        v-model="filterCategoryId"
        :options="categories"
        option-label="name"
        option-value="id"
        placeholder="All categories"
        show-clear
        class="w-44"
      />
      <Select
        v-model="filterType"
        :options="TYPE_FILTER_OPTIONS"
        option-label="label"
        option-value="value"
        placeholder="All types"
        show-clear
        class="w-36"
      />
      <div class="flex items-center gap-2">
        <Checkbox v-model="filterMissingOnly" :binary="true" input-id="missing-only" />
        <label
          for="missing-only"
          class="text-sm text-gray-700 dark:text-zinc-300 cursor-pointer select-none"
        >Missing only</label>
      </div>
      <Button
        v-if="hasFilters"
        label="Clear"
        icon="pi pi-times"
        text
        size="small"
        severity="secondary"
        @click="clearFilters"
      />
      <div class="flex w-full flex-wrap gap-2 sm:w-auto sm:ml-auto">
        <Button
          label="Copy Forward"
          icon="pi pi-copy"
          outlined
          class="min-h-11"
          :disabled="!hasCopyForwardCandidates || loading || saving"
          title="Fill empty inputs with previous month values"
          @click="copyForward"
        />
        <Button
          :label="saving ? 'Saving…' : `Save All${itemsToSaveCount > 0 ? ` (${itemsToSaveCount})` : ''}`"
          icon="pi pi-save"
          class="min-h-11"
          :loading="saving"
          :disabled="itemsToSaveCount === 0 || saving || loading"
          @click="saveAll"
        />
      </div>
    </div>

    <!-- ── Save summary ────────────────────────────────────────────────────── -->
    <div v-if="saveSummary" class="mb-4">
      <Message
        :severity="saveSummary.failed > 0 ? 'warn' : 'success'"
        class="w-full"
      >
        <span>
          Saved —
          <strong>{{ saveSummary.created }}</strong> created,
          <strong>{{ saveSummary.updated }}</strong> updated,
          <strong>{{ saveSummary.skipped }}</strong> skipped,
          <strong>{{ saveSummary.failed }}</strong> failed
        </span>
      </Message>
    </div>

    <!-- ── Global save error ───────────────────────────────────────────────── -->
    <div v-if="saveError" class="mb-4">
      <Message severity="error" class="w-full">{{ saveError }}</Message>
    </div>

    <div
      v-if="loading && !initLoading"
      class="mb-3 text-xs font-medium text-gray-500 dark:text-zinc-400"
      role="status"
      aria-live="polite"
    >
      Updating month…
    </div>

    <!-- ── Load error ──────────────────────────────────────────────────────── -->
    <div v-if="error && !initLoading" class="mb-4">
      <Message severity="error" class="w-full">Could not load data: {{ error }}</Message>
      <div class="mt-2">
        <Button label="Retry" link size="small" @click="loadMonthData" />
      </div>
    </div>

    <!-- ── Loading skeleton ────────────────────────────────────────────────── -->
    <Skeleton v-if="initLoading" height="20rem" border-radius="8px" />

    <!-- ── Empty state (no assets) ────────────────────────────────────────── -->
    <div
      v-else-if="!error && rows.length === 0"
      class="flex flex-col items-center justify-center py-16 text-center text-gray-400 dark:text-zinc-500"
    >
      <i class="pi pi-inbox text-4xl mb-4 opacity-40" />
      <p class="text-base font-medium mb-1">No assets found</p>
      <p class="text-sm">Add assets in <strong>Admin</strong> to start tracking values.</p>
    </div>

    <!-- ── Content ─────────────────────────────────────────────────────────── -->
    <template v-else-if="!initLoading && !error">
      <!-- Filtered empty state -->
      <div
        v-if="filteredRows.length === 0"
        class="flex flex-col items-center justify-center py-10 text-center text-gray-400 dark:text-zinc-500"
      >
        <i class="pi pi-filter-slash text-3xl mb-3 opacity-40" />
        <p class="text-sm">No rows match the current filters.</p>
      </div>

      <!-- ── Mobile cards (hidden on sm+) ─────────────────────────────────── -->
      <div class="block sm:hidden space-y-3">
        <div
          v-for="row in filteredRows"
          :key="row.assetId"
          data-testid="monthly-row"
          class="wt-card p-4"
          :class="row.rowError
            ? 'border-l-4 border-l-red-500'
            : hasBigChange(row)
              ? 'border-l-4 border-l-red-400 bg-red-100 dark:bg-red-900/30'
              : row.existingDpId
                ? 'border-l-4 border-l-emerald-400'
                : ''"
        >
          <div class="flex items-start justify-between gap-2 mb-3">
            <div class="min-w-0">
              <p class="font-medium text-sm text-gray-900 dark:text-zinc-100">{{ row.assetName }}</p>
              <p class="text-xs text-gray-500 dark:text-zinc-400 mt-0.5">
                {{ row.categoryName }} · {{ row.personName }}
              </p>
              <span
                class="inline-block mt-1 text-xs px-1.5 py-0.5 rounded"
                :class="typeBadgeClass(row.categoryType)"
              >{{ typeLabel(row.categoryType) }}</span>
            </div>
            <div class="text-right shrink-0 text-xs text-gray-500 dark:text-zinc-400">
              <p>{{ displayedPrevMonth }}</p>
              <p class="font-medium text-gray-700 dark:text-zinc-300">{{ formatValue(row.prevValue) }}</p>
            </div>
          </div>
          <div>
            <label class="block text-xs text-gray-500 dark:text-zinc-400 mb-1">{{ displayedMonth }}</label>
            <input
              type="number"
              :value="row.inputValue ?? ''"
              :placeholder="row.categoryType === 'liability' ? 'e.g. -50000' : 'e.g. 10000'"
              step="1"
              :aria-label="`Value for ${row.assetName} in ${displayedMonth}`"
              class="wt-number-input wt-month-value-input w-full"
              :disabled="loading || saving"
              :class="[
                row.rowError ? 'wt-month-value-input-error' : '',
                row.categoryType === 'liability' ? 'text-red-600 dark:text-red-300' : 'text-gray-900 dark:text-zinc-100',
              ]"
              @input="handleValueInput(row, $event)"
            />
            <p v-if="row.rowError" class="text-xs text-red-600 dark:text-red-400 mt-1">{{ row.rowError }}</p>
            <p
              v-else-if="row.categoryType === 'liability' && row.inputValue === null"
              class="text-xs text-orange-500 dark:text-orange-400 mt-1"
            >Enter a negative value (e.g. -50000 for €50k debt)</p>
          </div>
        </div>
      </div>

      <!-- ── Desktop table (hidden below sm) ──────────────────────────────── -->
      <div class="hidden sm:block overflow-x-auto">
        <table
          v-if="filteredRows.length > 0"
          class="w-full text-sm border-collapse"
        >
          <thead>
            <tr class="border-b border-gray-200 dark:border-zinc-700">
              <th class="text-left py-2 pr-3 font-medium text-gray-500 dark:text-zinc-400 text-xs uppercase tracking-wide">Asset</th>
              <th class="text-left py-2 pr-3 font-medium text-gray-500 dark:text-zinc-400 text-xs uppercase tracking-wide">Type</th>
              <th class="text-left py-2 pr-3 font-medium text-gray-500 dark:text-zinc-400 text-xs uppercase tracking-wide">Category</th>
              <th class="text-left py-2 pr-3 font-medium text-gray-500 dark:text-zinc-400 text-xs uppercase tracking-wide">Person</th>
              <th class="text-right py-2 pr-3 font-medium text-gray-500 dark:text-zinc-400 text-xs uppercase tracking-wide">{{ displayedPrevMonth }}</th>
              <th class="text-right py-2 pr-3 font-medium text-gray-500 dark:text-zinc-400 text-xs uppercase tracking-wide">{{ displayedMonth }}</th>
              <th class="text-left py-2 font-medium text-gray-500 dark:text-zinc-400 text-xs uppercase tracking-wide">Status</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="row in filteredRows"
              :key="row.assetId"
              data-testid="monthly-row"
              class="border-b border-gray-100 dark:border-zinc-800 hover:bg-gray-50 dark:hover:bg-zinc-800/50 transition-colors"
              :class="row.rowError
                ? 'bg-red-50/50 dark:bg-red-900/10'
                : hasBigChange(row)
                  ? 'bg-red-100 dark:bg-red-900/30'
                  : ''"
            >
              <td class="py-2 pr-3 font-medium text-gray-900 dark:text-zinc-100">{{ row.assetName }}</td>
              <td class="py-2 pr-3">
                <span
                  class="inline-block text-xs px-1.5 py-0.5 rounded"
                  :class="typeBadgeClass(row.categoryType)"
                >{{ typeLabel(row.categoryType) }}</span>
              </td>
              <td class="py-2 pr-3 text-gray-600 dark:text-zinc-400">{{ row.categoryName }}</td>
              <td class="py-2 pr-3 text-gray-600 dark:text-zinc-400">{{ row.personName }}</td>
              <td class="py-2 pr-3 text-right text-gray-500 dark:text-zinc-500 tabular-nums">
                {{ formatValue(row.prevValue) }}
              </td>
              <td class="py-2 pr-3">
                <div class="flex flex-col gap-1">
                  <input
                    type="number"
                    :value="row.inputValue ?? ''"
                    :placeholder="row.categoryType === 'liability' ? 'e.g. -50000' : 'e.g. 10000'"
                    step="1"
                    :aria-label="`Value for ${row.assetName} in ${displayedMonth}`"
                    class="wt-number-input wt-month-value-input w-36"
                    :disabled="loading || saving"
                    :class="[
                      row.rowError ? 'wt-month-value-input-error' : '',
                      row.categoryType === 'liability' ? 'text-red-600 dark:text-red-300' : 'text-gray-900 dark:text-zinc-100',
                    ]"
                    @input="handleValueInput(row, $event)"
                  />
                  <p
                    v-if="row.categoryType === 'liability' && row.inputValue === null"
                    class="text-xs text-orange-500 dark:text-orange-400"
                  >Negative value</p>
                </div>
              </td>
              <td class="py-2">
                <span v-if="row.rowError" class="text-xs text-red-600 dark:text-red-400">{{ row.rowError }}</span>
                <span
                  v-else-if="row.existingDpId && row.inputValue === row.existingValue"
                  class="text-xs text-emerald-600 dark:text-emerald-400"
                >✓ saved</span>
                <span
                  v-else-if="row.inputValue !== null"
                  class="text-xs text-blue-500 dark:text-blue-400"
                >unsaved</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>
  </div>
</template>
