<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { getCategories, createCategory, updateCategory, deleteCategory, ApiError } from '../../api/client'
import type { Asset, Category, CreateCategoryPayload, UpdateCategoryPayload } from '../../types/index'
import CategoryModal from './CategoryModal.vue'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import Button from 'primevue/button'
import Message from 'primevue/message'
import Skeleton from 'primevue/skeleton'
import Dialog from 'primevue/dialog'
import Select from 'primevue/select'

type ModalState = { mode: 'create' } | { mode: 'edit'; item: Category }
type DeleteState =
  | { phase: 'confirm'; id: string; name: string }
  | { phase: 'reassign'; id: string; name: string; affectedAssets: Asset[]; reassignTo: string }

const rows = ref<Category[]>([])
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
const reassignError = ref<string | null>(null)

watch(retryCount, async () => {
  loading.value = true
  error.value = null
  try {
    rows.value = await getCategories()
  } catch (e) {
    error.value = e instanceof ApiError ? e.message : 'Unexpected error'
  } finally {
    loading.value = false
  }
}, { immediate: true })

async function handleSave(payload: CreateCategoryPayload | UpdateCategoryPayload) {
  saving.value = true
  saveError.value = null
  try {
    if (modal.value?.mode === 'create') {
      await createCategory(payload as CreateCategoryPayload)
    } else if (modal.value?.mode === 'edit') {
      await updateCategory((modal.value as { mode: 'edit'; item: Category }).item.id, payload as UpdateCategoryPayload)
    }
    modal.value = null
    retryCount.value++
  } catch (e) {
    saveError.value = e instanceof ApiError ? e.message : 'Unexpected error'
  } finally {
    saving.value = false
  }
}

function handleDeleteClick(cat: Category) {
  deleteState.value = { phase: 'confirm', id: cat.id, name: cat.name }
}

async function handleConfirm() {
  if (!deleteState.value) return
  deleting.value = true
  try {
    const result = await deleteCategory(deleteState.value.id)
    if (result.ok) {
      deleteState.value = null
      retryCount.value++
    } else if (!result.ok && result.needs_reassign) {
      const others = rows.value.filter(c => c.id !== deleteState.value!.id)
      deleteState.value = {
        phase: 'reassign',
        id: deleteState.value.id,
        name: deleteState.value.name,
        affectedAssets: result.assets,
        reassignTo: others[0]?.id ?? '',
      }
    }
  } finally {
    deleting.value = false
  }
}

async function handleReassignConfirm() {
  if (!deleteState.value || deleteState.value.phase !== 'reassign') return
  if (!deleteState.value.reassignTo) {
    reassignError.value = 'Please select a category to move the assets to.'
    return
  }
  deleting.value = true
  try {
    await deleteCategory(deleteState.value.id, deleteState.value.reassignTo)
    deleteState.value = null
    retryCount.value++
  } finally {
    deleting.value = false
  }
}

const editItem = computed(() =>
  modal.value?.mode === 'edit' ? (modal.value as { mode: 'edit'; item: Category }).item : undefined
)

const otherCategoryOptions = computed(() => {
  if (deleteState.value?.phase !== 'reassign') return []
  return rows.value
    .filter(c => c.id !== deleteState.value!.id)
    .map(c => ({ label: c.name, value: c.id }))
})

function setReassignTo(val: string) {
  if (deleteState.value?.phase === 'reassign') {
    deleteState.value = { ...deleteState.value, reassignTo: val }
    reassignError.value = null
  }
}

function closeDeleteDialog() {
  deleteState.value = null
  reassignError.value = null
}
</script>

