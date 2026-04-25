<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { getAssets, getCategories, getPersons, createAsset, updateAsset, deleteAsset, ApiError } from '../../api/client'
import type { Asset, Category, Person, CreateAssetPayload, UpdateAssetPayload } from '../../types/index'
import AssetModal from './AssetModal.vue'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import Button from 'primevue/button'
import Message from 'primevue/message'
import Skeleton from 'primevue/skeleton'
import Dialog from 'primevue/dialog'

type ModalState = { mode: 'create' } | { mode: 'edit'; item: Asset }
type DeleteState =
  | { phase: 'confirm'; id: string; name: string }
  | { phase: 'force'; id: string; name: string; dataPointCount: number }

const TYPE_LABELS: Record<string, string> = {
  asset: 'Asset',
  'cash-inflow': 'Cash Inflow',
  liability: 'Liability',
}

const props = defineProps<{
  categoryType: 'asset' | 'cash-inflow' | 'liability'
}>()

const rows = ref<Asset[]>([])
const categories = ref<Category[]>([])
const persons = ref<Person[]>([])
const loading = ref(true)
const error = ref<string | null>(null)
const retryCount = ref(0)
const sortField = ref('name')
const sortOrder = ref<1 | -1>(1)
const modal = ref<ModalState | null>(null)
const saving = ref(false)
const saveError = ref<string | null>(null)
const deleteState = ref<DeleteState | null>(null)
const deleting = ref(false)

watch(retryCount, async () => {
  loading.value = true
  error.value = null
  try {
    const [ast, cats, ppl] = await Promise.all([getAssets(), getCategories(), getPersons()])
    rows.value = ast
    categories.value = cats
    persons.value = ppl
  } catch (e) {
    error.value = e instanceof ApiError ? e.message : 'Unexpected error'
  } finally {
    loading.value = false
  }
}, { immediate: true })

const categoryMap = computed(() => Object.fromEntries(categories.value.map(c => [c.id, c])))
const personMap = computed(() => Object.fromEntries(persons.value.map(p => [p.id, p])))

// Only categories matching the current tab type
const filteredCategories = computed(() =>
  categories.value.filter(c => {
    const t = c.type ?? (c.track_only ? 'cash-inflow' : 'asset')
    return t === props.categoryType
  })
)
const filteredCategoryIds = computed(() => new Set(filteredCategories.value.map(c => c.id)))

const displayRows = computed(() =>
  rows.value
    .filter(asset => filteredCategoryIds.value.has(asset.category_id))
    .map(asset => ({
      ...asset,
      categoryName: categoryMap.value[asset.category_id]?.name ?? asset.category_id,
      personName: personMap.value[asset.person_id ?? '']?.name ?? '—',
      growthFormatted: asset.projected_yearly_growth === null ? 'Inherits' : `${(asset.projected_yearly_growth * 100).toFixed(2)}%`,
    }))
)

const tabLabel = computed(() => TYPE_LABELS[props.categoryType] ?? 'Items')

async function handleSave(payload: CreateAssetPayload | UpdateAssetPayload) {
  saving.value = true
  saveError.value = null
  try {
    if (modal.value?.mode === 'create') {
      await createAsset(payload as CreateAssetPayload)
    } else if (modal.value?.mode === 'edit') {
      await updateAsset((modal.value as { mode: 'edit'; item: Asset }).item.id, payload as UpdateAssetPayload)
    }
    modal.value = null
    retryCount.value++
  } catch (e) {
    saveError.value = e instanceof ApiError ? e.message : 'Unexpected error'
  } finally {
    saving.value = false
  }
}

const editItem = computed(() =>
  modal.value?.mode === 'edit' ? (modal.value as { mode: 'edit'; item: Asset }).item : undefined
)

function handleDeleteClick(row: typeof displayRows.value[number]) {
  deleteState.value = { phase: 'confirm', id: row.id, name: row.name }
}

