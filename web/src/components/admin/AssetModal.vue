<script setup lang="ts">
import { ref, computed } from 'vue'
import type { Asset, Category, Person, CreateAssetPayload, UpdateAssetPayload } from '../../types/index'
import Dialog from 'primevue/dialog'
import InputText from 'primevue/inputtext'
import InputNumber from 'primevue/inputnumber'
import Select from 'primevue/select'
import Button from 'primevue/button'

function toSlug(name: string): string {
  return name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
}

const props = defineProps<{
  mode: 'create' | 'edit'
  item?: Asset
  categories: Category[]
  persons?: Person[]
  saving: boolean
  saveError: string | null
  onSave: (payload: CreateAssetPayload | UpdateAssetPayload) => void
  onCancel: () => void
}>()

const name = ref(props.mode === 'edit' ? props.item!.name : '')
const categoryId = ref(props.mode === 'edit' ? props.item!.category_id : (props.categories[0]?.id ?? ''))
const personId = ref(props.mode === 'edit' ? props.item!.person_id : (props.persons?.[0]?.id ?? ''))
const rateInput = ref<number | null>(
  props.item?.projected_yearly_growth !== null && props.item?.projected_yearly_growth !== undefined
    ? props.item.projected_yearly_growth * 100
    : null
)
const location = ref(props.mode === 'edit' ? (props.item!.location ?? '') : '')
const notes = ref(props.mode === 'edit' ? (props.item!.notes ?? '') : '')
const validationError = ref<string | null>(null)

const slugPreview = computed(() => props.mode === 'create' ? toSlug(name.value) : props.item!.id)
const personOptions = computed(() => props.persons ?? [])

function handleSubmit() {
  if (!name.value.trim()) {
    validationError.value = 'Name is required'
    return
  }
  if (!categoryId.value) {
    validationError.value = 'Category is required'
    return
  }
  if (!personId.value) {
    validationError.value = 'Person is required'
    return
  }
  validationError.value = null
  const storedRate = rateInput.value !== null ? rateInput.value / 100 : null
  if (props.mode === 'create') {
    props.onSave({
      id: slugPreview.value,
      name: name.value.trim(),
      category_id: categoryId.value,
      projected_yearly_growth: storedRate,
      location: location.value.trim() || undefined,
      notes: notes.value.trim() || undefined,
      person_id: personId.value,
    })
  } else {
    props.onSave({
      name: name.value.trim(),
      category_id: categoryId.value,
      projected_yearly_growth: storedRate,
      location: location.value.trim() || undefined,
      notes: notes.value.trim() || undefined,
      person_id: personId.value,
    })
  }
}
</script>

<template>
  <Dialog
    :header="mode === 'create' ? 'Add Asset' : 'Edit Asset'"
    :visible="true"
    @update:visible="(v) => !v && onCancel()"
    :style="{ width: '32rem' }"
    modal
    :draggable="false"
  >
    <div class="mb-3">
      <label class="block text-xs font-medium text-gray-500 dark:text-zinc-400 mb-1">Name</label>
      <InputText v-model="name" class="w-full" />
    </div>
    <div class="mb-3">
      <label class="block text-xs font-medium text-gray-500 dark:text-zinc-400 mb-1">ID (slug) — read only</label>
      <input type="text" :value="slugPreview" readonly
        class="w-full bg-gray-50 dark:bg-zinc-950 cursor-not-allowed px-3 py-2 text-sm border border-gray-200 dark:border-zinc-700 rounded-md text-gray-500 dark:text-zinc-400" />
    </div>
    <div class="mb-3">
      <label class="block text-xs font-medium text-gray-500 dark:text-zinc-400 mb-1">Category</label>
      <Select v-model="categoryId" :options="categories" option-label="name" option-value="id" class="w-full" />
    </div>
    <div class="mb-3">
      <label class="block text-xs font-medium text-gray-500 dark:text-zinc-400 mb-1">Growth Rate % (optional — leave blank to inherit from category)</label>
      <InputNumber v-model="rateInput" suffix=" %" :min-fraction-digits="0" :max-fraction-digits="4" class="w-full" placeholder="e.g. 8" />
    </div>
    <div class="mb-3">
      <label class="block text-xs font-medium text-gray-500 dark:text-zinc-400 mb-1">Location (optional)</label>
      <InputText v-model="location" class="w-full" />
    </div>
    <div class="mb-3">
      <label class="block text-xs font-medium text-gray-500 dark:text-zinc-400 mb-1">Notes (optional)</label>
      <InputText v-model="notes" class="w-full" />
    </div>
    <div class="mb-3">
      <label class="block text-xs font-medium text-gray-500 dark:text-zinc-400 mb-1">Person</label>
      <Select v-model="personId" :options="personOptions" option-label="name" option-value="id" class="w-full" />
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
