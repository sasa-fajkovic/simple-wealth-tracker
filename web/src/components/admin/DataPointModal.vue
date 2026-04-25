<script setup lang="ts">
import { ref, computed } from 'vue'
import type { DataPoint, Asset, Person, CreateDataPointPayload, UpdateDataPointPayload } from '../../types/index'
import Dialog from 'primevue/dialog'
import InputText from 'primevue/inputtext'
import InputNumber from 'primevue/inputnumber'
import Select from 'primevue/select'
import Button from 'primevue/button'

const props = defineProps<{
  mode: 'create' | 'edit'
  item?: DataPoint
  assets: Asset[]
  persons: Person[]
  saving: boolean
  saveError: string | null
  onSave: (payload: CreateDataPointPayload | UpdateDataPointPayload) => void
  onCancel: () => void
}>()

// "Everyone" sentinel — empty string means no filter
const personFilter = ref<string>('')
const assetId = ref(props.mode === 'edit' ? props.item!.asset_id : '')
const yearMonth = ref(props.mode === 'edit' ? props.item!.year_month : '')
const value = ref<number | null>(props.mode === 'edit' ? props.item!.value : null)
const notes = ref(props.mode === 'edit' ? (props.item!.notes ?? '') : '')
const validationError = ref<string | null>(null)

const personFilterOptions = computed(() => [
  { id: '', name: 'Everyone' },
  ...props.persons,
])

const filteredAssets = computed(() =>
  personFilter.value === '' ? props.assets : props.assets.filter(a => a.person_id === personFilter.value)
)

function onPersonFilterChange() {
  // Reset asset selection when person filter changes (create mode only)
  if (props.mode === 'create') assetId.value = ''
}

function handleSubmit() {
  if (!assetId.value) {
    validationError.value = 'Please select an asset'
    return
  }
  if (value.value === null || value.value === undefined || !isFinite(value.value)) {
    validationError.value = 'Please enter a valid number'
    return
  }
  validationError.value = null
  props.onSave({
    asset_id: assetId.value,
    year_month: yearMonth.value,
    value: value.value,
    notes: notes.value.trim() || undefined,
  })
}
</script>

<template>
  <Dialog
    :header="mode === 'create' ? 'Add Data Point' : 'Edit Data Point'"
    :visible="true"
    @update:visible="(v) => !v && onCancel()"
    :style="{ width: '32rem' }"
    modal
    :draggable="false"
  >
    <template v-if="mode === 'create'">
      <div class="mb-3">
        <label class="block text-xs font-medium text-gray-500 dark:text-zinc-400 mb-1">Person</label>
        <Select
          v-model="personFilter"
          :options="personFilterOptions"
          option-label="name"
          option-value="id"
          class="w-full"
          @update:model-value="onPersonFilterChange"
        />
      </div>
    </template>
    <div class="mb-3">
      <label class="block text-xs font-medium text-gray-500 dark:text-zinc-400 mb-1">Asset</label>
      <Select
        v-model="assetId"
        :options="filteredAssets"
        option-label="name"
        option-value="id"
        placeholder="Select an asset…"
        :disabled="mode === 'edit'"
        class="w-full"
      />
    </div>
    <div class="mb-3">
      <label class="block text-xs font-medium text-gray-500 dark:text-zinc-400 mb-1">Month</label>
      <input
        type="month"
        v-model="yearMonth"
        class="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
        required
      />
    </div>
    <div class="mb-3">
      <label class="block text-xs font-medium text-gray-500 dark:text-zinc-400 mb-1">Value (EUR)</label>
      <InputNumber v-model="value" mode="decimal" :min-fraction-digits="0" :max-fraction-digits="0" :min="-999999999" class="w-full" />
    </div>
    <div class="mb-3">
      <label class="block text-xs font-medium text-gray-500 dark:text-zinc-400 mb-1">Notes (optional)</label>
      <InputText v-model="notes" class="w-full" />
    </div>
    <p v-if="validationError" class="text-xs text-red-600 mt-2">{{ validationError }}</p>
    <p v-if="saveError" class="text-xs text-red-600 mt-2">{{ saveError }}</p>
    <template #footer>
      <div class="flex justify-end gap-2">
        <Button label="Cancel" outlined @click="onCancel" type="button" />
        <Button :label="saving ? 'Saving…' : 'Save'" :disabled="saving" @click="handleSubmit" type="button" />
      </div>
    </template>
  </Dialog>
</template>