async function handleConfirm() {
  if (!deleteState.value) return
  deleting.value = true
  try {
    const result = await deleteAsset(deleteState.value.id)
    if (result.ok) {
      deleteState.value = null
      retryCount.value++
    } else if (!result.ok && result.needs_confirm) {
      deleteState.value = {
        phase: 'force',
        id: deleteState.value.id,
        name: deleteState.value.name,
        dataPointCount: result.data_point_count,
      }
    }
  } finally {
    deleting.value = false
  }
}

async function handleForceConfirm() {
  if (!deleteState.value || deleteState.value.phase !== 'force') return
  deleting.value = true
  try {
    await deleteAsset(deleteState.value.id, true)
    deleteState.value = null
    retryCount.value++
  } finally {
    deleting.value = false
  }
}
</script>

<template>
  <div>
    <div class="flex items-center justify-between mb-4">
      <h2 class="text-sm font-medium text-gray-700 dark:text-zinc-300">{{ tabLabel }}</h2>
      <Button :label="`Add ${tabLabel}`" icon="pi pi-plus" size="small" @click="modal = { mode: 'create' }" />
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
      @sort="(e) => { sortField = (e.sortField as string) ?? sortField; sortOrder = (e.sortOrder as 1 | -1) ?? sortOrder }"
      :empty-message="`No ${tabLabel.toLowerCase()} yet. Click 'Add ${tabLabel}' to get started.`"
      striped-rows
      size="small"
    >
      <Column field="name" header="Name" sortable />
      <Column field="categoryName" header="Category" sortable />
      <Column field="growthFormatted" header="Growth Rate" />
      <Column field="location" header="Location">
        <template #body="{ data: row }">{{ row.location ?? '—' }}</template>
      </Column>
      <Column field="notes" header="Notes">
        <template #body="{ data: row }">{{ row.notes ?? '—' }}</template>
      </Column>
      <Column field="personName" header="Person" />
      <Column header="Actions" style="width: 8rem">
        <template #body="{ data: row }">
          <div class="flex items-center gap-2">
            <Button icon="pi pi-pencil" text size="small" aria-label="Edit"
              @click="() => { const orig = rows.find(r => r.id === row.id); if (orig) modal = { mode: 'edit', item: orig } }" />
            <Button icon="pi pi-trash" text size="small" severity="danger" aria-label="Delete"
              @click="handleDeleteClick(row)" />
          </div>
        </template>
      </Column>
    </DataTable>

    <Dialog
      :visible="!!deleteState"
      :header="deleteState ? `Delete &quot;${deleteState.name}&quot;?` : ''"
      :style="{ width: '30rem' }"
      @update:visible="(v) => !v && (deleteState = null)"
      modal
    >
      <template v-if="deleteState?.phase === 'confirm'">
        <p class="text-sm text-gray-700 dark:text-zinc-300">Are you sure you want to delete <strong>{{ deleteState.name }}</strong>? This cannot be undone.</p>
      </template>
      <template v-else-if="deleteState?.phase === 'force'">
        <p class="text-sm text-gray-700 dark:text-zinc-300">
          This asset has <strong>{{ deleteState.dataPointCount }}</strong> data point(s) that will also be permanently deleted. This cannot be undone.
        </p>
      </template>
      <template #footer>
        <div class="flex justify-end gap-2">
          <Button label="Cancel" text size="small" @click="deleteState = null" />
          <Button
            v-if="deleteState?.phase === 'force'"
            label="Delete permanently"
            severity="danger"
            size="small"
            :loading="deleting"
            @click="handleForceConfirm"
          />
          <Button
            v-else
            label="Delete"
            severity="danger"
            size="small"
            :loading="deleting"
            @click="handleConfirm"
          />
        </div>
      </template>
    </Dialog>

    <AssetModal
      v-if="modal"
      :mode="modal.mode"
      :item="editItem"
      :categories="filteredCategories"
      :persons="persons"
      :saving="saving"
      :save-error="saveError"
      :on-save="handleSave"
      :on-cancel="() => { modal = null; saveError = null; }"
    />
  </div>
</template>

