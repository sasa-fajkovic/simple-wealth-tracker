<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import {
  getDataPoints, getAssets, getCategories, getPersons,
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

const confirm = useConfirm()

const eurFormatter = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' })
const TEN_MINUTES_MS = 10 * 60 * 1000

type ModalState = { mode: 'create' } | { mode: 'edit'; item: DataPoint }

const rows = ref<DataPoint[]>([])
const assets = ref<Asset[]>([])
const categories = ref<Category[]>([])
const persons = ref<Person[]>([])
const loading = ref(true)
const error = ref<string | null>(null)
const retryCount = ref(0)
const sortField = ref('year_month')
const sortOrder = ref<-1 | 1>(-1)
const modal = ref<ModalState | null>(null)
const saving = ref(false)
const saveError = ref<string | null>(null)

const filterPersonId = ref<string | null>(null)
const filterAssetId = ref<string | null>(null)
const filterCategoryId = ref<string | null>(null)

watch(retryCount, async () => {
  loading.value = true
  error.value = null
  try {
    const [pts, ast, cats, ppl] = await Promise.all([
      getDataPoints(), getAssets(), getCategories(), getPersons(),
    ])
    rows.value = pts
    assets.value = ast
    categories.value = cats
    persons.value = ppl
  } catch (e) {
    error.value = e instanceof ApiError ? e.message : 'Unexpected error'
  } finally {
    loading.value = false
  }
}, { immediate: true })

const assetMap = computed(() => Object.fromEntries(assets.value.map(a => [a.id, a])))
const categoryMap = computed(() => Object.fromEntries(categories.value.map(c => [c.id, c])))
const personMap = computed(() => Object.fromEntries(persons.value.map(p => [p.id, p])))

function formatCreatedAt(iso: string) {
  return new Date(iso).toLocaleString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

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

const displayRows = computed(() => allRows.value.filter(row => {
  if (filterPersonId.value && row.personId !== filterPersonId.value) return false
  if (filterCategoryId.value && row.categoryId !== filterCategoryId.value) return false
  if (filterAssetId.value && row.asset_id !== filterAssetId.value) return false
  return true
}))

const hasFilters = computed(() => filterPersonId.value || filterCategoryId.value || filterAssetId.value)

const filteredAssetOptions = computed(() => assets.value.filter(a => {
  if (filterPersonId.value && a.person_id !== filterPersonId.value) return false
  if (filterCategoryId.value && a.category_id !== filterCategoryId.value) return false
  return true
}))

const editItem = computed(() =>
  modal.value?.mode === 'edit' ? (modal.value as { mode: 'edit'; item: DataPoint }).item : undefined
)

async function handleSave(payload: CreateDataPointPayload | UpdateDataPointPayload) {
  saving.value = true
  saveError.value = null
  try {
    if (modal.value?.mode === 'create') {
      await createDataPoint(payload as CreateDataPointPayload)
    } else if (modal.value?.mode === 'edit') {
      await updateDataPoint((modal.value as { mode: 'edit'; item: DataPoint }).item.id, payload as UpdateDataPointPayload)
    }
    modal.value = null
    retryCount.value++
  } catch (e) {
    saveError.value = e instanceof ApiError ? e.message : 'Unexpected error'
  } finally {
    saving.value = false
  }
}

async function handleDelete(id: string) {
  await deleteDataPoint(id)
  retryCount.value++
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

function clearFilters() {
  filterPersonId.value = null
  filterCategoryId.value = null
  filterAssetId.value = null
}
</script>

<template>
  <div>
    <div class="flex flex-wrap items-center gap-3 mb-4">
      <Select
        v-model="filterPersonId"
        :options="persons"
        option-label="name"
        option-value="id"
        placeholder="All people"
        show-clear
        class="w-40"
        @update:model-value="filterAssetId = null"
      />
      <Select
        v-model="filterCategoryId"
        :options="categories"
        option-label="name"
        option-value="id"
        placeholder="All categories"
        show-clear
        class="w-44"
        @update:model-value="filterAssetId = null"
      />
      <Select
        v-model="filterAssetId"
        :options="filteredAssetOptions"
        option-label="name"
        option-value="id"
        placeholder="All assets"
        show-clear
        class="w-44"
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

    <div v-if="error" class="mb-4">
      <Message severity="error" class="w-full">Could not load data: {{ error }}</Message>
      <div class="mt-2">
        <Button label="Retry" link size="small" @click="retryCount++" />
      </div>
    </div>

    <Skeleton v-if="loading" height="8rem" border-radius="8px" />

    <DataTable
      v-if="!loading && !error"
      :value="displayRows"
      :sort-field="sortField"
      :sort-order="sortOrder"
      @sort="(e) => { sortField = (e.sortField as string) ?? sortField; sortOrder = (e.sortOrder as -1 | 1) ?? sortOrder }"
      :row-class="(row: typeof displayRows.value[number]) => row.isRecent ? 'row-recent' : ''"
      empty-message="No data points match the current filters."
      striped-rows
      size="small"
    >
      <Column field="year_month" header="Date" sortable />
      <Column field="assetName" header="Asset" sortable />
      <Column field="categoryName" header="Category" sortable />
      <Column field="personName" header="Person" sortable />
      <Column field="value" header="Value" sortable>
        <template #body="{ data: row }">{{ row.valueFormatted }}</template>
      </Column>
      <Column field="notes" header="Notes">
        <template #body="{ data: row }">{{ row.notes ?? '—' }}</template>
      </Column>
      <Column field="addedAt" header="Added" sortable />
      <Column header="Actions" style="width: 8rem">
        <template #body="{ data: row }">
          <div class="flex items-center gap-2">
            <Button icon="pi pi-pencil" text size="small" aria-label="Edit"
              @click="() => { const orig = rows.find(r => r.id === row.id); if (orig) modal = { mode: 'edit', item: orig } }" />
            <Button icon="pi pi-trash" text size="small" severity="danger" aria-label="Delete"
              @click="openConfirm(row.id)" />
          </div>
        </template>
      </Column>
    </DataTable>

    <DataPointModal
      v-if="modal"
      :mode="modal.mode"
      :item="editItem"
      :assets="assets"
      :saving="saving"
      :save-error="saveError"
      :on-save="handleSave"
      :on-cancel="() => { modal = null; saveError = null; }"
    />
  </div>
</template>
