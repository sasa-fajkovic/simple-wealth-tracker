<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { getPersons, createPerson, updatePerson, deletePerson, ApiError } from '../../api/client'
import type { Asset, Person, CreatePersonPayload, UpdatePersonPayload } from '../../types/index'
import PersonModal from './PersonModal.vue'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import Button from 'primevue/button'
import Message from 'primevue/message'
import Skeleton from 'primevue/skeleton'
import Dialog from 'primevue/dialog'
import Select from 'primevue/select'

type ModalState = { mode: 'create' } | { mode: 'edit'; item: Person }
type DeleteState =
  | { phase: 'confirm'; id: string; name: string }
  | { phase: 'reassign'; id: string; name: string; affectedAssets: Asset[]; reassignTo: string }

const rows = ref<Person[]>([])
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
    rows.value = await getPersons()
  } catch (e) {
    error.value = e instanceof ApiError ? e.message : 'Unexpected error'
  } finally {
    loading.value = false
  }
}, { immediate: true })

async function handleSave(payload: CreatePersonPayload | UpdatePersonPayload) {
  saving.value = true
  saveError.value = null
  try {
    if (modal.value?.mode === 'create') {
      await createPerson(payload as CreatePersonPayload)
    } else if (modal.value?.mode === 'edit') {
      await updatePerson((modal.value as { mode: 'edit'; item: Person }).item.id, payload as UpdatePersonPayload)
    }
    modal.value = null
    retryCount.value++
  } catch (e) {
    saveError.value = e instanceof ApiError ? e.message : 'Unexpected error'
  } finally {
    saving.value = false
  }
}

function handleDeleteClick(person: Person) {
  deleteState.value = { phase: 'confirm', id: person.id, name: person.name }
}

async function handleConfirm() {
  if (!deleteState.value) return
  deleting.value = true
  try {
    const result = await deletePerson(deleteState.value.id)
    if (result.ok) {
      deleteState.value = null
      retryCount.value++
    } else if (!result.ok && result.needs_reassign) {
      deleteState.value = {
        phase: 'reassign',
        id: deleteState.value.id,
        name: deleteState.value.name,
        affectedAssets: result.assets,
      reassignTo: rows.value.find(p => p.id !== deleteState.value!.id)?.id ?? '',
      }
    }
  } finally {
    deleting.value = false
  }
}

async function handleReassignConfirm() {
  if (!deleteState.value || deleteState.value.phase !== 'reassign') return
  deleting.value = true
  try {
    await deletePerson(deleteState.value.id, deleteState.value.reassignTo)
    deleteState.value = null
    retryCount.value++
  } finally {
    deleting.value = false
  }
}

const editItem = computed(() =>
  modal.value?.mode === 'edit' ? (modal.value as { mode: 'edit'; item: Person }).item : undefined
)

const otherPersonOptions = computed(() => {
  if (deleteState.value?.phase !== 'reassign') return []
  return rows.value
    .filter(p => p.id !== deleteState.value!.id)
    .map(p => ({ label: p.name, value: p.id }))
})

function setReassignTo(val: string) {
  if (deleteState.value?.phase === 'reassign') {
    deleteState.value = { ...deleteState.value, reassignTo: val }
  }
}
</script>

<template>
  <div>
    <div class="flex items-center justify-between mb-4">
      <h2 class="text-sm font-medium text-gray-700 dark:text-zinc-300">People</h2>
      <Button label="Add Person" icon="pi pi-plus" size="small" @click="modal = { mode: 'create' }" />
    </div>

    <div v-if="error" class="mb-4">
      <Message severity="error" class="w-full">Could not load persons: {{ error }}</Message>
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
      empty-message="No people yet. Click 'Add Person' to get started."
      striped-rows
      size="small"
    >
      <Column field="name" header="Name" sortable />
      <Column field="id" header="Slug (ID)" sortable />
      <Column header="Actions" style="width: 8rem">
        <template #body="{ data: row }">
          <div class="flex items-center gap-2">
            <Button icon="pi pi-pencil" text size="small" aria-label="Edit" @click="modal = { mode: 'edit', item: row }" />
            <Button icon="pi pi-trash" text size="small" severity="danger" aria-label="Delete"
              :disabled="rows.length === 1"
              v-tooltip.top="rows.length === 1 ? 'Cannot delete the only person — assets cannot be reassigned' : undefined"
              @click="handleDeleteClick(row)" />
          </div>
        </template>
      </Column>
    </DataTable>

    <Dialog
      :visible="!!deleteState"
      :header="deleteState ? `Delete &quot;${deleteState.name}&quot;?` : ''"
      :style="{ width: '32rem' }"
      @update:visible="(v) => !v && (deleteState = null)"
      modal
    >
      <template v-if="deleteState?.phase === 'confirm'">
        <p class="text-sm text-gray-700 dark:text-zinc-300">Are you sure you want to delete <strong>{{ deleteState.name }}</strong>? This cannot be undone.</p>
      </template>
      <template v-else-if="deleteState?.phase === 'reassign'">
        <div class="flex flex-col gap-3">
          <p class="text-sm text-gray-700 dark:text-zinc-300">
            <strong>{{ deleteState.affectedAssets.length }}</strong> asset(s) are assigned to this person.
            Choose who to reassign them to:
          </p>
          <Select
            :model-value="deleteState.reassignTo"
            :options="otherPersonOptions"
            option-label="label"
            option-value="value"
            class="w-full"
            placeholder="Select person"
            @update:model-value="setReassignTo"
          />
          <ul class="text-xs text-gray-500 dark:text-zinc-400 list-disc list-inside max-h-32 overflow-y-auto">
            <li v-for="a in deleteState.affectedAssets" :key="a.id">{{ a.name }}</li>
          </ul>
        </div>
      </template>
      <template #footer>
        <div class="flex justify-end gap-2">
          <Button label="Cancel" text size="small" @click="deleteState = null" />
          <Button
            v-if="deleteState?.phase === 'reassign'"
            label="Delete & reassign"
            severity="danger"
            size="small"
            :loading="deleting"
            :disabled="otherPersonOptions.length === 0 || !deleteState.reassignTo"
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

    <PersonModal
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
