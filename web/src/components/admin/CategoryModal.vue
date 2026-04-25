<script setup lang="ts">
import { ref, computed } from 'vue'
import type { Category, CreateCategoryPayload, UpdateCategoryPayload } from '../../types/index'
import Dialog from 'primevue/dialog'
import InputText from 'primevue/inputtext'
import InputNumber from 'primevue/inputnumber'
import ColorPicker from 'primevue/colorpicker'
import Checkbox from 'primevue/checkbox'
import Button from 'primevue/button'

function toSlug(name: string): string {
  return name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
}

const props = defineProps<{
  mode: 'create' | 'edit'
  item?: Category
  saving: boolean
  saveError: string | null
  onSave: (payload: CreateCategoryPayload | UpdateCategoryPayload) => void
  onCancel: () => void
}>()

const name = ref(props.mode === 'edit' ? props.item!.name : '')
const rateInput = ref<number | null>(
  props.mode === 'edit' ? props.item!.projected_yearly_growth * 100 : null
)
const color = ref(props.mode === 'edit' ? props.item!.color : '#6366f1')
const trackOnly = ref(props.mode === 'edit' ? (props.item!.track_only ?? false) : false)
const validationError = ref<string | null>(null)

const slugPreview = computed(() => props.mode === 'create' ? toSlug(name.value) : props.item!.id)
const colorHex = computed({
  get: () => color.value.replace('#', ''),
  set: (v: string) => { color.value = '#' + v },
})

function handleSubmit() {
  if (!name.value.trim()) {
    validationError.value = 'Name is required'
    return
  }
  if (rateInput.value === null) {
    validationError.value = 'Growth rate is required'
    return
  }
  validationError.value = null
  const storedRate = rateInput.value / 100
  if (props.mode === 'create') {
    props.onSave({
      id: slugPreview.value,
      name: name.value.trim(),
      projected_yearly_growth: storedRate,
      color: color.value,
      track_only: trackOnly.value || undefined,
    })
  } else {
    props.onSave({
      name: name.value.trim(),
      projected_yearly_growth: storedRate,
      color: color.value,
      track_only: trackOnly.value || undefined,
    })
  }
}
</script>

<template>
  <Dialog
    :header="mode === 'create' ? 'Add Category' : 'Edit Category'"
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
      <label class="block text-xs font-medium text-gray-500 dark:text-zinc-400 mb-1">Growth Rate %</label>
      <InputNumber v-model="rateInput" suffix=" %" :min-fraction-digits="0" :max-fraction-digits="4" class="w-full" placeholder="e.g. 8" />
    </div>
    <div class="mb-4">
      <label class="block text-xs font-medium text-gray-500 dark:text-zinc-400 mb-1">Color</label>
      <div class="flex items-center gap-3">
        <ColorPicker v-model="colorHex" format="hex" />
        <span class="text-sm font-medium text-gray-500 dark:text-zinc-400">{{ color }}</span>
      </div>
    </div>
    <div class="mb-4 flex items-center gap-3">
      <Checkbox v-model="trackOnly" input-id="track_only" :binary="true" />
      <label for="track_only" class="text-sm text-gray-700 dark:text-zinc-300 cursor-pointer select-none">
        Cash Inflow tracking only
        <span class="block text-xs text-gray-400 dark:text-zinc-500 font-normal">Excluded from net-worth chart; appears on the Cash Inflow page instead</span>
      </label>
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
