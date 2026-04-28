<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { getAssets, getCategories, getPersons, createAsset, updateAsset, deleteAsset, ApiError } from '../../api/client'
import type { Asset, Category, Person, CreateAssetPayload, UpdateAssetPayload } from '../../types/index'
import AssetModal from './AssetModal.vue'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import Button from 'primevue/button'
import Select from 'primevue/select'
import Message from 'primevue/message'
import Skeleton from 'primevue/skeleton'
import Dialog from 'primevue/dialog'
import { useDataRefresh } from '../../composables/useDataRefresh'

type ModalState = { mode: 'create' } | { mode: 'edit'; item: Asset }
type DeleteState =
  | { phase: 'confirm'; id: string; name: string }
  | { phase: 'force'; id: string; name: string; dataPointCount: number }

const TYPE_LABELS: Record<string, string> = {
  asset: 'Asset',
  'cash-inflow': 'Income',
  liability: 'Liability',
}

const props = defineProps<{
  categoryType: 'asset' | 'cash-inflow' | 'liability'
}>()
const emit = defineEmits<{
  'update:count': [count: number]
}>()

const rows = ref<Asset[]>([])
const categories = ref<Category[]>([])
const persons = ref<Person[]>([])
const loading = ref(true)
const error = ref<string | null>(null)
const retryCount = ref(0)
const sortField = ref('name')
const sortOrder = ref<1 | -1>(1)
const filterPersonId = ref<string | null>(null)
const modal = ref<ModalState | null>(null)
const saving = ref(false)
const saveError = ref<string | null>(null)
const deleteState = ref<DeleteState | null>(null)
const deleting = ref(false)
const { referenceDataVersion, notifyReferenceDataChanged } = useDataRefresh()

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

watch(referenceDataVersion, () => {
  retryCount.value++
})

const categoryMap = computed(() => Object.fromEntries(categories.value.map(c => [c.id, c])))
const personMap = computed(() => Object.fromEntries(persons.value.map(p => [p.id, p])))

// Only categories matching the current tab type
const filteredCategories = computed(() =>
  categories.value.filter(c => c.type === props.categoryType),
)
const filteredCategoryIds = computed(() => new Set(filteredCategories.value.map(c => c.id)))

const displayRows = computed(() =>
  rows.value
    .filter(asset => filteredCategoryIds.value.has(asset.category_id))
    .filter(asset => !filterPersonId.value || asset.person_id === filterPersonId.value)
    .map(asset => ({
      ...asset,
      categoryName: categoryMap.value[asset.category_id]?.name ?? asset.category_id,
      personName: personMap.value[asset.person_id ?? '']?.name ?? '—',
      growthFormatted: asset.projected_yearly_growth === null ? 'Inherits' : `${(asset.projected_yearly_growth * 100).toFixed(2)}%`,
    }))
)

watch(displayRows, value => emit('update:count', value.length), { immediate: true })

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
    notifyReferenceDataChanged()
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

function openCreate() {
  modal.value = { mode: 'create' }
}

defineExpose({ openCreate })

async function handleConfirm() {
  if (!deleteState.value) return
  deleting.value = true
  try {
    const result = await deleteAsset(deleteState.value.id)
    if (result.ok) {
      deleteState.value = null
      retryCount.value++
      notifyReferenceDataChanged()
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
    notifyReferenceDataChanged()
  } finally {
    deleting.value = false
  }
}
</script>

<template>
  <div>
    <div v-if="error" class="mb-4">
      <Message severity="error" class="w-full">Could not load data: {{ error }}</Message>
      <div class="mt-2">
        <Button label="Retry" link size="small" @click="retryCount++" />
      </div>
    </div>

    <Skeleton v-if="loading" height="8rem" border-radius="8px" />

    <div v-else-if="!error && persons.length > 0" class="mb-3 flex flex-wrap items-center gap-3">
      <Select
        v-model="filterPersonId"
        :options="persons"
        option-label="name"
        option-value="id"
        placeholder="All people"
        show-clear
        class="w-40"
        :pt="{ root: { 'aria-label': 'Filter by person' } }"
      />
    </div>

    <div v-if="!loading && !error && displayRows.length === 0"
      class="flex flex-col items-center justify-center py-16 text-center text-gray-400 dark:text-zinc-500">
      <i class="pi pi-inbox text-4xl mb-4 opacity-40" />
      <p class="text-base font-medium mb-1">No {{ tabLabel.toLowerCase() }} yet</p>
      <p class="text-sm">Click <strong>+ Add {{ tabLabel }}</strong> to get started.</p>
    </div>

    <DataTable
      v-if="!loading && !error && displayRows.length > 0"
      class="wt-admin-table"
      :value="displayRows"
      :sort-field="sortField"
      :sort-order="sortOrder"
      :pt="{ table: { 'aria-label': `${tabLabel} table` } }"
      @sort="(e) => { sortField = (e.sortField as string) ?? sortField; sortOrder = (e.sortOrder as 1 | -1) ?? sortOrder }"
      striped-rows
      size="small"
    >
      <Column field="name" header="Name" sortable>
        <template #body="{ data: row }">
          <div class="min-w-44">
            <p class="font-medium text-gray-900 dark:text-zinc-100">{{ row.name }}</p>
            <p class="mt-0.5 text-xs text-gray-400 dark:text-zinc-500">{{ row.id }}</p>
          </div>
        </template>
      </Column>
      <Column field="categoryName" header="Category" sortable>
        <template #body="{ data: row }">
          <div class="inline-flex items-center gap-2 rounded-full bg-gray-50 px-2 py-1 text-xs font-medium text-gray-700 dark:bg-zinc-800 dark:text-zinc-300">
            <span class="h-2 w-2 rounded-full" :style="{ backgroundColor: categoryMap[row.category_id]?.color ?? '#64748b' }" />
            {{ row.categoryName }}
          </div>
        </template>
      </Column>
      <Column field="growthFormatted" header="Growth Rate">
        <template #body="{ data: row }">
          <span
            class="inline-flex rounded-full px-2 py-1 text-xs font-semibold tabular-nums"
            :class="row.projected_yearly_growth === null
              ? 'bg-gray-100 text-gray-600 dark:bg-zinc-800 dark:text-zinc-400'
              : row.projected_yearly_growth < 0
                ? 'bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300'
                : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'"
          >{{ row.growthFormatted }}</span>
        </template>
      </Column>
      <Column field="notes" header="Notes">
        <template #body="{ data: row }">
          <span class="block max-w-56 truncate text-gray-500 dark:text-zinc-500">{{ row.notes ?? '—' }}</span>
        </template>
      </Column>
      <Column field="personName" header="Person">
        <template #body="{ data: row }">
          <span class="text-gray-700 dark:text-zinc-300">{{ row.personName }}</span>
        </template>
      </Column>
      <Column header="Actions" style="width: 8rem">
        <template #body="{ data: row }">
          <div class="flex items-center justify-end gap-1">
            <Button icon="pi pi-pencil" text size="small" :aria-label="`Edit asset ${row.name}`"
              @click="() => { const orig = rows.find(r => r.id === row.id); if (orig) modal = { mode: 'edit', item: orig } }" />
            <Button icon="pi pi-trash" text size="small" severity="danger" :aria-label="`Delete asset ${row.name}`"
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
      :entity-label="tabLabel"
      :categories="filteredCategories"
      :persons="persons"
      :existing-ids="rows.map(a => a.id)"
      :saving="saving"
      :save-error="saveError"
      :on-save="handleSave"
      :on-cancel="() => { modal = null; saveError = null; }"
    />
  </div>
</template>