<template>
  <div>
    <div class="flex items-center justify-between mb-4">
      <h2 class="text-sm font-medium text-gray-700 dark:text-zinc-300">Categories</h2>
      <Button label="Add Category" icon="pi pi-plus" size="small" @click="modal = { mode: 'create' }" />
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
      :value="rows"
      :sort-field="sortField"
      :sort-order="sortOrder"
      @sort="(e) => { sortField = (e.sortField as string) ?? sortField; sortOrder = (e.sortOrder as 1 | -1) ?? sortOrder }"
      empty-message="No categories yet. Click 'Add Category' to get started."
      striped-rows
      size="small"
    >
      <Column field="name" header="Name" sortable />
      <Column field="id" header="Slug" />
      <Column field="type" header="Type" sortable>
        <template #body="{ data: row }">
          <span :class="{
            'text-blue-600 dark:text-blue-400': row.type === 'asset',
            'text-green-600 dark:text-green-400': row.type === 'cash-inflow',
            'text-red-600 dark:text-red-400': row.type === 'liability',
          }">
            {{ row.type === 'asset' ? 'Asset' : row.type === 'cash-inflow' ? 'Cash Inflow' : 'Liability' }}
          </span>
        </template>
      </Column>
      <Column field="projected_yearly_growth" header="Growth Rate (%)" sortable>
        <template #body="{ data: row }">{{ (row.projected_yearly_growth * 100).toFixed(2) }}%</template>
      </Column>
      <Column header="Color">
        <template #body="{ data: row }">
          <div class="flex items-center gap-2">
            <span class="inline-block w-4 h-4 rounded border border-gray-200 dark:border-zinc-700 flex-shrink-0" :style="{ backgroundColor: row.color }" />
            <span class="text-sm font-medium text-gray-500 dark:text-zinc-400">{{ row.color }}</span>
          </div>
        </template>
      </Column>
      <Column header="Actions" style="width: 8rem">
        <template #body="{ data: row }">
          <div class="flex items-center gap-2">
            <Button icon="pi pi-pencil" text size="small" aria-label="Edit" @click="modal = { mode: 'edit', item: row }" />
            <Button icon="pi pi-trash" text size="small" severity="danger" aria-label="Delete" @click="handleDeleteClick(row)" />
          </div>
        </template>
      </Column>
    </DataTable>

    <Dialog
      :visible="!!deleteState"
      :header="deleteState ? `Delete &quot;${deleteState.name}&quot;?` : ''"
      :style="{ width: '32rem' }"
      @update:visible="(v) => !v && closeDeleteDialog()"
      modal
    >
      <template v-if="deleteState?.phase === 'confirm'">
        <p class="text-sm text-gray-700 dark:text-zinc-300">Are you sure you want to delete <strong>{{ deleteState.name }}</strong>? This cannot be undone.</p>
      </template>
      <template v-else-if="deleteState?.phase === 'reassign'">
        <div class="flex flex-col gap-3">
          <p class="text-sm text-gray-700 dark:text-zinc-300">
            <strong>{{ deleteState.affectedAssets.length }}</strong> asset(s) are in this category.
            You must move them to another category:
          </p>
          <Select
            :model-value="deleteState.reassignTo"
            :options="otherCategoryOptions"
            option-label="label"
            option-value="value"
            class="w-full"
            placeholder="Select category"
            @update:model-value="setReassignTo"
          />
          <p v-if="reassignError" class="text-xs text-red-600">{{ reassignError }}</p>
          <ul class="text-xs text-gray-500 dark:text-zinc-400 list-disc list-inside max-h-32 overflow-y-auto">
            <li v-for="a in deleteState.affectedAssets" :key="a.id">{{ a.name }}</li>
          </ul>
        </div>
      </template>
      <template #footer>
        <div class="flex justify-end gap-2">
          <Button label="Cancel" text size="small" @click="closeDeleteDialog" />
          <Button
            v-if="deleteState?.phase === 'reassign'"
            label="Delete & reassign"
            severity="danger"
            size="small"
            :loading="deleting"
            @click="handleReassignConfirm"
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

    <CategoryModal
      v-if="modal"
      :mode="modal.mode"
      :item="editItem"
      :saving="saving"
      :save-error="saveError"
      :on-save="handleSave"
      :on-cancel="() => { modal = null; saveError = null; }"
    />
  </div>
</template>
