<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import {
  getDataPointsPage, getAssets, getCategories, getPersons,
  createDataPoint, updateDataPoint, deleteDataPoint, ApiError,
} from '../../api/client'
import type { DataPoint, Asset, Category, Person, CreateDataPointPayload, UpdateDataPointPayload } from '../../types/index'
import DataPointModal from './DataPointModal.vue'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import Button from 'primevue/button'
import Select from 'primevue/select'
import Message from 'primevue/message'
import Skeleton from 'primevue/skeleton'
import { useConfirm } from 'primevue/useconfirm'
import { useDataRefresh } from '../../composables/useDataRefresh'

const confirm = useConfirm()

const PAGE_SIZE = 25
const eurFormatter = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' })
const TEN_MINUTES_MS = 10 * 60 * 1000

type ModalState = { mode: 'create' } | { mode: 'edit'; item: DataPoint }

// ── State ─────────────────────────────────────────────────────────────────────

const rows = ref<DataPoint[]>([])
const assets = ref<Asset[]>([])
const categories = ref<Category[]>([])
const persons = ref<Person[]>([])
const loading = ref(true)
const error = ref<string | null>(null)
// Bump to reload data points after CRUD without resetting page
const dataRetryCount = ref(0)
const page = ref(0)
const totalCount = ref(0)
const modal = ref<ModalState | null>(null)
const saving = ref(false)
const saveError = ref<string | null>(null)
const { referenceDataVersion, dataPointsVersion, notifyDataPointsChanged } = useDataRefresh()

const filterPersonId = ref<string | null>(null)
const filterAssetId = ref<string | null>(null)
const filterCategoryId = ref<string | null>(null)

// ── Derived ───────────────────────────────────────────────────────────────────

const assetMap = computed(() => Object.fromEntries(assets.value.map(a => [a.id, a])))
const categoryMap = computed(() => Object.fromEntries(categories.value.map(c => [c.id, c])))
const personMap = computed(() => Object.fromEntries(persons.value.map(p => [p.id, p])))

const hasFilters = computed(() => !!(filterPersonId.value || filterCategoryId.value || filterAssetId.value))

const filteredAssetOptions = computed(() => assets.value.filter(a => {
  if (filterPersonId.value && a.person_id !== filterPersonId.value) return false
  if (filterCategoryId.value && a.category_id !== filterCategoryId.value) return false
  return true
}))

const editItem = computed(() =>
  modal.value?.mode === 'edit' ? (modal.value as { mode: 'edit'; item: DataPoint }).item : undefined
)

const totalPages = computed(() => Math.ceil(totalCount.value / PAGE_SIZE))
const startRow = computed(() => totalCount.value === 0 ? 0 : page.value * PAGE_SIZE + 1)
const endRow = computed(() => Math.min((page.value + 1) * PAGE_SIZE, totalCount.value))

const allRows = computed(() => rows.value.map(row => {
  const asset = assetMap.value[row.asset_id]
  return {
    ...row,
    assetName: asset?.name ?? row.asset_id,
    categoryId: asset?.category_id ?? null,
    categoryName: categoryMap.value[asset?.category_id ?? '']?.name ?? '—',
    personId: asset?.person_id ?? null,
    personName: personMap.value[asset?.person_id ?? '']?.name ?? '—',
    valueFormatted: eurFormatter.format(row.value),
    addedAt: formatCreatedAt(row.created_at),
    isRecent: Date.now() - new Date(row.created_at).getTime() < TEN_MINUTES_MS,
  }
}))

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatCreatedAt(iso: string) {
  return new Date(iso).toLocaleString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

// ── Data loading ──────────────────────────────────────────────────────────────

async function loadReferenceData() {
  try {
    const [ast, cats, ppl] = await Promise.all([getAssets(), getCategories(), getPersons()])
    assets.value = ast
    categories.value = cats
    persons.value = ppl
    if (filterPersonId.value && !ppl.some(p => p.id === filterPersonId.value)) filterPersonId.value = null
    if (filterCategoryId.value && !cats.some(c => c.id === filterCategoryId.value)) filterCategoryId.value = null
    if (filterAssetId.value && !ast.some(a => a.id === filterAssetId.value)) filterAssetId.value = null
  } catch (e) {
    error.value = e instanceof ApiError ? e.message : 'Unexpected error'
  }
}

onMounted(loadReferenceData)

async function loadDataPoints() {
  loading.value = true
  error.value = null
  try {
    const fetchParams = {
      limit: PAGE_SIZE,
      offset: page.value * PAGE_SIZE,
      person_id: filterPersonId.value ?? undefined,
      asset_id: filterAssetId.value ?? undefined,
      category_id: filterCategoryId.value ?? undefined,
    }
    let result = await getDataPointsPage(fetchParams)
    // If current page is now empty but data still exists (e.g. deleted last item on page),
    // jump to the last available page.
    if (result.items.length === 0 && result.total > 0 && page.value > 0) {
      page.value = Math.max(0, Math.ceil(result.total / PAGE_SIZE) - 1)
      result = await getDataPointsPage({ ...fetchParams, offset: page.value * PAGE_SIZE })
    }
    rows.value = result.items
    totalCount.value = result.total
  } catch (e) {
    error.value = e instanceof ApiError ? e.message : 'Unexpected error'
  } finally {
    loading.value = false
  }
}

// Reload current page when dataRetryCount changes (after CRUD)
watch(dataRetryCount, loadDataPoints, { immediate: true })
watch(referenceDataVersion, async () => {
  await loadReferenceData()
  page.value = 0
  await loadDataPoints()
})
watch(dataPointsVersion, loadDataPoints)

// ── Pagination ────────────────────────────────────────────────────────────────

function goToPage(newPage: number) {
  page.value = newPage
  loadDataPoints()
}

// ── Filters ───────────────────────────────────────────────────────────────────

function applyFilter() {
  page.value = 0
  loadDataPoints()
}

function clearFilters() {
  filterPersonId.value = null
  filterCategoryId.value = null
  filterAssetId.value = null
  page.value = 0
  loadDataPoints()
}

// ── CRUD handlers ─────────────────────────────────────────────────────────────

async function handleSave(payload: CreateDataPointPayload | UpdateDataPointPayload) {
  saving.value = true
  saveError.value = null
  let success = false
  try {
    if (modal.value?.mode === 'create') {
      await createDataPoint(payload as CreateDataPointPayload)
      page.value = 0 // go to first page so the new entry is visible
    } else if (modal.value?.mode === 'edit') {
      await updateDataPoint((modal.value as { mode: 'edit'; item: DataPoint }).item.id, payload as UpdateDataPointPayload)
    }
    success = true
  } catch (e) {
    saveError.value = e instanceof ApiError ? e.message : 'Unexpected error'
  } finally {
    saving.value = false
  }
  if (success) {
    modal.value = null
    notifyDataPointsChanged()
    loadDataPoints()
  }
}

async function handleDelete(id: string) {
  await deleteDataPoint(id)
  notifyDataPointsChanged()
  loadDataPoints()
}

function openConfirm(id: string) {
  confirm.require({
    message: 'Delete this data point? This cannot be undone.',
    header: 'Confirm Delete',
    icon: 'pi pi-exclamation-triangle',
    acceptProps: { severity: 'danger', label: 'Delete' },
    rejectProps: { outlined: true, severity: 'secondary', label: 'Cancel' },
    accept: () => handleDelete(id),
  })
}

function openEdit(id: string) {
  const orig = rows.value.find(r => r.id === id)
  if (orig) modal.value = { mode: 'edit', item: orig }
}
</script>

<template>
  <div>
    <!-- Filters + Add button -->
    <div class="flex flex-wrap items-center gap-3 mb-4">
      <Select
        v-model="filterPersonId"
        :options="persons"
        option-label="name"
        option-value="id"
        placeholder="All people"
        aria-label="Filter by person"
        show-clear
        class="w-40"
        @update:model-value="() => { filterAssetId = null; applyFilter() }"
      />
      <Select
        v-model="filterCategoryId"
        :options="categories"
        option-label="name"
        option-value="id"
        placeholder="All categories"
        aria-label="Filter by category"
        show-clear
        class="w-44"
        @update:model-value="() => { filterAssetId = null; applyFilter() }"
      />
      <Select
        v-model="filterAssetId"
        :options="filteredAssetOptions"
        option-label="name"
        option-value="id"
        placeholder="All assets"
        aria-label="Filter by asset"
        show-clear
        class="w-44"
        @update:model-value="applyFilter"
      />
      <Button
        v-if="hasFilters"
        label="Clear"
        icon="pi pi-times"
        text
        size="small"
        severity="secondary"
        @click="clearFilters"
      />
      <div class="ml-auto">
        <Button label="Add Data Point" icon="pi pi-plus" size="small" @click="modal = { mode: 'create' }" />
      </div>
    </div>

    <!-- Error -->
    <div v-if="error" class="mb-4">
      <Message severity="error" class="w-full">Could not load data: {{ error }}</Message>
      <div class="mt-2">
        <Button label="Retry" link size="small" @click="dataRetryCount++" />
      </div>
    </div>

    <!-- Loading skeleton -->
    <Skeleton v-if="loading" height="8rem" border-radius="8px" />

    <!-- Empty state: no data at all and no filters active -->
    <div
      v-else-if="!error && totalCount === 0 && !hasFilters"
      class="flex flex-col items-center justify-center py-16 text-center text-gray-400 dark:text-zinc-500"
    >
      <i class="pi pi-chart-line text-4xl mb-4 opacity-40" />
      <p class="text-base font-medium mb-1">No data points yet</p>
      <p class="text-sm">Click <strong>+ Add Data Point</strong> to record your first value.</p>
    </div>

    <!-- Content -->
    <template v-else-if="!loading && !error">
      <!-- ── Mobile card list (hidden on sm+) ──────────────────────────────── -->
      <div class="block sm:hidden">
        <div
          v-if="allRows.length === 0"
          class="flex flex-col items-center justify-center py-10 text-center text-gray-400 dark:text-zinc-500"
        >
          <i class="pi pi-filter-slash text-3xl mb-3 opacity-40" />
          <p class="text-sm">No data points match the current filters.</p>
        </div>
        <div v-else class="space-y-2">
          <div
            v-for="row in allRows"
            :key="row.id"
            class="wt-card p-3"
            :class="row.isRecent ? 'border-l-4 border-l-amber-400' : ''"
          >
            <div class="flex items-start justify-between gap-2">
              <div class="min-w-0">
                <p class="font-medium text-sm text-gray-900 dark:text-zinc-100 truncate">{{ row.assetName }}</p>
                <p class="text-xs text-gray-500 dark:text-zinc-400 mt-0.5">
                  {{ row.categoryName }} · {{ row.personName }}
                </p>
                <p class="text-xs text-gray-500 dark:text-zinc-400">{{ row.year_month }}</p>
              </div>
              <div class="text-right shrink-0">
                <p class="font-semibold text-sm text-gray-900 dark:text-zinc-100">{{ row.valueFormatted }}</p>
                <span
                  v-if="row.isRecent"
                  class="inline-block text-xs px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 mt-0.5"
                >New</span>
              </div>
            </div>
            <p v-if="row.notes" class="text-xs text-gray-500 dark:text-zinc-400 mt-1.5 truncate">{{ row.notes }}</p>
            <div class="flex gap-2 mt-2 pt-2 border-t border-gray-100 dark:border-zinc-700">
              <Button
                label="Edit"
                icon="pi pi-pencil"
                text
                class="flex-1 min-h-11 justify-center"
                :aria-label="`Edit data point for ${row.assetName} in ${row.year_month}`"
                @click="openEdit(row.id)"
              />
              <Button
                label="Delete"
                icon="pi pi-trash"
                text
                severity="danger"
                class="flex-1 min-h-11 justify-center"
                :aria-label="`Delete data point for ${row.assetName} in ${row.year_month}`"
                @click="openConfirm(row.id)"
              />
            </div>
          </div>
        </div>
      </div>

      <!-- ── Desktop table (hidden below sm) ──────────────────────────────── -->
      <div class="hidden sm:block">
        <DataTable
          :value="allRows"
          :row-class="(row: typeof allRows[number]) => row.isRecent ? 'row-recent' : ''"
          :pt="{ table: { 'aria-label': 'Data points table' } }"
          striped-rows
          size="small"
        >
          <template #empty>
            <div class="flex flex-col items-center justify-center py-10 text-center text-gray-400 dark:text-zinc-500">
              <i class="pi pi-filter-slash text-3xl mb-3 opacity-40" />
              <p class="text-sm">No data points match the current filters.</p>
            </div>
          </template>
          <Column field="year_month" header="Date" />
          <Column field="assetName" header="Asset" />
          <Column field="categoryName" header="Category" />
          <Column field="personName" header="Person" />
          <Column field="value" header="Value">
            <template #body="{ data: row }">{{ row.valueFormatted }}</template>
          </Column>
          <Column field="notes" header="Notes">
            <template #body="{ data: row }">{{ row.notes ?? '—' }}</template>
          </Column>
          <Column field="addedAt" header="Added" />
          <Column header="Actions" style="width: 9rem">
            <template #body="{ data: row }">
              <div class="flex items-center gap-1">
                <Button
                  icon="pi pi-pencil"
                  label="Edit"
                  text
                  class="min-h-11"
                  :aria-label="`Edit data point for ${row.assetName} in ${row.year_month}`"
                  @click="openEdit(row.id)"
                />
                <Button
                  icon="pi pi-trash"
                  label="Del"
                  text
                  class="min-h-11"
                  severity="danger"
                  :aria-label="`Delete data point for ${row.assetName} in ${row.year_month}`"
                  @click="openConfirm(row.id)"
                />
              </div>
            </template>
          </Column>
        </DataTable>
      </div>

      <!-- ── Pagination controls ───────────────────────────────────────────── -->
      <div class="flex items-center justify-between mt-4 text-sm text-gray-600 dark:text-zinc-400">
        <span v-if="totalCount > 0">
          Showing {{ startRow }}–{{ endRow }} of {{ totalCount }}
        </span>
        <span v-else>No results</span>
        <div class="flex items-center gap-1">
          <Button
            icon="pi pi-chevron-left"
            text
            class="min-h-11 min-w-11"
            :disabled="page === 0"
            aria-label="Previous page"
            @click="goToPage(page - 1)"
          />
          <span class="text-xs px-2 tabular-nums">{{ page + 1 }} / {{ Math.max(1, totalPages) }}</span>
          <Button
            icon="pi pi-chevron-right"
            text
            class="min-h-11 min-w-11"
            :disabled="page >= totalPages - 1"
            aria-label="Next page"
            @click="goToPage(page + 1)"
          />
        </div>
      </div>
    </template>

    <DataPointModal
      v-if="modal"
      :mode="modal.mode"
      :item="editItem"
      :assets="assets"
      :categories="categories"
      :persons="persons"
      :saving="saving"
      :save-error="saveError"
      :on-save="handleSave"
      :on-cancel="() => { modal = null; saveError = null; }"
    />
  </div>
</template>
